-- ==============================================================================
-- Migration: 20261002_gratuito_orcamento_counter.sql
-- Objetivo: Quota real do plano GRATUITO (5 orçamentos/mês) no servidor
--           sem sincronização dos dados do orçamento (mantendo privacidade e
--           operação 100% local do plano gratuito).
-- ==============================================================================

-- 1. Tabela de contagem de orçamentos para o plano GRATUITO
CREATE TABLE IF NOT EXISTS public.gratuito_orcamento_counter (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes DATE NOT NULL,
  contador INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_gratuito_orcamento_counter PRIMARY KEY (user_id, mes)
);

-- 2. Habilitação de RLS e Políticas de Acesso
ALTER TABLE public.gratuito_orcamento_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário visualiza própria contagem de quota" ON public.gratuito_orcamento_counter;
CREATE POLICY "Usuário visualiza própria contagem de quota"
  ON public.gratuito_orcamento_counter FOR SELECT
  USING (auth.uid() = user_id);

-- Nenhum INSERT/UPDATE/DELETE direto é permitido para usuários (apenas via RPC SECURITY DEFINER)
REVOKE INSERT, UPDATE, DELETE ON public.gratuito_orcamento_counter FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.gratuito_orcamento_counter TO authenticated;
GRANT ALL ON public.gratuito_orcamento_counter TO service_role;

-- 3. Função RPC atômica check_and_consume_gratuito_quota()
CREATE OR REPLACE FUNCTION public.check_and_consume_gratuito_quota()
RETURNS JSONB AS $$
DECLARE
  v_uid UUID;
  v_plano TEXT;
  v_mes DATE;
  v_contador INT;
BEGIN
  -- 1. Se não houver usuário autenticado, falhar
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Buscar o plano do usuário em profiles
  SELECT plano INTO v_plano
  FROM public.profiles
  WHERE id = v_uid;

  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  -- Se for PRO ou TURBO, retornar sucesso imediatamente, sem mexer no contador (trava exclusiva de GRATUITO)
  IF v_plano IN ('PRO', 'TURBO') THEN
    RETURN jsonb_build_object(
      'success', true,
      'plano', v_plano,
      'consumed', false,
      'limit', -1
    );
  END IF;

  -- 3. Se for GRATUITO: mês atual truncado pro primeiro dia
  v_mes := date_trunc('month', CURRENT_DATE)::DATE;

  -- Garantir que a linha existe de forma atômica
  INSERT INTO public.gratuito_orcamento_counter (user_id, mes, contador, updated_at)
  VALUES (v_uid, v_mes, 0, NOW())
  ON CONFLICT (user_id, mes) DO NOTHING;

  -- Bloquear a linha para leitura e atualização segura contra concorrência (Race Conditions)
  SELECT contador INTO v_contador
  FROM public.gratuito_orcamento_counter
  WHERE user_id = v_uid AND mes = v_mes
  FOR UPDATE;

  -- Se contador >= 5, lançar exceção QUOTA_EXCEEDED
  IF v_contador >= 5 THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Limite mensal de 5 orçamentos atingido para o plano GRATUITO. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados.'
      USING ERRCODE = 'P0001',
            HINT = 'upgrade_required';
  END IF;

  -- Incrementar o contador e retornar sucesso
  UPDATE public.gratuito_orcamento_counter
  SET contador = contador + 1,
      updated_at = NOW()
  WHERE user_id = v_uid AND mes = v_mes;

  RETURN jsonb_build_object(
    'success', true,
    'plano', 'GRATUITO',
    'consumed', true,
    'contador', v_contador + 1,
    'limit', 5
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_and_consume_gratuito_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_consume_gratuito_quota() TO authenticated, service_role;
