-- ==============================================================================
-- Migration: 20260928_enforce_orcamento_quota.sql
-- Objetivo: Hardening e aplicação server-side estrita da quota do plano GRATUITO
--           (máximo 5 orçamentos/mês no PostgreSQL) com proteção contra concorrência,
--           spoofing de user_id, falsificação de created_at e RLS reforçado.
-- ==============================================================================

-- 1. Função Trigger de Enforcement da Quota no INSERT de Orçamentos
CREATE OR REPLACE FUNCTION public.enforce_orcamento_quota()
RETURNS TRIGGER AS $$
DECLARE
  v_plano TEXT;
  v_count INT;
  v_limit INT := 5;
  v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  -- 1. Proteção de user_id: se chamado por usuário autenticado, força NEW.user_id := auth.uid()
  IF v_role = 'authenticated' THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado ou user_id ausente.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Proteção de created_at: carimbo temporal garantido pelo servidor (impossibilita datas retroativas)
  NEW.created_at := NOW();
  NEW.updated_at := NOW();

  -- 3. Se for uma atualização de registro já existente (ex: upsert com ID já existente no banco),
  -- não consome nova cota de criação
  IF EXISTS (SELECT 1 FROM public.orcamentos WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- 4. Serialização contra concorrência / Race Conditions:
  -- Bloqueia a linha do perfil com FOR UPDATE para serializar inserções simultâneas do mesmo usuário
  SELECT plano INTO v_plano
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  -- 5. Planos PRO e TURBO possuem criação ilimitada
  IF v_plano IN ('PRO', 'TURBO') THEN
    RETURN NEW;
  END IF;

  -- 6. Validação transacional estrita para plano GRATUITO: contagem no mês corrente
  SELECT COUNT(*) INTO v_count
  FROM public.orcamentos
  WHERE user_id = NEW.user_id
    AND date_trunc('month', created_at) = date_trunc('month', NOW());

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Limite mensal de 5 orçamentos atingido para o plano GRATUITO. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados.'
      USING ERRCODE = 'P0001',
            HINT = 'upgrade_required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Função Trigger de Proteção no UPDATE de Orçamentos
CREATE OR REPLACE FUNCTION public.protect_orcamento_update()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  -- 1. Impede transferência de user_id pelo usuário autenticado
  IF v_role = 'authenticated' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;

  -- 2. Impede alteração de created_at para manter integridade histórica da quota
  NEW.created_at := OLD.created_at;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Aplicação dos Triggers na tabela public.orcamentos
DROP TRIGGER IF EXISTS trg_enforce_orcamento_quota ON public.orcamentos;
CREATE TRIGGER trg_enforce_orcamento_quota
  BEFORE INSERT ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_orcamento_quota();

DROP TRIGGER IF EXISTS trg_protect_orcamento_update ON public.orcamentos;
CREATE TRIGGER trg_protect_orcamento_update
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.protect_orcamento_update();

-- 4. Função Segura de Verificação de Quota (RPC check_orcamento_quota)
-- Garante que um usuário autenticado só consiga consultar a própria quota (evita enumeração)
CREATE OR REPLACE FUNCTION public.check_orcamento_quota(user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_target_user UUID;
  v_plano TEXT;
  v_count INT;
  v_limit INT;
  v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  -- Segurança: se autenticado como usuário normal, força a consulta sobre a própria conta (auth.uid())
  IF v_role = 'authenticated' THEN
    v_target_user := auth.uid();
  ELSE
    -- Para chamadas internas de sistema ou service_role
    v_target_user := COALESCE(user_uuid, auth.uid());
  END IF;

  IF v_target_user IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Usuário não autenticado',
      'allowed', false,
      'plano', 'GRATUITO',
      'count', 0,
      'limit', 5
    );
  END IF;

  SELECT plano INTO v_plano FROM public.profiles WHERE id = v_target_user;
  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  IF v_plano = 'GRATUITO' THEN
    v_limit := 5;
    SELECT COUNT(*) INTO v_count
    FROM public.orcamentos
    WHERE user_id = v_target_user
      AND date_trunc('month', created_at) = date_trunc('month', NOW());
  ELSE
    v_limit := -1; -- Ilimitado para PRO e TURBO
    v_count := 0;
  END IF;

  RETURN jsonb_build_object(
    'plano', v_plano,
    'count', v_count,
    'limit', v_limit,
    'allowed', (v_limit = -1 OR v_count < v_limit),
    'remaining', CASE WHEN v_limit = -1 THEN -1 ELSE GREATEST(0, v_limit - v_count) END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_orcamento_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_orcamento_quota(UUID) TO service_role, authenticated;

-- 5. Hardening de Políticas RLS na tabela public.orcamentos
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário gerencia próprios orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Usuário visualiza próprios orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Usuário insere próprios orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Usuário atualiza próprios orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Usuário exclui próprios orçamentos" ON public.orcamentos;

CREATE POLICY "Usuário visualiza próprios orçamentos"
  ON public.orcamentos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário insere próprios orçamentos"
  ON public.orcamentos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário atualiza próprios orçamentos"
  ON public.orcamentos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário exclui próprios orçamentos"
  ON public.orcamentos FOR DELETE
  USING (auth.uid() = user_id);
