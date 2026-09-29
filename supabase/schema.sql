-- ==============================================================================
-- FechaZap - Esquema Completo do Banco de Dados PostgreSQL (Supabase)
-- Arquitetura: Supabase Auth + Row Level Security (RLS) + Edge Functions
-- Modelo de Negócio Estrito:
--   GRATUITO: 0 créditos de IA + 5 orçamentos manuais por mês
--   PRO:      0 créditos de IA no backend + orçamentos ilimitados
--   TURBO:    1500 créditos de IA/mês + orçamentos ilimitados + follow-up WhatsApp
-- ==============================================================================

-- 1. Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Perfis de Usuário (Autoridade Central de Planos)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  empresa_nome TEXT,
  whatsapp TEXT,
  plano TEXT NOT NULL DEFAULT 'GRATUITO' CHECK (plano IN ('GRATUITO', 'PRO', 'TURBO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabela de Clientes (com suporte a Opt-in/Opt-out de WhatsApp e última interação)
CREATE TABLE IF NOT EXISTS public.clientes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  documento TEXT,
  cidade TEXT,
  endereco TEXT,
  observacoes TEXT,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT true,
  whatsapp_opt_in_at TIMESTAMPTZ DEFAULT NOW(),
  whatsapp_opt_in_source TEXT DEFAULT 'cadastro',
  whatsapp_opt_out_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela de Orçamentos (Status padronizados: pendente, enviado, aprovado, recusado)
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  cliente_id TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  desconto_tipo TEXT NOT NULL DEFAULT 'valor' CHECK (desconto_tipo IN ('porcentagem', 'valor')),
  desconto_valor NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'aprovado', 'recusado')),
  data_validade DATE,
  forma_pagamento TEXT,
  prazo_entrega TEXT,
  observacoes TEXT,
  termos_garantia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabela de Registro e Auditoria de Uso da IA
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_operacao TEXT NOT NULL, -- 'gerar_orcamento', 'analisar_precos', 'gerar_fechamento', 'follow_up', 'whatsapp_followup_turbo'
  modelo TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  mes_referencia TEXT NOT NULL, -- formato 'YYYY-MM', ex: '2026-09'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tabela de Configurações e Personalização da Empresa (Sem credenciais de WhatsApp)
-- Nota de Segurança: Credenciais do WhatsApp Business residem exclusivamente como secrets do servidor
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_fantasia TEXT,
  razao_social TEXT,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  chave_pix TEXT,
  tipo_chave_pix TEXT DEFAULT 'cpf' CHECK (tipo_chave_pix IN ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria')),
  endereco TEXT,
  cidade_estado TEXT,
  logo_url TEXT,
  mensagem_padrao_whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_configuracoes_user_id UNIQUE (user_id)
);

-- 7. Tabela de Conexões WhatsApp por Usuário (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  waba_id TEXT,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Tabela de Mensagens do WhatsApp (Inbound e Outbound - Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.mensagens_whatsapp (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id TEXT,
  cliente_telefone TEXT NOT NULL,
  cliente_nome TEXT,
  corpo TEXT NOT NULL,
  direcao TEXT NOT NULL DEFAULT 'inbound' CHECK (direcao IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  lida BOOLEAN NOT NULL DEFAULT false,
  wa_message_id TEXT UNIQUE,
  orcamento_id TEXT REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_profiles_plano ON public.profiles(plano);
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_user_opt_in ON public.clientes(user_id, whatsapp_opt_in);
CREATE INDEX IF NOT EXISTS idx_clientes_last_inbound ON public.clientes(user_id, last_inbound_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_user_id ON public.orcamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_user_status ON public.orcamentos(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_mes ON public.ai_usage(user_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_configuracoes_user_id ON public.configuracoes(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_user_id ON public.whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_phone_number_id ON public.whatsapp_connections(phone_number_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conn_unique_active_phone
  ON public.whatsapp_connections(phone_number_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_user_lida ON public.mensagens_whatsapp(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_user_created ON public.mensagens_whatsapp(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_cliente_telefone ON public.mensagens_whatsapp(cliente_telefone);
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_phone_number_id ON public.mensagens_whatsapp(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_created_at ON public.mensagens_whatsapp(created_at DESC);

-- 7. Trigger Automático para Criar Perfil ao Cadastrar Usuário no Supabase Auth
-- REGRA DE NEGÓCIO: Todo novo usuário é cadastrado OBRIGATORIAMENTE com plano GRATUITO.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, plano)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    'GRATUITO'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Proteção contra Alteração do Campo 'plano' pelo Usuário Comum
-- Somente chamadas autenticadas com role 'service_role' podem alterar o plano.
CREATE OR REPLACE FUNCTION public.protect_profile_plan_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plano IS DISTINCT FROM OLD.plano THEN
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role' THEN
      NEW.plano := OLD.plano;
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_plan ON public.profiles;
CREATE TRIGGER trg_protect_profile_plan
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan_update();

-- 9. Função ATÔMICA de Consumo de Quota de IA (Prevenção de Concorrência via SELECT FOR UPDATE)
-- REGRA CRÍTICA:
--   GRATUITO: 0 créditos de IA
--   PRO:      0 créditos de IA no backend
--   TURBO:    1500 créditos de IA / mês
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_user_id UUID,
  p_tipo_operacao TEXT,
  p_modelo TEXT DEFAULT 'gemini-3.8-flash'
)
RETURNS JSONB AS $$
DECLARE
  v_plano TEXT;
  v_mes TEXT;
  v_limit INT;
  v_current_count INT;
BEGIN
  -- Trava a linha do perfil para serializar requisições concorrentes
  SELECT plano INTO v_plano
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  -- Apenas TURBO possui créditos de IA liberados
  IF v_plano = 'TURBO' THEN
    v_limit := 1500;
  ELSE
    v_limit := 0;
  END IF;

  v_mes := to_char(NOW(), 'YYYY-MM');

  -- Se o plano não é TURBO, bloqueia imediatamente com erro descritivo
  IF v_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'plano', v_plano,
      'used', 0,
      'limit', 0,
      'remaining', 0,
      'month', v_mes,
      'error', 'A Inteligência Artificial é exclusiva para assinantes do plano TURBO.'
    );
  END IF;

  -- Conta consumo no mês de referência
  SELECT COUNT(*) INTO v_current_count
  FROM public.ai_usage
  WHERE user_id = p_user_id AND mes_referencia = v_mes;

  -- Se estourou a cota mensal
  IF v_current_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'plano', v_plano,
      'used', v_current_count,
      'limit', v_limit,
      'remaining', 0,
      'month', v_mes,
      'error', 'Limite mensal de IA atingido para o plano TURBO (1500 requisições).'
    );
  END IF;

  -- Registra o consumo atômico
  INSERT INTO public.ai_usage (user_id, tipo_operacao, modelo, mes_referencia)
  VALUES (p_user_id, p_tipo_operacao, p_modelo, v_mes);

  RETURN jsonb_build_object(
    'allowed', true,
    'plano', v_plano,
    'used', v_current_count + 1,
    'limit', v_limit,
    'remaining', v_limit - (v_current_count + 1),
    'month', v_mes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restringe execução de consumo a service_role (Edge Functions seguras)
REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT) TO service_role;

-- 10. Consulta Informativa de Quota de IA (Read-only)
CREATE OR REPLACE FUNCTION public.check_ai_quota(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  v_plano TEXT;
  v_mes TEXT;
  v_count INT;
  v_limit INT;
BEGIN
  SELECT plano INTO v_plano FROM public.profiles WHERE id = user_uuid;
  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  IF v_plano = 'TURBO' THEN
    v_limit := 1500;
  ELSE
    v_limit := 0;
  END IF;

  v_mes := to_char(NOW(), 'YYYY-MM');

  SELECT COUNT(*) INTO v_count
  FROM public.ai_usage
  WHERE user_id = user_uuid AND mes_referencia = v_mes;

  RETURN jsonb_build_object(
    'plano', v_plano,
    'used', v_count,
    'limit', v_limit,
    'allowed', (v_limit > 0 AND v_count < v_limit),
    'remaining', GREATEST(0, v_limit - v_count),
    'month', v_mes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_ai_quota(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota(UUID) TO service_role;

-- 11. Validação e Aplicação de Quota de Orçamentos por Plano
--   GRATUITO: máx 5 orçamentos criados no mês atual (enforced no PostgreSQL)
--   PRO & TURBO: ilimitado (-1)

-- 11.1. Trigger de Enforcement Server-Side no INSERT de Orçamentos
CREATE OR REPLACE FUNCTION public.enforce_orcamento_quota()
RETURNS TRIGGER AS $$
DECLARE
  v_plano TEXT;
  v_count INT;
  v_limit INT := 5;
  v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  -- Proteção de user_id: se chamado por usuário autenticado, força NEW.user_id := auth.uid()
  IF v_role = 'authenticated' THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado ou user_id ausente.'
      USING ERRCODE = '42501';
  END IF;

  -- Proteção de created_at: carimbo temporal garantido pelo servidor (impossibilita datas retroativas)
  NEW.created_at := NOW();
  NEW.updated_at := NOW();

  -- Se for uma atualização de registro já existente (ex: upsert com ID já existente no banco),
  -- não consome nova cota de criação
  IF EXISTS (SELECT 1 FROM public.orcamentos WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Serialização contra concorrência / Race Conditions:
  -- Bloqueia a linha do perfil com FOR UPDATE para serializar inserções simultâneas do mesmo usuário
  SELECT plano INTO v_plano
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  -- Planos PRO e TURBO possuem criação ilimitada
  IF v_plano IN ('PRO', 'TURBO') THEN
    RETURN NEW;
  END IF;

  -- Validação transacional estrita para plano GRATUITO: contagem no mês corrente
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

-- 11.2. Trigger de Proteção no UPDATE de Orçamentos
CREATE OR REPLACE FUNCTION public.protect_orcamento_update()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

  -- Impede transferência de user_id pelo usuário autenticado
  IF v_role = 'authenticated' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;

  -- Impede alteração de created_at para manter integridade histórica da quota
  NEW.created_at := OLD.created_at;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_orcamento_quota ON public.orcamentos;
CREATE TRIGGER trg_enforce_orcamento_quota
  BEFORE INSERT ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_orcamento_quota();

DROP TRIGGER IF EXISTS trg_protect_orcamento_update ON public.orcamentos;
CREATE TRIGGER trg_protect_orcamento_update
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.protect_orcamento_update();

-- 11.3. Função Segura de Verificação de Quota (RPC check_orcamento_quota)
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

-- 12. Ativação de Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Seguro (RLS)
-- Perfis: Usuário lê e atualiza apenas o próprio perfil
DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON public.profiles;
CREATE POLICY "Usuário lê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.profiles;
CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Clientes: Usuário gerencia apenas seus próprios clientes
DROP POLICY IF EXISTS "Usuário gerencia próprios clientes" ON public.clientes;
CREATE POLICY "Usuário gerencia próprios clientes"
  ON public.clientes FOR ALL
  USING (auth.uid() = user_id);

-- Orçamentos: Usuário gerencia apenas seus próprios orçamentos (Políticas explícitas por operação)
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

-- AI Usage: Usuário visualiza apenas seus próprios consumos
DROP POLICY IF EXISTS "Usuário visualiza seu uso de IA" ON public.ai_usage;
CREATE POLICY "Usuário visualiza seu uso de IA"
  ON public.ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Configurações: Usuário gerencia apenas sua própria empresa
DROP POLICY IF EXISTS "Usuário gerencia próprias configurações" ON public.configuracoes;
CREATE POLICY "Usuário gerencia próprias configurações"
  ON public.configuracoes FOR ALL
  USING (auth.uid() = user_id);

-- 13. Ativação de RLS e Políticas para Mensagens Recebidas do WhatsApp (Exclusivo TURBO)
ALTER TABLE public.mensagens_whatsapp ENABLE ROW LEVEL SECURITY;

-- Usuário autenticado lê apenas as mensagens direcionadas a ele
DROP POLICY IF EXISTS "Usuário lê próprias mensagens whatsapp" ON public.mensagens_whatsapp;
CREATE POLICY "Usuário lê próprias mensagens whatsapp"
  ON public.mensagens_whatsapp FOR SELECT
  USING (auth.uid() = user_id);

-- Usuário autenticado pode atualizar apenas o status 'lida' das próprias mensagens
DROP POLICY IF EXISTS "Usuário atualiza status lida de suas mensagens" ON public.mensagens_whatsapp;
CREATE POLICY "Usuário atualiza status lida de suas mensagens"
  ON public.mensagens_whatsapp FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Permissões estritas:
-- INSERT NUNCA é permitido para o cliente diretamente (bloqueio total).
-- Somente a Edge Function (via service_role) pode inserir mensagens recebidas da Meta.
REVOKE ALL ON public.mensagens_whatsapp FROM PUBLIC, anon;
GRANT SELECT, UPDATE (lida) ON public.mensagens_whatsapp TO authenticated;
GRANT ALL ON public.mensagens_whatsapp TO service_role;

-- 14. Ativação de RLS e Políticas para Conexões WhatsApp (Multi-Tenant)
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário visualiza suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário visualiza suas próprias conexões"
  ON public.whatsapp_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário atualiza suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário atualiza suas próprias conexões"
  ON public.whatsapp_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário exclui suas próprias conexões" ON public.whatsapp_connections;
CREATE POLICY "Usuário exclui suas próprias conexões"
  ON public.whatsapp_connections FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;

-- 14. Função Auxiliar: Descoberta do Prestador (Dono) de Mensagem Inbound
-- Compara o telefone recebido com 'cliente_telefone' em orcamentos ou 'telefone' em clientes.
-- Se houver colisão de clientes em prestadores diferentes, prioriza o cadastro/orçamento mais recente.
CREATE OR REPLACE FUNCTION public.find_whatsapp_message_owner(p_clean_phone TEXT)
RETURNS TABLE (
  user_id UUID,
  cliente_nome TEXT,
  orcamento_id TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_phone_digits TEXT;
  v_last_digits TEXT;
BEGIN
  -- Extrai apenas dígitos
  v_phone_digits := regexp_replace(p_clean_phone, '\D', '', 'g');

  -- Normaliza para os últimos 8 dígitos para cobrir variações de DDD, 9º dígito e DDI
  IF length(v_phone_digits) >= 8 THEN
    v_last_digits := substring(v_phone_digits from length(v_phone_digits) - 7);
  ELSE
    v_last_digits := v_phone_digits;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    -- Prioridade 1: Orçamentos vinculados
    SELECT 
      o.user_id,
      o.cliente_nome,
      o.id AS orcamento_id,
      o.created_at,
      1 AS priority
    FROM public.orcamentos o
    WHERE regexp_replace(o.cliente_telefone, '\D', '', 'g') LIKE '%' || v_last_digits
    
    UNION ALL
    
    -- Prioridade 2: Cadastro de Clientes
    SELECT 
      c.user_id,
      c.nome AS cliente_nome,
      NULL::TEXT AS orcamento_id,
      c.created_at,
      2 AS priority
    FROM public.clientes c
    WHERE regexp_replace(c.telefone, '\D', '', 'g') LIKE '%' || v_last_digits
  )
  SELECT c.user_id, c.cliente_nome, c.orcamento_id, c.created_at
  FROM candidates c
  ORDER BY c.created_at DESC, c.priority ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.find_whatsapp_message_owner(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_whatsapp_message_owner(TEXT) TO service_role;
