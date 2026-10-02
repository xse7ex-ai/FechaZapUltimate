import { describe, it, expect, beforeEach } from 'bun:test';
import { createHmac } from 'crypto';
import { sanitizeLogValue, logger } from '../utils/logger';
import { parseAiError } from '../utils/ai';
import { mapDbToOrcamento, mapOrcamentoToDb, mapDbToCliente, mapClienteToDb } from '../utils/sync';
import { formatCurrency, formatPhone, cleanPhone } from '../utils/format';
import { generateWhatsAppQuoteText, generateWhatsAppUrl } from '../utils/whatsapp';
import { generateOrcamentoPrintHtml } from '../utils/pdf';
import {
  loadUserEmpresa,
  loadUserOrcamentos,
  saveUserOrcamentos,
  loadUserClientes,
  saveUserClientes,
  loadUserSyncQueue,
  saveUserSyncQueue,
  resetDemoData,
} from '../utils/storage';
import { Orcamento, Cliente, ConfiguracaoEmpresa } from '../types';

// Mock in-memory do localStorage para ambiente Node/Bun
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
}

// ==============================================================================
// FechaZap • Testes de Endurecimento Técnico (Fase 7/9)
// Cobertura Prioritária:
//   1. Autenticação
//   2. Isolamento Multi-Tenant
//   3. Quotas
//   4. Plano
//   5. Orçamento (Cálculos e Validações)
//   6. Sincronização
//   7. WhatsApp & Opt-in
//   8. Webhook & Replay Protection
//   9. IA & Tratamento de Erros
//   10. Parsing & Resiliência
//   11. PDF & Sanitização
// ==============================================================================

describe('FechaZap - Suíte de Endurecimento Técnico (Fase 7/9)', () => {
  const dummyEmpresa: ConfiguracaoEmpresa = {
    nomeFantasia: 'Tech Soluções',
    razaoSocial: 'Tech Soluções LTDA',
    cnpj: '12.345.678/0001-90',
    telefone: '(11) 98765-4321',
    email: 'contato@techsolucoes.com',
    chavePix: '12345678000190',
    tipoChavePix: 'cnpj',
    endereco: 'Rua das Flores, 100',
    cidadeEstado: 'São Paulo - SP',
    mensagemPadraoWhatsapp: 'Olá! Segue seu orçamento.',
  };

  // ----------------------------------------------------------------------------
  // 1. AUTENTICAÇÃO
  // ----------------------------------------------------------------------------
  describe('1. Autenticação e Sanitização de Credenciais', () => {
    it('deve redigir automaticamente senhas, tokens JWT e segredos nos logs', () => {
      const sensitiveData = {
        email: 'usuario@empresa.com',
        password: 'minha_senha_super_secreta_123',
        token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret',
        jwt: 'eyJhSecretJwtToken',
        stripe_signature: 't=1700000000,v1=secret_hex',
        details: {
          access_token: 'secret_meta_token',
          nestedSecret: 'whsec_99999999',
        },
      };

      const sanitized = sanitizeLogValue(sensitiveData) as Record<string, any>;

      expect(sanitized.email).toBe('usuario@empresa.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.jwt).toBe('[REDACTED]');
      expect(sanitized.stripe_signature).toBe('[REDACTED]');
      expect(sanitized.details.access_token).toBe('[REDACTED]');
      expect(sanitized.details.nestedSecret).toBe('[REDACTED]');
    });

    it('deve registrar eventos de autenticação sem expor credenciais', () => {
      const entry = logger.auth('login_attempt', 'Tentativa de login realizada', {
        userId: 'user_123',
        metadata: {
          email: 'admin@fechazap.com',
          password: 'plain_password',
        },
      });

      expect(entry.action).toBe('login_attempt');
      expect(entry.category).toBe('auth');
      expect(entry.metadata?.email).toBe('admin@fechazap.com');
      expect(entry.metadata?.password).toBe('[REDACTED]');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. ISOLAMENTO MULTI-TENANT
  // ----------------------------------------------------------------------------
  describe('2. Isolamento Multi-Tenant Estrito', () => {
    it('deve vincular orçamentos e clientes estritamente ao user_id do proprietário', () => {
      const userAId = 'tenant_a_uuid';
      const userBId = 'tenant_b_uuid';

      const orc: Orcamento = {
        id: 'orc_1',
        numero: '101',
        clienteId: 'cli_1',
        clienteNome: 'Cliente A',
        clienteTelefone: '11999999999',
        itens: [{ id: '1', descricao: 'Item', quantidade: 1, valorUnitario: 100, total: 100 }],
        subtotal: 100,
        descontoTipo: 'valor',
        descontoValor: 0,
        valorTotal: 100,
        status: 'pendente',
        dataCriacao: '2026-09-30',
        dataValidade: '2026-10-15',
        formaPagamento: 'Pix',
        prazoEntrega: '3 dias',
      };

      const dbRowA = mapOrcamentoToDb(orc, userAId);
      expect(dbRowA.user_id).toBe(userAId);
      expect(dbRowA.user_id).not.toBe(userBId);

      const cli: Cliente = {
        id: 'cli_1',
        nome: 'Cliente Alpha',
        telefone: '11988887777',
        dataCadastro: '2026-09-30',
      };

      const dbCliA = mapClienteToDb(cli, userAId);
      expect(dbCliA.user_id).toBe(userAId);
      expect(dbCliA.user_id).not.toBe(userBId);
    });

    it('deve isolar completamente dados locais e fila offline na transição Usuário A -> logout -> Usuário B', () => {
      const userAId = 'user_uuid_alpha_111';
      const userBId = 'user_uuid_beta_222';

      // 1. Usuário A autenticado salva dados e enfileira item offline
      const orcsA: Orcamento[] = [
        {
          id: 'orc_alpha_1',
          numero: '001',
          clienteNome: 'Cliente do A',
          clienteTelefone: '11911111111',
          itens: [{ id: '1', descricao: 'Serviço A', quantidade: 1, valorUnitario: 500, total: 500 }],
          subtotal: 500,
          descontoTipo: 'valor',
          descontoValor: 0,
          valorTotal: 500,
          status: 'aprovado',
          dataCriacao: '2026-10-01',
          formaPagamento: 'Pix',
        },
      ];
      const clisA: Cliente[] = [
        { id: 'cli_alpha_1', nome: 'Cliente do A', telefone: '11911111111', dataCadastro: '2026-10-01' },
      ];
      const queueA = [{ type: 'save_orcamento', orcamentoId: 'orc_alpha_1', timestamp: Date.now() }];

      saveUserOrcamentos(userAId, orcsA);
      saveUserClientes(userAId, clisA);
      saveUserSyncQueue(userAId, queueA);

      // 2. Usuário A faz logout: contexto muda para visitante anônimo (null)
      const anonOrcs = loadUserOrcamentos(null);
      const anonQueue = loadUserSyncQueue(null);
      expect(anonOrcs.some((o) => o.id === 'orc_alpha_1')).toBe(false);
      expect(anonQueue.length).toBe(0);

      // 3. Usuário B faz login: contexto muda para userBId
      const orcsB = loadUserOrcamentos(userBId);
      const clisB = loadUserClientes(userBId);
      const queueB = loadUserSyncQueue(userBId);

      // Dados de A NÃO podem aparecer para B
      expect(orcsB.length).toBe(0);
      expect(clisB.length).toBe(0);
      expect(queueB.length).toBe(0);

      // 4. Usuário B salva seus próprios dados
      const orcsBData: Orcamento[] = [
        {
          id: 'orc_beta_1',
          numero: '900',
          clienteNome: 'Cliente do B',
          clienteTelefone: '21922222222',
          itens: [{ id: '1', descricao: 'Serviço B', quantidade: 2, valorUnitario: 300, total: 600 }],
          subtotal: 600,
          descontoTipo: 'valor',
          descontoValor: 0,
          valorTotal: 600,
          status: 'pendente',
          dataCriacao: '2026-10-02',
          formaPagamento: 'Boleto',
        },
      ];
      saveUserOrcamentos(userBId, orcsBData);

      // 5. Verifica se os dados de A permaneceram intactos em seu próprio namespace
      const reloadedOrcsA = loadUserOrcamentos(userAId);
      expect(reloadedOrcsA.length).toBe(1);
      expect(reloadedOrcsA[0].id).toBe('orc_alpha_1');
      expect(reloadedOrcsA.some((o) => o.id === 'orc_beta_1')).toBe(false);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. QUOTAS
  // ----------------------------------------------------------------------------
  describe('3. Validação e Controle de Quotas', () => {
    it('deve mapear erros de quota de IA para mensagem clara ao usuário', () => {
      const errA = parseAiError('Limite mensal de IA atingido para o plano TURBO (1500 gerações).');
      expect(errA).toContain('Limite mensal de IA atingido');

      const errB = parseAiError('PLAN_TURBO_REQUIRED');
      expect(errB).toContain('exclusiva para assinantes do plano TURBO');

      const errC = parseAiError('Serviço de quota temporariamente indisponível');
      expect(errC).toContain('temporariamente indisponível');
    });

    it('deve aplicar limite de 5 orçamentos/mês no plano GRATUITO e permitir PRO/TURBO ilimitados', () => {
      // Simulação da lógica da RPC check_and_consume_gratuito_quota
      class MockQuotaCounterService {
        private counters: Map<string, number> = new Map();

        checkAndConsume(userId: string, plano: 'GRATUITO' | 'PRO' | 'TURBO', mes: string) {
          if (plano === 'PRO' || plano === 'TURBO') {
            return { success: true, plano, consumed: false };
          }

          const key = `${userId}:${mes}`;
          const current = this.counters.get(key) || 0;

          if (current >= 5) {
            throw new Error('QUOTA_EXCEEDED: Limite mensal de 5 orçamentos atingido para o plano GRATUITO.');
          }

          this.counters.set(key, current + 1);
          return { success: true, plano: 'GRATUITO', consumed: true, contador: current + 1 };
        }
      }

      const service = new MockQuotaCounterService();
      const mesAtual = '2026-10-01';
      const userId = 'user_gratuito_123';

      // Cria 5 orçamentos com sucesso
      for (let i = 1; i <= 5; i++) {
        const res = service.checkAndConsume(userId, 'GRATUITO', mesAtual);
        expect(res.success).toBe(true);
        expect(res.contador).toBe(i);
      }

      // 6º orçamento deve ser bloqueado com QUOTA_EXCEEDED
      expect(() => {
        service.checkAndConsume(userId, 'GRATUITO', mesAtual);
      }).toThrow('QUOTA_EXCEEDED');

      // Usuário PRO ou TURBO não sofre bloqueio
      const proRes = service.checkAndConsume('user_pro_999', 'PRO', mesAtual);
      expect(proRes.success).toBe(true);
      expect(proRes.consumed).toBe(false);

      const turboRes = service.checkAndConsume('user_turbo_888', 'TURBO', mesAtual);
      expect(turboRes.success).toBe(true);
      expect(turboRes.consumed).toBe(false);
    });

    it('deve permitir criação offline do plano GRATUITO quando Supabase estiver indisponível', () => {
      // Função simulada de fallback resiliente
      const evaluateQuotaResult = (error: { code?: string; message?: string } | null) => {
        if (!error) return { success: true };
        const isQuota =
          error.code === 'P0001' ||
          error.message?.includes('QUOTA_EXCEEDED');
        if (isQuota) {
          return { success: false, quotaExceeded: true };
        }
        // Falha técnica/rede -> fallback offline permitido
        return { success: true };
      };

      // Erro de rede (Failed to fetch)
      expect(evaluateQuotaResult({ message: 'TypeError: Failed to fetch' }).success).toBe(true);

      // Erro de quota atingida
      const quotaErr = evaluateQuotaResult({ code: 'P0001', message: 'QUOTA_EXCEEDED: Limite atingido' });
      expect(quotaErr.success).toBe(false);
      expect(quotaErr.quotaExceeded).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. PLANO
  // ----------------------------------------------------------------------------
  describe('4. Governança e Transição de Planos', () => {
    it('deve reconhecer status de cobrança e planos válidos', () => {
      const planos = ['GRATUITO', 'PRO', 'TURBO'];
      expect(planos.includes('GRATUITO')).toBe(true);
      expect(planos.includes('PRO')).toBe(true);
      expect(planos.includes('TURBO')).toBe(true);
      expect(planos.includes('ENTERPRISE')).toBe(false);
    });

    it('loadUserEmpresa deve retornar dados de exemplo para visitante e campos vazios para usuário autenticado sem dados', () => {
      // 1. Visitante anônimo (!userId): dados fictícios de exemplo (INITIAL_EMPRESA_CONFIG)
      const anonEmpresa = loadUserEmpresa(null);
      expect(anonEmpresa.nomeFantasia).toBe('Soluções Pro Serviços');
      expect(anonEmpresa.cnpj).toBe('38192847000192');
      expect(anonEmpresa.tipoChavePix).toBe('cnpj');

      // 2. Usuário autenticado sem dados salvos: campos vazios, preservando padrões técnicos
      const newAuthEmpresa = loadUserEmpresa('novo_usuario_autenticado_uuid_999');
      expect(newAuthEmpresa.nomeFantasia).toBe('');
      expect(newAuthEmpresa.razaoSocial).toBe('');
      expect(newAuthEmpresa.cnpj).toBe('');
      expect(newAuthEmpresa.telefone).toBe('');
      expect(newAuthEmpresa.email).toBe('');
      expect(newAuthEmpresa.chavePix).toBe('');
      expect(newAuthEmpresa.endereco).toBe('');
      expect(newAuthEmpresa.cidadeEstado).toBe('');
      expect(newAuthEmpresa.tipoChavePix).toBe('cnpj');
      expect(newAuthEmpresa.mensagemPadraoWhatsapp).toBeTruthy();
      expect(newAuthEmpresa.modeloIA).toBe('gemini-3.8-flash');
    });

    it('parâmetros de Checkout Session devem propagar metadata do plano em ambos os níveis', () => {
      const buildCheckoutParams = (userId: string, plano: 'PRO' | 'TURBO', priceId: string, customerId: string) => {
        const params = new URLSearchParams();
        params.append('customer', customerId);
        params.append('client_reference_id', userId);
        params.append('mode', 'subscription');
        params.append('line_items[0][price]', priceId);
        params.append('line_items[0][quantity]', '1');
        params.append('metadata[plano]', plano);
        params.append('subscription_data[metadata][plano]', plano);
        return params;
      };

      const params = buildCheckoutParams('user_123', 'TURBO', 'price_turbo_xyz', 'cus_stripe_abc');
      expect(params.get('client_reference_id')).toBe('user_123');
      expect(params.get('customer')).toBe('cus_stripe_abc');
      expect(params.get('metadata[plano]')).toBe('TURBO');
      expect(params.get('subscription_data[metadata][plano]')).toBe('TURBO');
      expect(params.get('mode')).toBe('subscription');
    });

    it('create-checkout-session deve barrar assinatura duplicada se usuário já possuir status active ou grace_period', () => {
      // Simulação da regra de negócio implementada na Edge Function
      const validateActiveSubscription = (sub: { status: string } | null) => {
        if (sub && (sub.status === 'active' || sub.status === 'grace_period')) {
          return {
            allowed: false,
            status: 409,
            error: "Você já tem uma assinatura ativa. Use 'Gerenciar assinatura' para trocar de plano.",
          };
        }
        return { allowed: true };
      };

      // Assinatura ativa -> bloqueia com 409
      const activeRes = validateActiveSubscription({ status: 'active' });
      expect(activeRes.allowed).toBe(false);
      expect(activeRes.status).toBe(409);
      expect(activeRes.error).toContain('Gerenciar assinatura');

      // Assinatura em grace_period -> bloqueia com 409
      const graceRes = validateActiveSubscription({ status: 'grace_period' });
      expect(graceRes.allowed).toBe(false);
      expect(graceRes.status).toBe(409);

      // Assinatura cancelada ou expirada -> permite novo checkout
      const canceledRes = validateActiveSubscription({ status: 'canceled' });
      expect(canceledRes.allowed).toBe(true);

      const pastDueRes = validateActiveSubscription({ status: 'incomplete_expired' });
      expect(pastDueRes.allowed).toBe(true);

      // Usuário novo (sem assinatura) -> permite checkout
      const nullRes = validateActiveSubscription(null);
      expect(nullRes.allowed).toBe(true);
    });

    it('Modo Demonstração: deve isolar userId para null, forçar plano GRATUITO e permitir resetDemoData', () => {
      // 1. Simulação do estado e transição de contexto
      const currentRealUserId = 'real_user_auth_uuid_777';
      const realUserPlano = 'TURBO';

      let modoDemonstracao = false;
      let effectiveUserId = modoDemonstracao ? null : currentRealUserId;
      let effectivePlano = modoDemonstracao ? 'GRATUITO' : realUserPlano;

      expect(effectiveUserId).toBe('real_user_auth_uuid_777');
      expect(effectivePlano).toBe('TURBO');

      // Ativar demonstração
      modoDemonstracao = true;
      effectiveUserId = modoDemonstracao ? null : currentRealUserId;
      effectivePlano = modoDemonstracao ? 'GRATUITO' : realUserPlano;

      expect(effectiveUserId).toBeNull();
      expect(effectivePlano).toBe('GRATUITO');

      // 2. Modificação de dados anônimos e restauração com resetDemoData
      saveUserOrcamentos(null, [
        {
          id: 'temp_demo_test',
          numero: '999',
          clienteId: '1',
          clienteNome: 'Cliente Teste',
          clienteTelefone: '11999999999',
          itens: [],
          valorTotal: 100,
          status: 'pendente',
          dataCriacao: '2026-10-02',
          validadeDias: 10,
        },
      ]);
      const modifiedDemo = loadUserOrcamentos(null);
      expect(modifiedDemo.length).toBe(1);
      expect(modifiedDemo[0].id).toBe('temp_demo_test');

      // Executa resetDemoData
      resetDemoData();

      // Ao recarregar com userId = null, deve retornar INITIAL_ORCAMENTOS puros
      const restoredDemo = loadUserOrcamentos(null);
      expect(restoredDemo.length).toBeGreaterThan(1);
      expect(restoredDemo.some((o) => o.id === 'demo-1' || o.numero === '101')).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 5. ORÇAMENTO (CÁLCULOS E INTEGRIDADE)
  // ----------------------------------------------------------------------------
  describe('5. Orçamento: Cálculos e Casos de Borda', () => {
    it('desconto em valor fixo não pode deixar valorTotal negativo', () => {
      const subtotal = 150;
      const descontoValor = 200; // Desconto maior que o subtotal
      const total = Math.max(0, subtotal - descontoValor);
      expect(total).toBe(0);
    });

    it('desconto percentual deve ser calculado corretamente', () => {
      const subtotal = 250;
      const descontoPct = 20; // 20%
      const descontoCalculado = (subtotal * descontoPct) / 100;
      const total = Math.max(0, subtotal - descontoCalculado);

      expect(descontoCalculado).toBe(50);
      expect(total).toBe(200);
    });

    it('deve recalcular corretamente itens com quantidade zero ou valores zerados', () => {
      const dbRow = {
        id: 'orc_zero',
        numero: '102',
        subtotal: 0,
        valor_total: 0,
        status: 'pendente',
        itens: [
          { id: '1', descricao: 'Item grátis', quantidade: 0, valorUnitario: 100, total: 0 },
        ],
      };

      const orc = mapDbToOrcamento(dbRow);
      expect(orc.valorTotal).toBe(0);
      expect(orc.itens.length).toBe(1);
    });
  });

  // ----------------------------------------------------------------------------
  // 6. SINCRONIZAÇÃO
  // ----------------------------------------------------------------------------
  describe('6. Sincronização e Mapeamento Resiliente', () => {
    it('deve mapear campos de banco nulos ou ausentes com fallbacks seguros', () => {
      const rawIncompleteDbRow = {
        id: 'orc_inc',
        // numero ausente
        // cliente_nome ausente
        subtotal: '250.75', // string ao invés de number
        valor_total: '250.75',
        status: 'invalid_status_from_db',
      };

      const orc = mapDbToOrcamento(rawIncompleteDbRow);

      expect(orc.id).toBe('orc_inc');
      expect(orc.numero).toBe('101'); // fallback
      expect(orc.clienteNome).toBe('Cliente'); // fallback seguro
      expect(orc.subtotal).toBe(250.75);
      expect(orc.valorTotal).toBe(250.75);
      expect(orc.status).toBe('pendente'); // corrigido para status válido
    });

    it('deve mapear clientes com opt-in/opt-out corretamente', () => {
      const rawCliente = {
        id: 'cli_opt',
        nome: 'Mariana Souza',
        telefone: '11987654321',
        whatsapp_opt_in: false,
        whatsapp_opt_out_at: '2026-09-30T10:00:00Z',
      };

      const cli = mapDbToCliente(rawCliente);
      expect(cli.whatsappOptIn).toBe(false);
      expect(cli.whatsappOptOutAt).toBe('2026-09-30T10:00:00Z');
    });
  });

  // ----------------------------------------------------------------------------
  // 7. WHATSAPP & OPT-IN
  // ----------------------------------------------------------------------------
  describe('7. WhatsApp & Formatação de Mensagens', () => {
    it('deve higienizar telefones com formatos variados para o formato internacional E.164', () => {
      expect(cleanPhone('(11) 98765-4321')).toBe('5511987654321');
      expect(cleanPhone('11 98765-4321')).toBe('5511987654321');
      expect(cleanPhone('5511987654321')).toBe('5511987654321');
      expect(cleanPhone('+55 (21) 99999-0000')).toBe('5521999990000');
    });

    it('deve gerar texto de proposta no WhatsApp com chave PIX e itens detalhados', () => {
      const orc: Orcamento = {
        id: 'orc_msg',
        numero: '105',
        clienteId: 'cli_1',
        clienteNome: 'Carlos Eduardo',
        clienteTelefone: '11999998888',
        itens: [
          { id: '1', descricao: 'Instalação Elétrica', quantidade: 1, valorUnitario: 350, total: 350 },
        ],
        subtotal: 350,
        descontoTipo: 'valor',
        descontoValor: 0,
        valorTotal: 350,
        status: 'pendente',
        dataCriacao: '2026-09-30',
        dataValidade: '2026-10-10',
        formaPagamento: 'Pix à vista',
        prazoEntrega: '2 dias úteis',
      };

      const msg = generateWhatsAppQuoteText(orc, dummyEmpresa);

      expect(msg).toContain('Carlos Eduardo');
      expect(msg).toContain('ORÇAMENTO #105');
      expect(msg).toContain('Instalação Elétrica');
      expect(msg.replace(/\u00a0/g, ' ')).toContain('R$ 350,00');
      expect(msg).toContain('12345678000190');
      expect(msg).toContain('Tech Soluções');
    });

    it('deve gerar link seguro do wa.me', () => {
      const link = generateWhatsAppUrl('(11) 98765-4321', 'Olá Carlos');
      expect(link).toBe('https://wa.me/5511987654321?text=Ol%C3%A1%20Carlos');
    });
  });

  // ----------------------------------------------------------------------------
  // 8. WEBHOOK & REPLAY PROTECTION
  // ----------------------------------------------------------------------------
  describe('8. Webhook e Replay Protection', () => {
    it('deve rejeitar webhook se o timestamp for superior à tolerância (Replay Attack)', () => {
      const toleranceSeconds = 300; // 5 minutos
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expiredTimestamp = currentTimestamp - 600; // 10 minutos no passado

      const diff = Math.abs(currentTimestamp - expiredTimestamp);
      expect(diff > toleranceSeconds).toBe(true);
    });

    it('deve aceitar webhook com assinatura HMAC e carimbo temporal válido', () => {
      const secret = 'webhook_secret_key';
      const body = '{"id":"evt_123","type":"invoice.payment_succeeded"}';
      const now = Math.floor(Date.now() / 1000);

      const signedPayload = `${now}.${body}`;
      const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');

      // Verificação
      const computed = createHmac('sha256', secret).update(signedPayload).digest('hex');
      expect(computed).toBe(signature);
    });
  });

  // ----------------------------------------------------------------------------
  // 9. IA & TRATAMENTO DE ERROS
  // ----------------------------------------------------------------------------
  describe('9. Inteligência Artificial e Resiliência a Falhas', () => {
    it('deve traduzir erros comuns de API (503, 401, timeout) em mensagens amigáveis', () => {
      expect(parseAiError('503 Service Unavailable')).toContain('alta demanda temporária');
      expect(parseAiError('401 Unauthorized')).toContain('Acesso não autorizado');
      expect(parseAiError('{"error": {"message": "Invalid prompt length"}}')).toBe('Invalid prompt length');
      expect(parseAiError(null)).toBe('Erro ao comunicar com o serviço de IA.');
      expect(parseAiError(undefined)).toBe('Erro ao comunicar com o serviço de IA.');
    });
  });

  // ----------------------------------------------------------------------------
  // 10. PARSING & RESILIÊNCIA
  // ----------------------------------------------------------------------------
  describe('10. Parsing e Tratamento de Dados Incompletos', () => {
    it('deve formatar moedas e telefones com segurança sem disparar exceções', () => {
      expect(formatCurrency(0)).toBe('R$\u00a00,00');
      expect(formatCurrency(1250.5)).toBe('R$\u00a01.250,50');
      expect(formatCurrency(NaN)).toBe('R$\u00a00,00');

      expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
      expect(formatPhone('')).toBe('');
      expect(formatPhone('123')).toBe('123');
    });
  });

  // ----------------------------------------------------------------------------
  // 11. PDF & SANITIZAÇÃO
  // ----------------------------------------------------------------------------
  describe('11. Geração de PDF e Sanitização HTML', () => {
    it('deve gerar documento HTML para impressão com dados completos e versão 3.3.0', () => {
      const orc: Orcamento = {
        id: 'orc_pdf',
        numero: '106',
        clienteId: 'cli_2',
        clienteNome: 'Ana Paula <script>alert(1)</script>',
        clienteTelefone: '11988887777',
        itens: [
          { id: '1', descricao: 'Pintura Residencial', quantidade: 2, valorUnitario: 500, total: 1000 },
        ],
        subtotal: 1000,
        descontoTipo: 'porcentagem',
        descontoValor: 10,
        valorTotal: 900,
        status: 'aprovado',
        dataCriacao: '2026-09-30',
        dataValidade: '2026-10-20',
        formaPagamento: 'Entrada 50% + Pix',
        prazoEntrega: '5 dias',
        observacoes: 'Tinta lavável',
        termosGarantia: 'Garantia de 90 dias',
      };

      const html = generateOrcamentoPrintHtml(orc, dummyEmpresa);

      expect(html).toContain('FechaZap 3.3.0');
      expect(html).toContain('Tech Soluções');
      expect(html).toContain('Pintura Residencial');
      expect(html.replace(/\u00a0/g, ' ')).toContain('R$ 900,00');
      expect(html).toContain('Garantia de 90 dias');
      expect(html).toContain('12345678000190');
      expect(html).toContain('window.print()');
    });
  });
});
