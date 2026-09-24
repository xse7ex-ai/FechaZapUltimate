-- ==============================================================================
-- FechaZap 3.1.4 - Esquema do Banco de Dados PostgreSQL / Supabase
-- Arquitetura: Supabase Auth + Row Level Security (RLS) + Controle de Planos e IA
-- ==============================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Perfis de Usuário (vinculada ao Supabase Auth)
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

-- 4. Tabela de Orçamentos (Base da Verdade para o Copiloto IA)
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT,
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

-- 5. Tabela de Registro de Uso da IA (Auditoria e Controle Comercial de Limites)
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_operacao TEXT NOT NULL, -- 'fechar_orcamento', 'contornar_objecao', 'follow_up', 'chat', 'diagnostico_vendas'
  modelo TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  mes_referencia TEXT NOT NULL, -- formato 'YYYY-MM', ex: '2026-09'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_orcamentos_user_id ON public.orcamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_mes ON public.ai_usage(user_id, mes_referencia);

-- 6. Trigger Automático para Criar Perfil ao Cadastrar Usuário no Supabase Auth
-- REGRA 3.1.5: Todo novo usuário é cadastrado OBRIGATORIAMENTE com plano GRATUITO.
-- Metadados de plano enviados pelo cliente são expressamente ignorados.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Proteção Absoluta contra Alteração do Campo 'plano' pelo Usuário Comum
-- O cliente NUNCA pode alterar o próprio plano via UPDATE comum.
CREATE OR REPLACE FUNCTION public.protect_profile_plan_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plano IS DISTINCT FROM OLD.plano THEN
    -- Apenas chamadas administrativas / service_role podem atualizar o plano
    IF coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' THEN
      NEW.plano := OLD.plano;
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_plan ON public.profiles;
CREATE TRIGGER trg_protect_profile_plan
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan_update();

-- 8. Função ATÔMICA e Transacional de Consumo de Quota de IA (Prevenção de Race Conditions)
-- Executa com LOCK no perfil (FOR UPDATE), verifica o limite real e insere o log no mesmo passo.
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
  -- Trava a linha do perfil para serializar requisições concorrentes do mesmo usuário
  SELECT plano INTO v_plano
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_plano IS NULL THEN
    v_plano := 'GRATUITO';
  END IF;

  -- Define os limites formais da versão 3.1.5
  IF v_plano = 'TURBO' THEN
    v_limit := 1500;
  ELSIF v_plano = 'PRO' THEN
    v_limit := 250;
  ELSE
    v_limit := 10; -- GRATUITO
  END IF;

  v_mes := to_char(NOW(), 'YYYY-MM');

  -- Conta requisições já consumidas no mês de referência
  SELECT COUNT(*) INTO v_current_count
  FROM public.ai_usage
  WHERE user_id = p_user_id AND mes_referencia = v_mes;

  -- Se atingiu ou ultrapassou a quota, nega imediatamente sem reservar
  IF v_current_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'plano', v_plano,
      'used', v_current_count,
      'limit', v_limit,
      'remaining', 0,
      'month', v_mes
    );
  END IF;

  -- Reserva e registra atomicamente a chamada de IA autorizada
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Função de Consulta Informativa de Quota (Read-only)
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
  ELSIF v_plano = 'PRO' THEN
    v_limit := 250;
  ELSE
    v_limit := 10;
  END IF;

  v_mes := to_char(NOW(), 'YYYY-MM');
  SELECT COUNT(*) INTO v_count
  FROM public.ai_usage
  WHERE user_id = user_uuid AND mes_referencia = v_mes;

  RETURN jsonb_build_object(
    'plano', v_plano,
    'used', v_count,
    'limit', v_limit,
    'allowed', (v_count < v_limit),
    'remaining', GREATEST(0, v_limit - v_count),
    'month', v_mes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Ativação de Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Seguro (RLS)
-- Perfis: Usuário vê e edita apenas seu próprio perfil
DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON public.profiles;
CREATE POLICY "Usuário lê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.profiles;
CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Clientes: Usuário opera apenas sobre seus próprios clientes
DROP POLICY IF EXISTS "Usuário gerencia próprios clientes" ON public.clientes;
CREATE POLICY "Usuário gerencia próprios clientes"
  ON public.clientes FOR ALL
  USING (auth.uid() = user_id);

-- Orçamentos: Usuário opera apenas sobre seus próprios orçamentos
DROP POLICY IF EXISTS "Usuário gerencia próprios orçamentos" ON public.orcamentos;
CREATE POLICY "Usuário gerencia próprios orçamentos"
  ON public.orcamentos FOR ALL
  USING (auth.uid() = user_id);

-- Uso de IA: Usuário pode visualizar seus registros de uso
DROP POLICY IF EXISTS "Usuário visualiza seu uso de IA" ON public.ai_usage;
CREATE POLICY "Usuário visualiza seu uso de IA"
  ON public.ai_usage FOR SELECT
  USING (auth.uid() = user_id);
