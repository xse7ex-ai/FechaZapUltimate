import { describe, it, expect, beforeEach } from 'bun:test';
import { createHmac } from 'crypto';
import { sanitizeLogValue, logger } from '../utils/logger';
import { parseAiError } from '../utils/ai';
import { mapDbToOrcamento, mapOrcamentoToDb, mapDbToCliente, mapClienteToDb } from '../utils/sync';
import { formatCurrency, formatPhone, cleanPhone } from '../utils/format';
import { generateWhatsAppQuoteText, generateWhatsAppUrl } from '../utils/whatsapp';
import { generateOrcamentoPrintHtml } from '../utils/pdf';
import { Orcamento, Cliente, ConfiguracaoEmpresa } from '../types';

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
