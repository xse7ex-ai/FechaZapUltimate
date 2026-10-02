-- ==============================================================================
-- FechaZap - Migração: Arquitetura de Planos, Monetização e Stripe (Fase 6/9)
-- ==============================================================================
-- 1. Tabela de Assinaturas (Subscriptions)
-- 2. Tabela de Eventos Stripe (Idempotência e Auditoria de Webhooks)
-- 3. Cálculo e Sincronização do Plano Efetivo no Servidor
-- 4. Proteção Estrita Contra Alteração de Plano pelo Frontend (RLS + Triggers)
-- ==============================================================================

-- 1. Tabela de Assinaturas do Usuário (Gerenciada EXCLUSIVAMENTE pelo Servidor/Webhook)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plano TEXT NOT NULL DEFAULT 'GRATUITO' CHECK (plano IN ('GRATUITO', 'PRO', 'TURBO')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'grace_period'
  )),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  grace_period_end TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabela de Eventos do Stripe para Idempotência e Auditoria
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id TEXT PRIMARY KEY, -- Stripe Event ID (evt_...)
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Índices de Performance e Consulta
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON public.stripe_events(processed_at DESC);

-- 3. Função Server-Side para Determinar o Plano Efetivo do Usuário
-- REGRA DE NEGÓCIO:
-- Se o usuário tem assinatura 'active', 'trialing' ou está dentro do 'grace_period',
-- o plano efetivo é o plano da assinatura contratada (PRO ou TURBO).
-- Se a assinatura foi cancelada, não paga, ou expirou o grace period, o plano é GRATUITO.
CREATE OR REPLACE FUNCTION public.calculate_effective_user_plan(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_sub RECORD;
  v_effective_plan TEXT := 'GRATUITO';
BEGIN
  -- Busca a assinatura mais recente e relevante do usuário
  SELECT plano, status, grace_period_end, current_period_end
  INTO v_sub
  FROM public.subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'GRATUITO';
  END IF;

  -- 1. Assinatura ativa ou em período de teste
  IF v_sub.status IN ('active', 'trialing') THEN
    v_effective_plan := v_sub.plano;
  
  -- 2. Grace Period (Tolerância pós-falha de pagamento)
  ELSIF v_sub.status = 'grace_period' OR (v_sub.status = 'past_due' AND v_sub.grace_period_end IS NOT NULL AND v_sub.grace_period_end > NOW()) THEN
    v_effective_plan := v_sub.plano;

  -- 3. Cancelada ou expirada -> Recai para GRATUITO
  ELSE
    v_effective_plan := 'GRATUITO';
  END IF;

  RETURN v_effective_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Função para Sincronizar Automaticamente profiles.plano com o Plano Efetivo
CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_effective TEXT;
BEGIN
  v_effective := public.calculate_effective_user_plan(NEW.user_id);

  UPDATE public.profiles
  SET plano = v_effective,
      updated_at = NOW()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_profile_from_subscription ON public.subscriptions;
CREATE TRIGGER trg_sync_profile_from_subscription
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_subscription();

-- 5. Segurança Máxima & RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Subscriptions: O usuário pode visualizar SOMENTE suas próprias assinaturas (Read-Only)
DROP POLICY IF EXISTS "Usuário visualiza sua assinatura" ON public.subscriptions;
CREATE POLICY "Usuário visualiza sua assinatura"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- BLOQUEIO ABSOLUTO DE ESCRITA NO FRONTEND:
-- Usuários autenticados NUNCA podem inserir, alterar ou deletar assinaturas
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- Stripe Events: Exclusivo para service_role (Edge Functions)
REVOKE ALL ON public.stripe_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.stripe_events TO service_role;

-- 6. Reforço no profiles: Revogação explícita de atualização da coluna plano por usuários
-- Garante que NENHUM payload de update do frontend possa alterar a coluna 'plano'
REVOKE UPDATE (plano) ON public.profiles FROM anon, authenticated;
GRANT UPDATE (nome, empresa_nome, whatsapp) ON public.profiles TO authenticated;
