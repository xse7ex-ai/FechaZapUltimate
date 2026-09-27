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

-- 3. Tabela de Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  documento TEXT,
  cidade TEXT,
  endereco TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela de Orçamentos (Status padronizados: pendente, enviado, aprovado, recusado)
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
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

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_profiles_plano ON public.profiles(plano);
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_user_id ON public.orcamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_user_status ON public.orcamentos(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_mes ON public.ai_usage(user_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_configuracoes_user_id ON public.configuracoes(user_id);

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

-- 11. Validação de Quota de Orçamentos Manuais por Plano
--   GRATUITO: máx 5 orçamentos criados no mês atual
--   PRO & TURBO: ilimitado (-1)
CREATE OR REPLACE FUNCTION public.check_orcamento_quota(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  v_plano TEXT;
  v_count INT;
  v_limit INT;
BEGIN
  SELECT plano INTO v_plano FROM public.profiles WHERE id = user_uuid;
  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  IF v_plano = 'GRATUITO' THEN
    v_limit := 5;
    SELECT COUNT(*) INTO v_count
    FROM public.orcamentos
    WHERE user_id = user_uuid
      AND date_trunc('month', created_at) = date_trunc('month', NOW());
  ELSE
    v_limit := -1; -- Ilimitado para PRO e TURBO
    v_count := 0;
  END IF;

  RETURN jsonb_build_object(
    'plano', v_plano,
    'count', v_count,
    'limit', v_limit,
    'allowed', (v_limit = -1 OR v_count < v_limit)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

-- Orçamentos: Usuário gerencia apenas seus próprios orçamentos
DROP POLICY IF EXISTS "Usuário gerencia próprios orçamentos" ON public.orcamentos;
CREATE POLICY "Usuário gerencia próprios orçamentos"
  ON public.orcamentos FOR ALL
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
