-- ==============================================================================
-- Migração FechaZap / CLOSI: Correção Mínima do WhatsApp Individual
-- Arquivo: 20261011_safe_whatsapp_connection_verification.sql
-- Data: 2026-10-11
-- 
-- Objetivos:
-- 1. Adicionar o estado 'pending_verification' à constraint de status de whatsapp_connections.
-- 2. Garantir que register_whatsapp_connection crie conexões estritamente como 'pending_verification'.
-- 3. Impedir que qualquer usuário autenticado transicione uma conexão para 'active'.
-- 4. Exigir verificação pelo backend confiável (service_role) para ativação.
-- 5. Aplicar validações de plano TURBO, proibição de número central e unicidade tanto para
--    conexões 'active' quanto 'pending_verification'.
-- 6. Rebaixar conexões legadas 'active' não verificadas (sem token individual) para 'pending_verification'.
-- ==============================================================================

-- 1. Atualização idempotente da constraint de status na tabela public.whatsapp_connections
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.whatsapp_connections'::regclass 
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.whatsapp_connections DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_status_check
  CHECK (status IN ('active', 'inactive', 'revoked', 'pending_verification'));

ALTER TABLE public.whatsapp_connections
  ALTER COLUMN status SET DEFAULT 'pending_verification';

-- 2. Atualização idempotente do índice de unicidade
-- Impede reivindicações conflitantes simultâneas entre conexões ativas e pendentes
DROP INDEX IF EXISTS public.idx_whatsapp_conn_unique_active_phone;
DROP INDEX IF EXISTS public.idx_whatsapp_conn_unique_active_or_pending_phone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conn_unique_active_or_pending_phone
  ON public.whatsapp_connections(phone_number_id)
  WHERE status IN ('active', 'pending_verification');

-- 3. Migração de integridade de dados legados:
-- Conexões existentes marcadas como 'active' sem access_token_encrypted comprovado
-- não podem permanecer ativas sem autorização oficial da Meta.
UPDATE public.whatsapp_connections
SET status = 'pending_verification',
    updated_at = NOW()
WHERE status = 'active' AND (access_token_encrypted IS NULL OR trim(access_token_encrypted) = '');

-- 4. Função e Trigger de Validação de Segurança Reforçada
CREATE OR REPLACE FUNCTION public.check_whatsapp_connection_security()
RETURNS TRIGGER AS $$
DECLARE
  v_user_plano TEXT;
  v_central_phone TEXT;
  v_jwt_role TEXT;
  v_auth_role TEXT;
  v_is_service_role BOOLEAN;
BEGIN
  -- Identificador central oficial do FechaZap / CLOSI
  v_central_phone := 'central_fechazap_shared_106934522435791';

  -- REGRA 1: Bloqueio absoluto do número central e suas variantes (em qualquer status)
  IF NEW.phone_number_id = v_central_phone 
     OR NEW.phone_number_id = '106934522435791' 
     OR NEW.phone_number_id ILIKE '%central_fechazap%' THEN
    RAISE EXCEPTION 'FORBIDDEN_CENTRAL_PHONE: O identificador central do FechaZap não pode ser cadastrado como conexão individual.'
      USING ERRCODE = '42501';
  END IF;

  -- Bloqueio do WABA ID central (em qualquer status)
  IF NEW.waba_id IS NOT NULL AND (
    NEW.waba_id = 'central_waba_fechazap' 
    OR NEW.waba_id = '106934522435790'
    OR NEW.waba_id ILIKE '%central_waba%'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN_CENTRAL_WABA: O WABA ID central do FechaZap não pode ser cadastrado como conexão individual.'
      USING ERRCODE = '42501';
  END IF;

  -- REGRA 2: Proteções aplicadas a conexões 'active' E 'pending_verification'
  IF NEW.status IN ('active', 'pending_verification') THEN
    -- 2a. Unicidade contra conflito / sequestro entre usuários (ativos ou pendentes)
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_connections
      WHERE phone_number_id = NEW.phone_number_id
        AND status IN ('active', 'pending_verification')
        AND user_id <> NEW.user_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'PHONE_NUMBER_ALREADY_CLAIMED: Este phone_number_id já está vinculado (ativo ou pendente) a outro usuário.'
        USING ERRCODE = '23505';
    END IF;

    -- 2b. Conexões individuais (ativas ou pendentes) exigem plano TURBO
    SELECT plano INTO v_user_plano
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF v_user_plano IS NULL OR v_user_plano <> 'TURBO' THEN
      RAISE EXCEPTION 'UPGRADE_REQUIRED: Apenas usuários com plano TURBO podem cadastrar conexões comerciais individuais da Meta Cloud API.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- REGRA 3 (Ponto Crítico 3b): Nenhuma transição para 'active' pode ser feita por papel comum (authenticated)
  -- Somente o backend confiável (service_role) pode ativar conexões
  IF NEW.status = 'active' THEN
    v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
    
    BEGIN
      v_auth_role := auth.role();
    EXCEPTION WHEN OTHERS THEN
      v_auth_role := NULL;
    END;

    v_is_service_role := (
      v_jwt_role = 'service_role' 
      OR v_auth_role = 'service_role'
      OR session_user = 'service_role'
    );

    IF v_jwt_role = 'authenticated' OR v_auth_role = 'authenticated' OR NOT v_is_service_role THEN
      RAISE EXCEPTION 'FORBIDDEN_ACTIVATION: Apenas o backend confiável (service_role) pode ativar conexões individuais após verificação oficial com a Meta.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS trg_check_whatsapp_connection_security ON public.whatsapp_connections;
CREATE TRIGGER trg_check_whatsapp_connection_security
  BEFORE INSERT OR UPDATE ON public.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.check_whatsapp_connection_security();

-- 5. RPC Atômica register_whatsapp_connection (cria SEMPRE como 'pending_verification')
CREATE OR REPLACE FUNCTION public.register_whatsapp_connection(
  p_phone_number_id TEXT,
  p_waba_id TEXT DEFAULT NULL,
  p_display_phone_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID;
  v_new_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_phone_number_id IS NULL OR trim(p_phone_number_id) = '' THEN
    RAISE EXCEPTION 'phone_number_id obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  -- Desativa conexões ativas ou pendentes anteriores deste usuário
  UPDATE public.whatsapp_connections
  SET status = 'inactive',
      updated_at = NOW()
  WHERE user_id = v_uid AND status IN ('active', 'pending_verification');

  -- Insere a nova conexão SEMPRE em estado 'pending_verification'
  INSERT INTO public.whatsapp_connections (
    user_id,
    waba_id,
    phone_number_id,
    display_phone_number,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_uid,
    trim(p_waba_id),
    trim(p_phone_number_id),
    trim(p_display_phone_number),
    'pending_verification',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'phone_number_id', trim(p_phone_number_id),
    'status', 'pending_verification'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

REVOKE ALL ON FUNCTION public.register_whatsapp_connection(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_whatsapp_connection(TEXT, TEXT, TEXT) TO authenticated, service_role;
