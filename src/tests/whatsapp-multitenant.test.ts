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
}

class MockWhatsAppWebhookService {
  private connections: MockConnection[] = [];
  private messages: MockMessage[] = [];
  private clients: MockClient[] = [];
  private appSecret: string;

  constructor(appSecret: string) {
    this.appSecret = appSecret;
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

        // 3. Tenant matching estrito por phone_number_id com status = 'active'
        const conn = this.connections.find(
          (c) => c.phoneNumberId === phoneNumberId && c.status === 'active'
        );

        if (!conn) {
          // Inativo, revogado ou inexistente -> descartar
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
            (c) => c.userId === conn.userId && c.telefone === fromRaw
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
            userId: conn.userId,
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
 * Simulação do Serviço de Follow-up Outbound
 */
class MockWhatsAppFollowupService {
  private connections: MockConnection[] = [];
  private clients: MockClient[] = [];
  private aiQuotaUsed: number = 0;

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
  }): Promise<{ success: boolean; code?: string; error?: string; fallbackUrl?: string }> {
    const { userId, clienteTelefone } = params;

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

    // 2. Verificação OBRIGATÓRIA de conexão WhatsApp ativa do tenant (Regra 10)
    const activeConn = this.connections.find(
      (c) => c.userId === userId && c.status === 'active'
    );

    if (!activeConn) {
      // Bloqueia com erro apropriado ANTES de debitar quota
      return {
        success: false,
        code: 'WHATSAPP_CONNECTION_REQUIRED',
        error: 'Conexão do WhatsApp comercial não encontrada ou inativa para este usuário.',
        fallbackUrl: `https://wa.me/${clienteTelefone}?text=Orcamento`,
      };
    }

    // 3. Debita quota apenas após validações
    this.aiQuotaUsed++;

    return {
      success: true,
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
});
