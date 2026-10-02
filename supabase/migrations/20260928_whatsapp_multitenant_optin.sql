-- ==============================================================================
-- Migration: 20260928_whatsapp_multitenant_optin.sql
-- Objetivo: Arquitetura multi-tenant de conexões WhatsApp, suporte a opt-in/opt-out
--           de clientes, enriquecimento de mensagens WhatsApp (direção, status,
--           phone_number_id) e políticas RLS de tenant isolation.
-- ==============================================================================

-- 1. Tabela de Conexões WhatsApp por Usuário (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  waba_id TEXT,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  access_token_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Se a tabela já existia sem a coluna access_token_encrypted
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;

-- Índices essenciais para roteamento de webhook e busca do tenant
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_user_id ON public.whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_phone_number_id ON public.whatsapp_connections(phone_number_id);
-- Garante que um mesmo phone_number_id não pertença simultaneamente a duas contas com status ativo
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conn_unique_active_phone
  ON public.whatsapp_connections(phone_number_id)
  WHERE status = 'active';

-- RLS para whatsapp_connections
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário visualiza suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário visualiza suas próprias conexões"
  ON public.whatsapp_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário insere suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário insere suas próprias conexões"
  ON public.whatsapp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário atualiza suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário atualiza suas próprias conexões"
  ON public.whatsapp_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário exclui suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário exclui suas próprias conexões"
  ON public.whatsapp_connections FOR DELETE
  USING (auth.uid() = user_id);

-- SEGURANÇA MÁXIMA (Regra 9):
-- O token de acesso NUNCA é exposto ao frontend.
-- Revoga acesso à coluna sensível para conexões públicas/autenticadas.
-- Somente o service_role das Edge Functions acessa o token protegido.
REVOKE ALL (access_token_encrypted) ON public.whatsapp_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, waba_id, phone_number_id, display_phone_number, status, created_at, updated_at) ON public.whatsapp_connections TO authenticated;
GRANT INSERT (user_id, waba_id, phone_number_id, display_phone_number, status) ON public.whatsapp_connections TO authenticated;
GRANT UPDATE (waba_id, phone_number_id, display_phone_number, status) ON public.whatsapp_connections TO authenticated;
GRANT DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;

-- 2. Suporte a Opt-in, Opt-out e Última Interação na tabela public.clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source TEXT DEFAULT 'cadastro',
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clientes_user_opt_in ON public.clientes(user_id, whatsapp_opt_in);
CREATE INDEX IF NOT EXISTS idx_clientes_last_inbound ON public.clientes(user_id, last_inbound_at DESC);

-- 3. Enriquecimento de public.mensagens_whatsapp
ALTER TABLE public.mensagens_whatsapp
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS cliente_id TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'inbound' CHECK (direcao IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'));

-- Índices adicionais para mensagens
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_phone_number_id ON public.mensagens_whatsapp(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_user_created ON public.mensagens_whatsapp(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_timestamp ON public.mensagens_whatsapp(timestamp DESC);
