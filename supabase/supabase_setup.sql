-- ==============================================================================
-- SCHEMA SUPABASE: FECHAZAP / CLOSI
-- Sistema de Envio de Propostas Comerciais com Foco em Conversão via WhatsApp
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TIPOS CUSTOMIZADOS (ENUMS)
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE status_proposta AS ENUM (
        'rascunho',
        'enviada',
        'visualizada',
        'em_negociacao',
        'aceita',
        'recusada',
        'expirada'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_evento_tracking AS ENUM (
        'proposta_aberta',
        'tempo_leitura',
        'cta_whatsapp_clicado',
        'pdf_baixado',
        'aceite_iniciado',
        'proposta_aceita',
        'proposta_recusada'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. FUNÇÕES UTILITÁRIAS & TRIGGERS
-- ==============================================================================

-- Função para atualizar automaticamente o campo updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. TABELAS PRINCIPAIS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TABELA: perfis (Extensão de auth.users com dados da empresa/vendedor)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    nome_empresa VARCHAR(255),
    whatsapp VARCHAR(30) NOT NULL,
    logo_url TEXT,
    chave_pix VARCHAR(255),
    tipo_chave_pix VARCHAR(50),
    cor_primaria VARCHAR(10) DEFAULT '#25D366', -- Verde WhatsApp por padrão
    mensagem_padrao_whatsapp TEXT DEFAULT 'Olá {{cliente_nome}}, preparei a sua proposta personalizada: {{link_proposta}}',
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_timestamp_perfis
BEFORE UPDATE ON public.perfis
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ------------------------------------------------------------------------------
-- TABELA: clientes (Base de leads/clientes para envio via WhatsApp)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    documento VARCHAR(30), -- CPF ou CNPJ
    empresa VARCHAR(255),
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON public.clientes(whatsapp);

CREATE TRIGGER set_timestamp_clientes
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ------------------------------------------------------------------------------
-- TABELA: produtos_servicos (Catálogo para montagem rápida da proposta)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produtos_servicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco_padrao NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unidade_medida VARCHAR(20) DEFAULT 'un', -- un, hora, mes, projeto
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_produtos_user_id ON public.produtos_servicos(user_id);

CREATE TRIGGER set_timestamp_produtos_servicos
BEFORE UPDATE ON public.produtos_servicos
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ------------------------------------------------------------------------------
-- TABELA: propostas (Núcleo de conversão e link compartilhado via WhatsApp)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.propostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    
    -- Identificador único e seguro para acesso público do cliente
    slug VARCHAR(64) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    status status_proposta NOT NULL DEFAULT 'rascunho',
    
    -- Valores financeiros
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    desconto NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Condições comerciais
    forma_pagamento TEXT,
    condicoes_parcelamento TEXT,
    prazo_entrega VARCHAR(100),
    data_validade TIMESTAMPTZ NOT NULL,
    
    -- Dados de conversão e WhatsApp
    mensagem_whatsapp TEXT,
    telefone_contato_whatsapp VARCHAR(30), -- WhatsApp do vendedor na proposta
    
    -- Timestamps de ciclo de vida
    enviada_em TIMESTAMPTZ,
    primeira_visualizacao_em TIMESTAMPTZ,
    ultima_visualizacao_em TIMESTAMPTZ,
    aceita_em TIMESTAMPTZ,
    recusada_em TIMESTAMPTZ,
    motivo_recusa TEXT,
    
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_propostas_user_id ON public.propostas(user_id);
CREATE INDEX IF NOT EXISTS idx_propostas_cliente_id ON public.propostas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_propostas_slug ON public.propostas(slug);
CREATE INDEX IF NOT EXISTS idx_propostas_status ON public.propostas(status);

CREATE TRIGGER set_timestamp_propostas
BEFORE UPDATE ON public.propostas
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ------------------------------------------------------------------------------
-- TABELA: itens_proposta (Itens individuais que compõem o valor total)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_proposta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposta_id UUID NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
    produto_servico_id UUID REFERENCES public.produtos_servicos(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    quantidade NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    valor_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    valor_total NUMERIC(12, 2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
    ordem INT DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_itens_proposta_proposta_id ON public.itens_proposta(proposta_id);

-- ------------------------------------------------------------------------------
-- TABELA: tracking_eventos_proposta (Telemetria em tempo real das ações do cliente)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracking_eventos_proposta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposta_id UUID NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
    tipo tipo_evento_tracking NOT NULL,
    ip_origem VARCHAR(45),
    user_agent TEXT,
    tempo_segundos INT DEFAULT 0,
    metadados JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_proposta_id ON public.tracking_eventos_proposta(proposta_id);
CREATE INDEX IF NOT EXISTS idx_tracking_tipo ON public.tracking_eventos_proposta(tipo);

-- ------------------------------------------------------------------------------
-- TABELA: templates_whatsapp (Copywriting persuasivo e templates de follow-up)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.templates_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    titulo VARCHAR(100) NOT NULL, -- Ex: 'Envio Inicial', 'Follow-up 24h', 'Oferta Expirando'
    gatilho VARCHAR(50),          -- 'envio', 'visualizada_sem_resposta', 'expirando'
    conteudo TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates_whatsapp(user_id);

CREATE TRIGGER set_timestamp_templates_whatsapp
BEFORE UPDATE ON public.templates_whatsapp
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ==============================================================================
-- 5. TRIGGER AUTOMÁTICO: NOVO USUÁRIO AUTH -> CRIA PERFIL
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, whatsapp)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Vendedor'),
    COALESCE(NEW.raw_user_meta_data->>'whatsapp', NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- 6. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_proposta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_eventos_proposta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates_whatsapp ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- POLÍTICAS: perfis
-- ------------------------------------------------------------------------------
CREATE POLICY "Usuários podem gerenciar seu próprio perfil"
ON public.perfis FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Clientes públicos visualizando uma proposta podem ver os dados públicos do perfil do vendedor
CREATE POLICY "Acesso público ao perfil do vendedor via proposta pública"
ON public.perfis FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.user_id = perfis.id
    )
);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: clientes
-- ------------------------------------------------------------------------------
CREATE POLICY "Usuários gerenciam apenas seus próprios clientes"
ON public.clientes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: produtos_servicos
-- ------------------------------------------------------------------------------
CREATE POLICY "Usuários gerenciam apenas seus produtos e serviços"
ON public.produtos_servicos FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: propostas
-- ------------------------------------------------------------------------------
-- Vendedores têm acesso total às suas próprias propostas
CREATE POLICY "Vendedor gerencia suas próprias propostas"
ON public.propostas FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Acesso anônimo/público de leitura para quem tem o slug da proposta (cliente abrindo pelo WhatsApp)
CREATE POLICY "Visualização pública de proposta via slug"
ON public.propostas FOR SELECT
USING (slug IS NOT NULL);

-- Atualização restrita via público (ex: cliente aceitando ou recusando via landing page da proposta)
CREATE POLICY "Cliente atualiza status de proposta via slug público"
ON public.propostas FOR UPDATE
USING (slug IS NOT NULL)
WITH CHECK (slug IS NOT NULL);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: itens_proposta
-- ------------------------------------------------------------------------------
-- Vendedor gerencia itens de suas propostas
CREATE POLICY "Vendedor gerencia itens de suas propostas"
ON public.itens_proposta FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.id = itens_proposta.proposta_id AND p.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.id = itens_proposta.proposta_id AND p.user_id = auth.uid()
    )
);

-- Visualização pública dos itens para renderizar a proposta ao cliente
CREATE POLICY "Acesso público aos itens da proposta"
ON public.itens_proposta FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.id = itens_proposta.proposta_id
    )
);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: tracking_eventos_proposta
-- ------------------------------------------------------------------------------
-- Vendedor visualiza os eventos de tracking de suas propostas
CREATE POLICY "Vendedor visualiza analytics de suas propostas"
ON public.tracking_eventos_proposta FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.id = tracking_eventos_proposta.proposta_id AND p.user_id = auth.uid()
    )
);

-- Inserção pública de eventos (ao abrir a proposta ou clicar nos CTAs)
CREATE POLICY "Qualquer visitante da proposta pode registrar evento de telemetria"
ON public.tracking_eventos_proposta FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.propostas p
        WHERE p.id = tracking_eventos_proposta.proposta_id
    )
);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: templates_whatsapp
-- ------------------------------------------------------------------------------
CREATE POLICY "Usuário gerencia seus templates de WhatsApp"
ON public.templates_whatsapp FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 7. FUNÇÃO RPC: REGISTRAR VISITA NA PROPOSTA (TRACKING CONVERSÃO)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.registrar_visualizacao_proposta(p_slug VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_proposta_id UUID;
    v_status_atual status_proposta;
    v_primeira_visita TIMESTAMPTZ;
BEGIN
    SELECT id, status, primeira_visualizacao_em
    INTO v_proposta_id, v_status_atual, v_primeira_visita
    FROM public.propostas
    WHERE slug = p_slug;

    IF v_proposta_id IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'erro', 'Proposta não encontrada');
    END IF;

    -- Atualiza primeira e última visualização e avança status caso ainda esteja em 'enviada'
    UPDATE public.propostas
    SET
        primeira_visualizacao_em = COALESCE(v_primeira_visita, NOW()),
        ultima_visualizacao_em = NOW(),
        status = CASE WHEN status = 'enviada' THEN 'visualizada'::status_proposta ELSE status END
    WHERE id = v_proposta_id;

    -- Registra o evento de telemetria
    INSERT INTO public.tracking_eventos_proposta (proposta_id, tipo)
    VALUES (v_proposta_id, 'proposta_aberta');

    RETURN jsonb_build_object(
        'sucesso', true,
        'proposta_id', v_proposta_id,
        'status', CASE WHEN v_status_atual = 'enviada' THEN 'visualizada' ELSE v_status_atual::text END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
