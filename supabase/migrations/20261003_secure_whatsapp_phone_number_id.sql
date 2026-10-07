-- ==============================================================================
-- Migração FechaZap: Segurança Server-Side do WhatsApp Phone Number ID (Fase Final)
-- Data: 2026-10-03
-- 
-- Objetivos:
-- 1. Impedir que usuários cadastrem o phone_number_id do canal central compartilhado.
-- 2. Impedir que um usuário sequestre o phone_number_id de outro usuário.
-- 3. Exigir validação autoritativa no banco de dados / Edge Function.
-- 4. Garantir que status = 'active' não possa ser manipulado arbitrariamente.
-- ==============================================================================

-- 1. Função de Validação de Segurança para Conexões WhatsApp
CREATE OR REPLACE FUNCTION public.check_whatsapp_connection_security()
RETURNS TRIGGER AS $$
DECLARE
  v_user_plano TEXT;
  v_central_phone TEXT;
BEGIN
  -- Identificador central oficial do FechaZap
  v_central_phone := 'central_fechazap_shared_106934522435791';

  -- REGRA 1 (PARTE 4): Bloqueio absoluto do número central e suas variantes
  IF NEW.phone_number_id = v_central_phone 
     OR NEW.phone_number_id = '106934522435791' 
     OR NEW.phone_number_id ILIKE '%central_fechazap%' THEN
    RAISE EXCEPTION 'FORBIDDEN_CENTRAL_PHONE: O identificador central do FechaZap não pode ser cadastrado como conexão individual.'
      USING ERRCODE = '42501';
  END IF;

  -- Bloqueio do WABA ID central
  IF NEW.waba_id IS NOT NULL AND (
    NEW.waba_id = 'central_waba_fechazap' 
    OR NEW.waba_id = '106934522435790'
    OR NEW.waba_id ILIKE '%central_waba%'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN_CENTRAL_WABA: O WABA ID central do FechaZap não pode ser cadastrado como conexão individual.'
      USING ERRCODE = '42501';
  END IF;

  -- REGRA 2 (PARTE 3): Proteção contra conflito / sequestro entre usuários
  -- Se o status for 'active', nenhum outro usuário pode possuir o mesmo phone_number_id ativo
  IF NEW.status = 'active' THEN
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_connections
      WHERE phone_number_id = NEW.phone_number_id
        AND status = 'active'
        AND user_id <> NEW.user_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'PHONE_NUMBER_ALREADY_CLAIMED: Este phone_number_id já está vinculado ativamente a outro usuário.'
        USING ERRCODE = '23505';
    END IF;

    -- REGRA 3: Conexões individuais ativas exigem plano TURBO
    SELECT plano INTO v_user_plano
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF v_user_plano IS NULL OR v_user_plano <> 'TURBO' THEN
      RAISE EXCEPTION 'UPGRADE_REQUIRED: Apenas usuários com plano TURBO podem ativar conexões comerciais individuais da Meta Cloud API.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Trigger para Execução Obrigatória em Qualquer INSERT ou UPDATE
DROP TRIGGER IF EXISTS trg_check_whatsapp_connection_security ON public.whatsapp_connections;
CREATE TRIGGER trg_check_whatsapp_connection_security
  BEFORE INSERT OR UPDATE ON public.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.check_whatsapp_connection_security();

-- 3. RPC Atômica para Registrar / Atualizar Conexão WhatsApp de Forma Segura
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

  -- Desativa conexões ativas anteriores deste usuário
  UPDATE public.whatsapp_connections
  SET status = 'inactive',
      updated_at = NOW()
  WHERE user_id = v_uid AND status = 'active';

  -- Insere a nova conexão (o trigger trg_check_whatsapp_connection_security valida as regras)
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
    'active',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'phone_number_id', trim(p_phone_number_id),
    'status', 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.register_whatsapp_connection(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_whatsapp_connection(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Revogação de Inserção Direta: o frontend não pode mais criar status active diretamente
REVOKE INSERT ON public.whatsapp_connections FROM anon, authenticated, PUBLIC;
DROP POLICY IF EXISTS "Usuário insere suas próprias conexões" ON public.whatsapp_connections;
