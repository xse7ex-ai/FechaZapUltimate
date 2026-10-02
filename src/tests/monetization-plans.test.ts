import { describe, it, expect, beforeEach } from 'bun:test';
import { createHmac } from 'crypto';

// ==============================================================================
// FechaZap • Testes da Fase 6/9: Planos, Monetização, Anti-Tampering & Stripe
// ==============================================================================

type TipoPlano = 'GRATUITO' | 'PRO' | 'TURBO';
type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'grace_period';

interface MockUserProfile {
  id: string;
  email: string;
  nome: string;
  plano: TipoPlano;
  role: 'authenticated' | 'service_role';
}

interface MockSubscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plano: TipoPlano;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  gracePeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
}

interface MockOrcamento {
  id: string;
  userId: string;
  numero: string;
  createdAt: Date;
}

interface MockAiUsage {
  id: string;
  userId: string;
  tipoOperacao: string;
  mesReferencia: string;
}

/**
 * Simulação do Motor de Banco de Dados PostgreSQL do FechaZap
 * Espelha rigorosamente as regras de schema.sql e 20260929_plans_monetization_stripe.sql
 */
class MockPostgreSQLDatabase {
  public profiles = new Map<string, MockUserProfile>();
  public subscriptions = new Map<string, MockSubscription>();
  public orcamentos: MockOrcamento[] = [];
  public aiUsage: MockAiUsage[] = [];
  public processedStripeEvents = new Set<string>();

  public reset() {
    this.profiles.clear();
    this.subscriptions.clear();
    this.orcamentos = [];
    this.aiUsage = [];
    this.processedStripeEvents.clear();
  }

  public seedUser(id: string, email: string, plano: TipoPlano = 'GRATUITO'): MockUserProfile {
    const user: MockUserProfile = {
      id,
      email,
      nome: 'Usuário Teste',
      plano,
      role: 'authenticated',
    };
    this.profiles.set(id, user);
    return user;
  }

  /**
   * Espelha a função calculate_effective_user_plan(user_id) do PostgreSQL
   */
  public calculateEffectivePlan(userId: string): TipoPlano {
    const sub = Array.from(this.subscriptions.values())
      .filter((s) => s.userId === userId)
      .pop();

    if (!sub) return 'GRATUITO';

    const now = new Date();

    if (sub.status === 'active' || sub.status === 'trialing') {
      return sub.plano;
    }

    if (
      sub.status === 'grace_period' ||
      (sub.status === 'past_due' && sub.gracePeriodEnd && sub.gracePeriodEnd > now)
    ) {
      return sub.plano;
    }

    return 'GRATUITO';
  }

  /**
   * Espelha o trigger protect_profile_plan_update() do PostgreSQL
   * Impede alteração da coluna 'plano' por usuários comuns (role != 'service_role')
   */
  public updateProfileFromFrontend(
    userId: string,
    updates: Partial<MockUserProfile>,
    callerRole: 'authenticated' | 'service_role' = 'authenticated'
  ): { success: boolean; profile: MockUserProfile; rejectedField?: string } {
    const current = this.profiles.get(userId);
    if (!current) throw new Error('Usuário não encontrado');

    const updated = { ...current };

    if (updates.nome) updated.nome = updates.nome;

    // Defesa em profundidade: Se o frontend tentar alterar o plano sem ser service_role
    if (updates.plano && updates.plano !== current.plano) {
      if (callerRole !== 'service_role') {
        // Trigger PostgreSQL reverte NEW.plano := OLD.plano
        return {
          success: false,
          profile: current,
          rejectedField: 'plano',
        };
      }
      updated.plano = updates.plano;
    }

    this.profiles.set(userId, updated);
    return { success: true, profile: updated };
  }

  /**
   * Espelha o trigger enforce_orcamento_quota() do PostgreSQL
   * GRATUITO: Máximo 5 orçamentos por mês corrente
   * PRO e TURBO: Ilimitado
   */
  public insertOrcamento(
    userId: string,
    numero: string,
    now = new Date()
  ): { allowed: boolean; error?: string; orcamento?: MockOrcamento } {
    const effectivePlan = this.calculateEffectivePlan(userId);
    const mesAtual = now.toISOString().slice(0, 7);

    if (effectivePlan === 'GRATUITO') {
      const countNoMes = this.orcamentos.filter(
        (o) => o.userId === userId && o.createdAt.toISOString().slice(0, 7) === mesAtual
      ).length;

      if (countNoMes >= 5) {
        return {
          allowed: false,
          error:
            'QUOTA_EXCEEDED: Limite mensal de 5 orçamentos atingido para o plano GRATUITO. Faça upgrade para PRO ou TURBO.',
        };
      }
    }

    const orc: MockOrcamento = {
      id: `orc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      numero,
      createdAt: now,
    };
    this.orcamentos.push(orc);
    return { allowed: true, orcamento: orc };
  }

  /**
   * Espelha a procedure consume_ai_quota() do PostgreSQL
   * GRATUITO: 0 créditos
   * PRO: 0 créditos no backend
   * TURBO: 1500 créditos por mês
   */
  public consumeAiQuota(
    userId: string,
    tipoOperacao: string,
    now = new Date()
  ): { allowed: boolean; used: number; limit: number; error?: string } {
    const effectivePlan = this.calculateEffectivePlan(userId);
    const mesAtual = now.toISOString().slice(0, 7);

    const limit = effectivePlan === 'TURBO' ? 1500 : 0;

    if (limit <= 0) {
      return {
        allowed: false,
        used: 0,
        limit: 0,
        error: 'A Inteligência Artificial é exclusiva para assinantes do plano TURBO.',
      };
    }

    const currentUsed = this.aiUsage.filter(
      (a) => a.userId === userId && a.mesReferencia === mesAtual
    ).length;

    if (currentUsed >= limit) {
      return {
        allowed: false,
        used: currentUsed,
        limit,
        error: 'Limite mensal de IA atingido para o plano TURBO (1500 requisições).',
      };
    }

    this.aiUsage.push({
      id: `ai_${Date.now()}`,
      userId,
      tipoOperacao,
      mesReferencia: mesAtual,
    });

    return {
      allowed: true,
      used: currentUsed + 1,
      limit,
    };
  }

  /**
   * Simulação da Edge Function fecha-ia
   * Ignora explicitamente qualquer parâmetro de plano enviado pelo frontend
   */
  public invokeFechaIa(
    tokenUserId: string,
    body: { action: string; clientSentPlan?: string }
  ): { status: number; success: boolean; error?: string } {
    // Backend ignora body.clientSentPlan e consulta o banco
    const plan = this.calculateEffectivePlan(tokenUserId);

    if (plan !== 'TURBO') {
      return {
        status: 403,
        success: false,
        error: 'A Inteligência Artificial é exclusiva para assinantes do plano TURBO.',
      };
    }

    const quotaRes = this.consumeAiQuota(tokenUserId, body.action);
    if (!quotaRes.allowed) {
      return {
        status: 429,
        success: false,
        error: quotaRes.error,
      };
    }

    return {
      status: 200,
      success: true,
    };
  }

  /**
   * Processamento de Webhooks do Stripe (espelha stripe-webhook/index.ts)
   */
  public processStripeWebhook(
    rawBody: string,
    sigHeader: string,
    webhookSecret: string
  ): { status: number; received?: boolean; error?: string } {
    // 1. Validação de Assinatura HMAC
    const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, item) => {
      const [k, v] = item.split('=');
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature || !webhookSecret) {
      return { status: 401, error: 'Assinatura inválida.' };
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

    if (computedSig !== signature) {
      return { status: 401, error: 'HMAC signature mismatch.' };
    }

    const event = JSON.parse(rawBody);

    // 2. Idempotência
    if (this.processedStripeEvents.has(event.id)) {
      return { status: 200, received: true };
    }
    this.processedStripeEvents.add(event.id);

    const obj = event.data?.object || {};

    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = obj.client_reference_id;
        const targetPlan = (obj.metadata?.plano || 'PRO') as TipoPlano;
        this.subscriptions.set(obj.subscription, {
          id: `sub_${Date.now()}`,
          userId,
          stripeCustomerId: obj.customer,
          stripeSubscriptionId: obj.subscription,
          plano: targetPlan,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          cancelAtPeriodEnd: false,
        });
        // Atualiza perfil authoritative
        const profile = this.profiles.get(userId);
        if (profile) profile.plano = targetPlan;
        break;
      }

      case 'customer.subscription.updated': {
        const sub = this.subscriptions.get(obj.id);
        if (sub) {
          sub.status = obj.status;
          if (obj.metadata?.plano) sub.plano = obj.metadata.plano;
          if (obj.status === 'past_due') {
            sub.gracePeriodEnd = new Date(Date.now() + 5 * 86400000);
          }
          const eff = this.calculateEffectivePlan(sub.userId);
          const p = this.profiles.get(sub.userId);
          if (p) p.plano = eff;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = this.subscriptions.get(obj.id);
        if (sub) {
          sub.status = 'canceled';
          const eff = this.calculateEffectivePlan(sub.userId);
          const p = this.profiles.get(sub.userId);
          if (p) p.plano = eff; // Reverte para GRATUITO
        }
        break;
      }
    }

    return { status: 200, received: true };
  }
}

// ==============================================================================
// Suíte de Testes
// ==============================================================================

describe('FechaZap - Monetização, Planos e Stripe Architecture (Fase 6/9)', () => {
  let db: MockPostgreSQLDatabase;
  const webhookSecret = 'whsec_test_secret_1234567890';

  beforeEach(() => {
    db = new MockPostgreSQLDatabase();
  });

  function signStripePayload(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${v1}`;
  }

  // ----------------------------------------------------------------------------
  // 1. Verificação do Plano GRATUITO
  // ----------------------------------------------------------------------------
  describe('Plano GRATUITO (Experimentar)', () => {
    it('deve permitir criar até 5 orçamentos por mês e rejeitar o 6º estritamente', () => {
      const user = db.seedUser('user-free', 'free@fechazap.com', 'GRATUITO');

      // Cria 5 orçamentos no mês
      for (let i = 1; i <= 5; i++) {
        const res = db.insertOrcamento(user.id, `10${i}`);
        expect(res.allowed).toBe(true);
        expect(res.orcamento).toBeDefined();
      }

      // Tentativa de criar o 6º orçamento
      const res6 = db.insertOrcamento(user.id, '106');
      expect(res6.allowed).toBe(false);
      expect(res6.error).toContain('QUOTA_EXCEEDED');
      expect(res6.error).toContain('Limite mensal de 5 orçamentos');
    });

    it('deve bloquear qualquer requisição à IA no backend (0 créditos)', () => {
      const user = db.seedUser('user-free', 'free@fechazap.com', 'GRATUITO');

      const quotaRes = db.consumeAiQuota(user.id, 'gerar_orcamento');
      expect(quotaRes.allowed).toBe(false);
      expect(quotaRes.limit).toBe(0);
      expect(quotaRes.error).toContain('exclusiva para assinantes do plano TURBO');

      const apiRes = db.invokeFechaIa(user.id, { action: 'gerar_orcamento' });
      expect(apiRes.status).toBe(403);
      expect(apiRes.success).toBe(false);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Verificação do Plano PRO
  // ----------------------------------------------------------------------------
  describe('Plano PRO (Uso Profissional)', () => {
    it('deve permitir orçamentos ilimitados sem travar no 6º orçamento', () => {
      const user = db.seedUser('user-pro', 'pro@fechazap.com', 'PRO');

      // Cria assinatura PRO ativa
      db.subscriptions.set('sub_pro_1', {
        id: 'sub-1',
        userId: user.id,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_pro_1',
        plano: 'PRO',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
      });

      // Cria 15 orçamentos seguidos
      for (let i = 1; i <= 15; i++) {
        const res = db.insertOrcamento(user.id, `20${i}`);
        expect(res.allowed).toBe(true);
      }

      expect(db.orcamentos.filter((o) => o.userId === user.id).length).toBe(15);
    });

    it('não deve consumir IA no backend (recurso exclusivo do TURBO)', () => {
      const user = db.seedUser('user-pro', 'pro@fechazap.com', 'PRO');
      db.subscriptions.set('sub_pro_1', {
        id: 'sub-1',
        userId: user.id,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_pro_1',
        plano: 'PRO',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
      });

      const apiRes = db.invokeFechaIa(user.id, { action: 'gerar_orcamento' });
      expect(apiRes.status).toBe(403);
      expect(apiRes.error).toContain('plano TURBO');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Verificação do Plano TURBO
  // ----------------------------------------------------------------------------
  describe('Plano TURBO (Produtividade + Inteligência)', () => {
    it('deve liberar 1.500 créditos mensais de IA e orçamentos ilimitados', () => {
      const user = db.seedUser('user-turbo', 'turbo@fechazap.com', 'TURBO');
      db.subscriptions.set('sub_turbo_1', {
        id: 'sub-turbo-1',
        userId: user.id,
        stripeCustomerId: 'cus_turbo',
        stripeSubscriptionId: 'sub_turbo_1',
        plano: 'TURBO',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
      });

      // Cria orçamentos sem restrição
      for (let i = 1; i <= 10; i++) {
        const oRes = db.insertOrcamento(user.id, `30${i}`);
        expect(oRes.allowed).toBe(true);
      }

      // Consome IA
      const aiRes = db.consumeAiQuota(user.id, 'gerar_orcamento');
      expect(aiRes.allowed).toBe(true);
      expect(aiRes.limit).toBe(1500);
      expect(aiRes.used).toBe(1);

      // Chamada à API fecha-ia autorizada com sucesso
      const apiRes = db.invokeFechaIa(user.id, { action: 'gerar_fechamento' });
      expect(apiRes.status).toBe(200);
      expect(apiRes.success).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Testes de Segurança: Tentativas de Alteração de Plano pelo Frontend
  // ----------------------------------------------------------------------------
  describe('Segurança & Anti-Tampering (Frontend não decide plano)', () => {
    it('deve rejeitar e neutralizar tentativa de alterar coluna plano via frontend', () => {
      const user = db.seedUser('attacker-1', 'attacker@test.com', 'GRATUITO');

      // Usuário autenticado tenta enviar UPDATE profiles SET plano = 'TURBO'
      const updateResult = db.updateProfileFromFrontend(
        user.id,
        { plano: 'TURBO' },
        'authenticated'
      );

      // Trigger PostgreSQL bloqueia e mantém OLD.plano
      expect(updateResult.success).toBe(false);
      expect(updateResult.rejectedField).toBe('plano');

      // O perfil consultado no banco de dados permanece estritamente GRATUITO
      const freshUser = db.profiles.get(user.id)!;
      expect(freshUser.plano).toBe('GRATUITO');
    });

    it('deve ignorar plano forjado enviado no corpo da requisição da API (fecha-ia)', () => {
      const user = db.seedUser('attacker-2', 'attacker2@test.com', 'GRATUITO');

      // Atacante tenta injetar "clientSentPlan: 'TURBO'" no payload JSON para enganar o backend
      const apiRes = db.invokeFechaIa(user.id, {
        action: 'gerar_orcamento',
        clientSentPlan: 'TURBO',
      });

      // Backend ignora o body e valida a linha authoritative no banco de dados
      expect(apiRes.status).toBe(403);
      expect(apiRes.success).toBe(false);
      expect(apiRes.error).toContain('plano TURBO');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Arquitetura do Ciclo de Vida do Stripe (Webhooks, Grace Period & Upgrade)
  // ----------------------------------------------------------------------------
  describe('Arquitetura de Ciclo de Vida Stripe', () => {
    it('checkout.session.completed → deve ativar assinatura e sincronizar plano authoritative', () => {
      const user = db.seedUser('user-checkout', 'user@checkout.com', 'GRATUITO');

      const checkoutPayload = JSON.stringify({
        id: 'evt_checkout_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_abc',
            client_reference_id: user.id,
            customer: 'cus_stripe_123',
            subscription: 'sub_stripe_123',
            metadata: { plano: 'TURBO' },
          },
        },
      });

      const sig = signStripePayload(checkoutPayload, webhookSecret);
      const res = db.processStripeWebhook(checkoutPayload, sig, webhookSecret);

      expect(res.status).toBe(200);
      expect(db.calculateEffectivePlan(user.id)).toBe('TURBO');

      // Agora o usuário pode criar orçamentos ilimitados e usar IA
      const aiRes = db.invokeFechaIa(user.id, { action: 'gerar_orcamento' });
      expect(aiRes.status).toBe(200);
    });

    it('webhook com HMAC inválido → deve rejeitar imediatamente com 401', () => {
      const payload = JSON.stringify({ id: 'evt_fake', type: 'checkout.session.completed' });
      const badSig = 't=123456,v1=invalid_hmac_hex';

      const res = db.processStripeWebhook(payload, badSig, webhookSecret);
      expect(res.status).toBe(401);
    });

    it('downgrade ou cancelamento → deve recair para GRATUITO', () => {
      const user = db.seedUser('user-cancel', 'user@cancel.com', 'TURBO');
      db.subscriptions.set('sub_active_123', {
        id: 'sub_123',
        userId: user.id,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_active_123',
        plano: 'TURBO',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
      });

      expect(db.calculateEffectivePlan(user.id)).toBe('TURBO');

      // Dispara webhook de cancelamento
      const deletePayload = JSON.stringify({
        id: 'evt_del_999',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_active_123',
          },
        },
      });

      const sig = signStripePayload(deletePayload, webhookSecret);
      const res = db.processStripeWebhook(deletePayload, sig, webhookSecret);

      expect(res.status).toBe(200);
      expect(db.calculateEffectivePlan(user.id)).toBe('GRATUITO');

      // Tentativa de IA agora é bloqueada
      const aiRes = db.invokeFechaIa(user.id, { action: 'gerar_orcamento' });
      expect(aiRes.status).toBe(403);
    });

    it('falha no pagamento com grace period → mantém acesso durante a tolerância de 5 dias', () => {
      const user = db.seedUser('user-grace', 'user@grace.com', 'PRO');
      db.subscriptions.set('sub_grace_1', {
        id: 'sub_grace_1',
        userId: user.id,
        stripeCustomerId: 'cus_grace',
        stripeSubscriptionId: 'sub_grace_1',
        plano: 'PRO',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        cancelAtPeriodEnd: false,
      });

      // Simula evento de past_due
      const pastDuePayload = JSON.stringify({
        id: 'evt_past_due_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_grace_1',
            status: 'past_due',
            metadata: { plano: 'PRO' },
          },
        },
      });

      const sig = signStripePayload(pastDuePayload, webhookSecret);
      db.processStripeWebhook(pastDuePayload, sig, webhookSecret);

      // Enquanto grace_period_end estiver no futuro, plano efetivo permanece PRO
      expect(db.calculateEffectivePlan(user.id)).toBe('PRO');

      // Se a tolerância expirar no tempo
      const sub = db.subscriptions.get('sub_grace_1')!;
      sub.gracePeriodEnd = new Date(Date.now() - 1000); // 1s no passado
      expect(db.calculateEffectivePlan(user.id)).toBe('GRATUITO');
    });

    it('idempotência do webhook → evento duplicado deve ser ignorado sem duplicar efeito', () => {
      const user = db.seedUser('user-idem', 'user@idem.com', 'GRATUITO');

      const payload = JSON.stringify({
        id: 'evt_unique_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_idem',
            client_reference_id: user.id,
            subscription: 'sub_idem_1',
            metadata: { plano: 'PRO' },
          },
        },
      });

      const sig = signStripePayload(payload, webhookSecret);

      // 1ª entrega
      const res1 = db.processStripeWebhook(payload, sig, webhookSecret);
      expect(res1.status).toBe(200);

      // 2ª entrega idêntica (Replay / Retry do Stripe)
      const res2 = db.processStripeWebhook(payload, sig, webhookSecret);
      expect(res2.status).toBe(200);
      expect(res2.received).toBe(true);

      // Apenas 1 registro de assinatura
      expect(db.subscriptions.size).toBe(1);
    });
  });
});
