import { describe, it, expect, beforeEach } from 'bun:test';
import { createHmac } from 'crypto';

// ============================================================================
// Simulação e Verificação dos Componentes de WhatsApp Cloud API Multi-Tenant
// ============================================================================

/**
 * Validação de HMAC-SHA256 da Meta
 */
async function verifyMetaHmac(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;

  const expectedHex = parts[1].toLowerCase().trim();
  const computedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  return computedHex === expectedHex;
}

/**
 * Simulação do Roteador Webhook Multi-Tenant
 */
interface MockConnection {
  id: string;
  userId: string;
  phoneNumberId: string;
  status: 'active' | 'inactive' | 'revoked';
}

interface MockMessage {
  id: string;
  userId: string;
  phoneNumberId: string;
  clienteTelefone: string;
  corpo: string;
  waMessageId: string;
  status: string;
}

interface MockClient {
  id: string;
  userId: string;
  telefone: string;
  whatsappOptIn: boolean;
  whatsappOptOutAt?: string | null;
  lastInboundAt?: string;
  updatedAt?: string;
  createdAt?: string;
}

class MockWhatsAppWebhookService {
  private connections: MockConnection[] = [];
  private messages: MockMessage[] = [];
  private clients: MockClient[] = [];
  private appSecret: string;
  private centralPhoneNumberId: string | null = null;
  public lastRoutingStatus?: 'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS';

  constructor(appSecret: string, centralPhoneNumberId: string | null = null) {
    this.appSecret = appSecret;
    this.centralPhoneNumberId = centralPhoneNumberId;
  }

  setCentralPhoneNumberId(id: string | null) {
    this.centralPhoneNumberId = id;
  }

  addConnection(conn: MockConnection) {
    this.connections.push(conn);
  }

  addClient(client: MockClient) {
    this.clients.push(client);
  }

  getMessagesForUser(userId: string): MockMessage[] {
    return this.messages.filter((m) => m.userId === userId);
  }

  getClient(userId: string, telefone: string): MockClient | undefined {
    return this.clients.find((c) => c.userId === userId && c.telefone === telefone);
  }

  async processWebhook(
    rawBody: string,
    signatureHeader: string | null
  ): Promise<{ status: number; processed: number; error?: string }> {
    // 1. Falha fechada se secret ausente ou assinatura inválida
    if (!this.appSecret) {
      return { status: 500, processed: 0, error: 'Server configuration error: Webhook secret missing' };
    }

    const isValid = await verifyMetaHmac(rawBody, signatureHeader, this.appSecret);
    if (!isValid) {
      return { status: 403, processed: 0, error: 'Forbidden: Invalid webhook signature' };
    }

    const payload = JSON.parse(rawBody);
    let processed = 0;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;

        // 2. Sem phone_number_id -> descartar
        if (!phoneNumberId) {
          continue;
        }

        // 3. Roteamento Híbrido:
        // Prioridade MODO A: Conexão individual ativa
        const conn = this.connections.find(
          (c) => c.phoneNumberId === phoneNumberId && c.status === 'active'
        );

        let ownerUserId: string | null = null;

        if (conn) {
          ownerUserId = conn.userId;
        } else if (this.centralPhoneNumberId && phoneNumberId === this.centralPhoneNumberId) {
          // MODO B: Número central compartilhado do FechaZap
          const messages = value.messages || [];
          const candidateFrom = messages[0]?.from;
          if (!candidateFrom) continue;

          // Normalização completa: DDI+DDD+número
          const cleanPhoneHelper = (p: string) => {
            let digits = (p || '').replace(/\D/g, '');
            if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
              digits = `55${digits}`;
            }
            return digits;
          };

          const normalizedCandidateFrom = cleanPhoneHelper(candidateFrom);

          // Candidatos: Usuários que possuem cliente com telefone totalmente normalizado idêntico
          const matchingClients = this.clients.filter(
            (c) => cleanPhoneHelper(c.telefone) === normalizedCandidateFrom
          );

          const candidateUserIds = Array.from(new Set(matchingClients.map((c) => c.userId)));
          const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
          const now = Date.now();

          // Filtro de inatividade: descarta apenas quem não tem interação há mais de 12 meses
          const activeCandidates = candidateUserIds.filter((uid) => {
            const client = matchingClients.find((c) => c.userId === uid);
            const clientTime = client?.lastInboundAt
              ? new Date(client.lastInboundAt).getTime()
              : (client?.updatedAt
                ? new Date(client.updatedAt).getTime()
                : (client?.createdAt ? new Date(client.createdAt).getTime() : now));
            return (now - clientTime) <= TWELVE_MONTHS_MS;
          });

          if (activeCandidates.length === 0) {
            this.lastRoutingStatus = 'NOT_FOUND';
            console.log(JSON.stringify({
              event: 'whatsapp_central_routing',
              routing_status: 'NOT_FOUND',
              phone_number_id: phoneNumberId,
              timestamp: new Date().toISOString(),
              candidate_count: candidateUserIds.length,
              active_candidate_count: 0,
            }));
            continue;
          }

          if (activeCandidates.length === 1) {
            this.lastRoutingStatus = 'RESOLVED';
            ownerUserId = activeCandidates[0];
            console.log(JSON.stringify({
              event: 'whatsapp_central_routing',
              routing_status: 'RESOLVED',
              phone_number_id: phoneNumberId,
              timestamp: new Date().toISOString(),
              candidate_count: candidateUserIds.length,
              active_candidate_count: 1,
            }));
          } else {
            // Múltiplos candidatos ativos: OBRIGATORIAMENTE AMBIGUOUS,
            // independentemente de qual tenha o registro mais recente.
            this.lastRoutingStatus = 'AMBIGUOUS';
            console.log(JSON.stringify({
              event: 'whatsapp_central_routing',
              routing_status: 'AMBIGUOUS',
              phone_number_id: phoneNumberId,
              timestamp: new Date().toISOString(),
              candidate_count: candidateUserIds.length,
              active_candidate_count: activeCandidates.length,
            }));
            continue;
          }
        } else {
          // Inativo, revogado, inexistente ou canal desconhecido -> descartar
          continue;
        }

        if (!ownerUserId) {
          continue;
        }

        const messages = value.messages || [];
        for (const msg of messages) {
          const waMessageId = msg.id;
          const fromRaw = msg.from;
          if (!waMessageId || !fromRaw) continue;

          // Idempotência
          const exists = this.messages.some((m) => m.waMessageId === waMessageId);
          if (exists) continue;

          const corpoTexto = msg.text?.body || '';
          const upperCorpo = corpoTexto.trim().toUpperCase();

          // Opt-in / Opt-out
          const optOutKeywords = ['STOP', 'SAIR', 'PARAR', 'CANCELAR'];
          const optInKeywords = ['START', 'COMEÇAR', 'COMECAR', 'VOLTAR', 'SIM'];

          const client = this.clients.find(
            (c) => c.userId === ownerUserId && c.telefone === fromRaw
          );

          if (client) {
            client.lastInboundAt = new Date().toISOString();
            if (optOutKeywords.includes(upperCorpo)) {
              client.whatsappOptIn = false;
              client.whatsappOptOutAt = new Date().toISOString();
            } else if (optInKeywords.includes(upperCorpo)) {
              client.whatsappOptIn = true;
              client.whatsappOptOutAt = null;
            }
          }

          // Gravação isolada com user_id do tenant
          this.messages.push({
            id: `msg-${Date.now()}-${Math.random()}`,
            userId: ownerUserId,
            phoneNumberId,
            clienteTelefone: fromRaw,
            corpo: corpoTexto,
            waMessageId,
            status: 'delivered',
          });

          processed++;
        }
      }
    }

    return { status: 200, processed };
  }
}

/**
 * Simulação do Serviço de Follow-up Outbound (Modelo Híbrido)
 */
class MockWhatsAppFollowupService {
  private connections: MockConnection[] = [];
  private clients: MockClient[] = [];
  private aiQuotaUsed: number = 0;
  private centralPhoneNumberId: string | null = null;

  constructor(centralPhoneNumberId: string | null = null) {
    this.centralPhoneNumberId = centralPhoneNumberId;
  }

  setCentralPhoneNumberId(id: string | null) {
    this.centralPhoneNumberId = id;
  }

  addConnection(conn: MockConnection) {
    this.connections.push(conn);
  }

  addClient(client: MockClient) {
    this.clients.push(client);
  }

  getAiQuotaUsed(): number {
    return this.aiQuotaUsed;
  }

  async triggerFollowup(params: {
    userId: string;
    clienteTelefone: string;
    orcamentoId: string;
    phoneNumberId?: string;
  }): Promise<{ success: boolean; mode?: 'individual' | 'central'; effectivePhoneId?: string; code?: string; error?: string; fallbackUrl?: string }> {
    const { userId, clienteTelefone, phoneNumberId } = params;

    // 1. Verificação de opt-out do cliente
    const client = this.clients.find((c) => c.userId === userId && c.telefone === clienteTelefone);
    if (client && (client.whatsappOptIn === false || client.whatsappOptOutAt)) {
      return {
        success: false,
        code: 'CLIENT_OPTED_OUT',
        error: 'O cliente solicitou descadastro (opt-out).',
        fallbackUrl: `https://wa.me/${clienteTelefone}?text=Ola`,
      };
    }

    // 2. Modelo Híbrido: Individual com prioridade > Central compartilhado
    const activeConn = this.connections.find(
      (c) => c.userId === userId && c.status === 'active'
    );

    let effectivePhoneId = '';
    let mode: 'individual' | 'central' = 'central';

    if (activeConn) {
      // MODO A: Conexão individual do usuário tem prioridade
      if (phoneNumberId && phoneNumberId !== activeConn.phoneNumberId) {
        return {
          success: false,
          code: 'WHATSAPP_FORBIDDEN_PHONE_ID',
          error: 'O phone_number_id solicitado não pertence à conexão ativa do usuário autenticado.',
        };
      }
      effectivePhoneId = activeConn.phoneNumberId;
      mode = 'individual';
    } else {
      // MODO B: Fallback para WhatsApp Central Compartilhado
      if (!this.centralPhoneNumberId) {
        return {
          success: false,
          code: 'WHATSAPP_CONNECTION_REQUIRED',
          error: 'Conexão do WhatsApp comercial não encontrada ou inativa para este usuário.',
          fallbackUrl: `https://wa.me/${clienteTelefone}?text=Orcamento`,
        };
      }
      if (phoneNumberId && phoneNumberId !== this.centralPhoneNumberId) {
        return {
          success: false,
          code: 'WHATSAPP_FORBIDDEN_PHONE_ID',
          error: 'O phone_number_id solicitado não é autorizado.',
        };
      }
      effectivePhoneId = this.centralPhoneNumberId;
      mode = 'central';
    }

    // 3. Debita quota apenas após validações
    this.aiQuotaUsed++;

    return {
      success: true,
      mode,
      effectivePhoneId,
    };
  }
}

// ============================================================================
// SUÍTE DE TESTES: REQUISITO 10 (FASE 5/9)
// ============================================================================

describe('WhatsApp Cloud API Multi-Tenant - Validações da Fase 5/9', () => {
  const SECRET = 'meta_webhook_secret_998877';
  let webhookService: MockWhatsAppWebhookService;
  let followupService: MockWhatsAppFollowupService;

  beforeEach(() => {
    webhookService = new MockWhatsAppWebhookService(SECRET);
    followupService = new MockWhatsAppFollowupService();
  });

  // Teste 1: HMAC inválido → rejeitar (403)
  it('1. HMAC inválido → deve rejeitar a requisição com 403 Forbidden', async () => {
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
    });

    // Assinatura forjada ou inválida
    const invalidSignature = 'sha256=invalid_hex_hash_1234567890';
    const res = await webhookService.processWebhook(rawBody, invalidSignature);

    expect(res.status).toBe(403);
    expect(res.processed).toBe(0);
    expect(res.error).toContain('Forbidden');
  });

  // Teste 1b: HMAC válido → aceitar
  it('1b. HMAC válido → deve aceitar e processar', async () => {
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
    });

    const validHex = createHmac('sha256', SECRET).update(rawBody).digest('hex');
    const validSignature = `sha256=${validHex}`;
    const res = await webhookService.processWebhook(rawBody, validSignature);

    expect(res.status).toBe(200);
    expect(res.error).toBeUndefined();
  });

  // Teste 2: sem phone_number_id → descartar
  it('2. sem phone_number_id → deve descartar a mensagem sem inserir no banco', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                // metadata sem phone_number_id
                metadata: {},
                messages: [
                  {
                    id: 'wamid_sem_phone',
                    from: '5511999999999',
                    type: 'text',
                    text: { body: 'Olá sem canal' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const validHex = createHmac('sha256', SECRET).update(rawBody).digest('hex');
    const res = await webhookService.processWebhook(rawBody, `sha256=${validHex}`);

    expect(res.status).toBe(200);
    expect(res.processed).toBe(0);
  });

  // Teste 3: inativo / revogado → descartar
  it('3. inativo ou revogado → deve descartar a mensagem', async () => {
    // Registra conexão inativa para o canal
    webhookService.addConnection({
      id: 'conn-1',
      userId: 'user-tenant-1',
      phoneNumberId: 'phone_inativo_123',
      status: 'inactive',
    });

    // Registra conexão revogada
    webhookService.addConnection({
      id: 'conn-2',
      userId: 'user-tenant-2',
      phoneNumberId: 'phone_revogado_456',
      status: 'revoked',
    });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone_inativo_123' },
                messages: [
                  {
                    id: 'wamid_1',
                    from: '5511999999999',
                    type: 'text',
                    text: { body: 'Tentativa para canal inativo' },
                  },
                ],
              },
            },
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone_revogado_456' },
                messages: [
                  {
                    id: 'wamid_2',
                    from: '5511999999999',
                    type: 'text',
                    text: { body: 'Tentativa para canal revogado' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const validHex = createHmac('sha256', SECRET).update(rawBody).digest('hex');
    const res = await webhookService.processWebhook(rawBody, `sha256=${validHex}`);

    expect(res.status).toBe(200);
    expect(res.processed).toBe(0);
    expect(webhookService.getMessagesForUser('user-tenant-1').length).toBe(0);
    expect(webhookService.getMessagesForUser('user-tenant-2').length).toBe(0);
  });

  // Teste 4: cliente igual em A/B → separar (Isolamento Multi-Tenant)
  it('4. cliente igual em A e B → deve separar estritamente por phone_number_id sem cross-contamination', async () => {
    const tenantA_Id = 'user_tenant_A';
    const tenantB_Id = 'user_tenant_B';
    const phoneId_A = 'phone_number_id_A';
    const phoneId_B = 'phone_number_id_B';

    // Tenant A possui o número phoneId_A
    webhookService.addConnection({
      id: 'conn-A',
      userId: tenantA_Id,
      phoneNumberId: phoneId_A,
      status: 'active',
    });

    // Tenant B possui o número phoneId_B
    webhookService.addConnection({
      id: 'conn-B',
      userId: tenantB_Id,
      phoneNumberId: phoneId_B,
      status: 'active',
    });

    const mesmoCliente = '5511988887777';

    // O mesmo cliente envia mensagem para o Tenant A
    const payloadA = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: phoneId_A },
                messages: [
                  {
                    id: 'wamid_msg_para_A',
                    from: mesmoCliente,
                    type: 'text',
                    text: { body: 'Olá Prestador A, quanto fica a pintura?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // O mesmo cliente também envia mensagem para o Tenant B
    const payloadB = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: phoneId_B },
                messages: [
                  {
                    id: 'wamid_msg_para_B',
                    from: mesmoCliente,
                    type: 'text',
                    text: { body: 'Olá Prestador B, faz orçamento de gesso?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // Processa mensagem para Tenant A
    const rawA = JSON.stringify(payloadA);
    const sigA = `sha256=${createHmac('sha256', SECRET).update(rawA).digest('hex')}`;
    await webhookService.processWebhook(rawA, sigA);

    // Processa mensagem para Tenant B
    const rawB = JSON.stringify(payloadB);
    const sigB = `sha256=${createHmac('sha256', SECRET).update(rawB).digest('hex')}`;
    await webhookService.processWebhook(rawB, sigB);

    // Validações de isolamento estrito
    const msgsA = webhookService.getMessagesForUser(tenantA_Id);
    const msgsB = webhookService.getMessagesForUser(tenantB_Id);

    expect(msgsA.length).toBe(1);
    expect(msgsA[0].corpo).toContain('Prestador A');
    expect(msgsA[0].phoneNumberId).toBe(phoneId_A);
    expect(msgsA[0].userId).toBe(tenantA_Id);

    expect(msgsB.length).toBe(1);
    expect(msgsB[0].corpo).toContain('Prestador B');
    expect(msgsB[0].phoneNumberId).toBe(phoneId_B);
    expect(msgsB[0].userId).toBe(tenantB_Id);

    // Garante que Tenant A NUNCA veja a mensagem do Tenant B e vice-versa
    expect(msgsA.some((m) => m.userId === tenantB_Id)).toBe(false);
    expect(msgsB.some((m) => m.userId === tenantA_Id)).toBe(false);
  });

  // Teste 5: sem conexão outbound → erro apropriado (WHATSAPP_CONNECTION_REQUIRED)
  it('5. sem conexão outbound → deve retornar erro apropriado sem consumir quota', async () => {
    const userIdSemConexao = 'user_sem_whatsapp';

    const res = await followupService.triggerFollowup({
      userId: userIdSemConexao,
      clienteTelefone: '5511999991111',
      orcamentoId: 'orc-123',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('WHATSAPP_CONNECTION_REQUIRED');
    expect(res.error).toContain('Conexão do WhatsApp comercial não encontrada');
    expect(res.fallbackUrl).toContain('https://wa.me/');
    // Garante que quota de IA NÃO foi consumida
    expect(followupService.getAiQuotaUsed()).toBe(0);
  });

  // Teste 6: Tratamento de Opt-out no webhook (STOP/SAIR/PARAR/CANCELAR)
  it('6. Opt-out → palavra-chave "SAIR" deve desativar opt-in do cliente', async () => {
    const tenantId = 'user_tenant_X';
    const phoneId = 'phone_tenant_X';
    const clientPhone = '5511977776666';

    webhookService.addConnection({
      id: 'conn-X',
      userId: tenantId,
      phoneNumberId: phoneId,
      status: 'active',
    });

    webhookService.addClient({
      id: 'cli-1',
      userId: tenantId,
      telefone: clientPhone,
      whatsappOptIn: true,
      whatsappOptOutAt: null,
    });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: phoneId },
                messages: [
                  {
                    id: 'wamid_opt_out',
                    from: clientPhone,
                    type: 'text',
                    text: { body: 'SAIR' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const raw = JSON.stringify(payload);
    const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
    await webhookService.processWebhook(raw, sig);

    const client = webhookService.getClient(tenantId, clientPhone);
    expect(client?.whatsappOptIn).toBe(false);
    expect(client?.whatsappOptOutAt).toBeTruthy();
  });

  // ============================================================================
  // SUÍTE ADICIONAL: MODELO HÍBRIDO (INDIVIDUAL > CENTRAL) & FALHA SEGURA
  // ============================================================================
  describe('Modelo Híbrido (Individual vs Central) & Segurança de Ambiguidade', () => {
    const CENTRAL_ID = 'central_fechazap_shared_106934522435791';

    it('7. Outbound: usuário com conexão individual ativa DEVE priorizar sua conexão individual', async () => {
      const service = new MockWhatsAppFollowupService(CENTRAL_ID);
      service.addConnection({
        id: 'conn-indiv-1',
        userId: 'user-individual',
        phoneNumberId: 'phone-individual-99',
        status: 'active',
      });

      const res = await service.triggerFollowup({
        userId: 'user-individual',
        clienteTelefone: '5511999990001',
        orcamentoId: 'orc-indiv-1',
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('individual');
      expect(res.effectivePhoneId).toBe('phone-individual-99');
    });

    it('8. Outbound: usuário SEM conexão individual ativa DEVE usar o WhatsApp central autorizado', async () => {
      const service = new MockWhatsAppFollowupService(CENTRAL_ID);

      const res = await service.triggerFollowup({
        userId: 'user-sem-conexao-propria',
        clienteTelefone: '5511999990002',
        orcamentoId: 'orc-central-1',
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('central');
      expect(res.effectivePhoneId).toBe(CENTRAL_ID);
    });

    it('9. Outbound: envio com phone_number_id forjado ou pertencente a outro canal deve ser bloqueado com 403', async () => {
      const service = new MockWhatsAppFollowupService(CENTRAL_ID);
      service.addConnection({
        id: 'conn-indiv-2',
        userId: 'user-legitimo',
        phoneNumberId: 'phone-legitimo-11',
        status: 'active',
      });

      // Usuário tentando forçar um phone_number_id diferente de sua conexão ativa
      const res = await service.triggerFollowup({
        userId: 'user-legitimo',
        clienteTelefone: '5511999990003',
        orcamentoId: 'orc-forged-1',
        phoneNumberId: 'phone-de-outro-usuario-999',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('WHATSAPP_FORBIDDEN_PHONE_ID');
    });

    it('10. Inbound: mensagem no número central compartilhado é entregue ao prestador único que atende o cliente', async () => {
      const webService = new MockWhatsAppWebhookService(SECRET, CENTRAL_ID);
      const userUnico = 'user-prestador-pedro';
      const clienteFone = '5511955554444';

      webService.addClient({
        id: 'cli-pedro-1',
        userId: userUnico,
        telefone: clienteFone,
        whatsappOptIn: true,
      });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: CENTRAL_ID },
                  messages: [
                    {
                      id: 'wamid_central_1',
                      from: clienteFone,
                      type: 'text',
                      text: { body: 'Aprovado o orçamento!' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
      const res = await webService.processWebhook(raw, sig);

      expect(res.status).toBe(200);
      expect(res.processed).toBe(1);
      const msgs = webService.getMessagesForUser(userUnico);
      expect(msgs.length).toBe(1);
      expect(msgs[0].corpo).toBe('Aprovado o orçamento!');
    });

    it('11. Inbound: ambiguidade no número compartilhado (múltiplos prestadores com mesmo cliente e sem remetente recente) resulta em falha segura', async () => {
      const webService = new MockWhatsAppWebhookService(SECRET, CENTRAL_ID);
      const user1 = 'user-prestador-1';
      const user2 = 'user-prestador-2';
      const clienteCompartilhado = '5511988880000';

      // Ambos os prestadores têm o mesmo cliente cadastrado
      webService.addClient({ id: 'c1', userId: user1, telefone: clienteCompartilhado, whatsappOptIn: true });
      webService.addClient({ id: 'c2', userId: user2, telefone: clienteCompartilhado, whatsappOptIn: true });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: CENTRAL_ID },
                  messages: [
                    {
                      id: 'wamid_ambiguo_1',
                      from: clienteCompartilhado,
                      type: 'text',
                      text: { body: 'Oi, tenho interesse' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
      const res = await webService.processWebhook(raw, sig);

      expect(res.status).toBe(200);
      expect(res.processed).toBe(0); // Falha fechada: mensagem NÃO é processada para evitar atribuição incorreta
      expect(webService.getMessagesForUser(user1).length).toBe(0);
      expect(webService.getMessagesForUser(user2).length).toBe(0);
    });

    it('12. Inbound: mensagem para canal desconhecido (nem individual nem central) é descartada com segurança', async () => {
      const webService = new MockWhatsAppWebhookService(SECRET, CENTRAL_ID);
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: 'phone_desconhecido_total_999' },
                  messages: [
                    {
                      id: 'wamid_desconhecido',
                      from: '5511999991234',
                      type: 'text',
                      text: { body: 'Tentativa em canal desconhecido' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
      const res = await webService.processWebhook(raw, sig);

      expect(res.status).toBe(200);
      expect(res.processed).toBe(0);
    });

    it('13. Inbound: candidato exige telefone totalmente normalizado (DDI+DDD+número) e não apenas últimos dígitos', async () => {
      const webService = new MockWhatsAppWebhookService(SECRET, CENTRAL_ID);
      const userSp = 'user-sp';
      // Cadastra cliente com DDD 21 (Rio de Janeiro)
      webService.addClient({ id: 'c-rj', userId: userSp, telefone: '5521999998888', whatsappOptIn: true });

      // Mensagem recebida de um telefone com DDD 11 (São Paulo) com os mesmos últimos dígitos
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: CENTRAL_ID },
                  messages: [
                    {
                      id: 'wamid_diff_ddd',
                      from: '5511999998888',
                      type: 'text',
                      text: { body: 'Olá SP' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
      const res = await webService.processWebhook(raw, sig);

      expect(res.status).toBe(200);
      expect(res.processed).toBe(0); // Não deve fazer match de DDD 21 com DDD 11!
      expect(webService.lastRoutingStatus).toBe('NOT_FOUND');
    });

    it('14. Inbound: candidato inativo há mais de 12 meses é descartado, resolvendo o candidato ativo remanescente', async () => {
      const webService = new MockWhatsAppWebhookService(SECRET, CENTRAL_ID);
      const userAtivo = 'user-ativo';
      const userInativo = 'user-inativo';
      const targetPhone = '5511977770000';

      const catorzeMesesAtras = new Date(Date.now() - 14 * 30 * 24 * 60 * 60 * 1000).toISOString();
      const umMesAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Candidato 1 inativo (> 12 meses)
      webService.addClient({
        id: 'c-old',
        userId: userInativo,
        telefone: targetPhone,
        whatsappOptIn: true,
        lastInboundAt: catorzeMesesAtras,
      });

      // Candidato 2 ativo (< 12 meses)
      webService.addClient({
        id: 'c-new',
        userId: userAtivo,
        telefone: targetPhone,
        whatsappOptIn: true,
        lastInboundAt: umMesAtras,
      });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: CENTRAL_ID },
                  messages: [
                    {
                      id: 'wamid_inactivity_filter',
                      from: targetPhone,
                      type: 'text',
                      text: { body: 'Mensagem para prestador' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
      const res = await webService.processWebhook(raw, sig);

      expect(res.status).toBe(200);
      expect(res.processed).toBe(1);
      expect(webService.lastRoutingStatus).toBe('RESOLVED');
      expect(webService.getMessagesForUser(userAtivo).length).toBe(1);
      expect(webService.getMessagesForUser(userInativo).length).toBe(0);
    });

    it('15. Inbound: recência NÃO desempata dois candidatos ativos (resultado é obrigatoriamente AMBIGUOUS)', async () => {
      const webService = new MockWhatsAppWebhookService(SECRET, CENTRAL_ID);
      const userRecent = 'user-ontem';
      const userOlder = 'user-dois-meses';
      const targetPhone = '5511966660000';

      const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const doisMesesAtras = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      // Candidato A interagiu há 2 dias (ativo)
      webService.addClient({
        id: 'c-a',
        userId: userRecent,
        telefone: targetPhone,
        whatsappOptIn: true,
        lastInboundAt: doisDiasAtras,
      });

      // Candidato B interagiu há 2 meses (também ativo, <= 12 meses)
      webService.addClient({
        id: 'c-b',
        userId: userOlder,
        telefone: targetPhone,
        whatsappOptIn: true,
        lastInboundAt: doisMesesAtras,
      });

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: CENTRAL_ID },
                  messages: [
                    {
                      id: 'wamid_two_active',
                      from: targetPhone,
                      type: 'text',
                      text: { body: 'Dúvida geral' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
      const res = await webService.processWebhook(raw, sig);

      expect(res.status).toBe(200);
      expect(res.processed).toBe(0); // NUNCA deve atribuir a A só porque A é mais recente!
      expect(webService.lastRoutingStatus).toBe('AMBIGUOUS');
      expect(webService.getMessagesForUser(userRecent).length).toBe(0);
      expect(webService.getMessagesForUser(userOlder).length).toBe(0);
    });
  });
});
