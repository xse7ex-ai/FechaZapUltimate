# FechaZap 3.3.0 • Documentação Oficial & Manual de Produção

> **Versão Oficial:** `3.3.0`  
> **Arquitetura:** React 19 + TypeScript + Tailwind CSS + Supabase (PostgreSQL & Edge Functions) + Gemini AI + PWA + WhatsApp Cloud API

---

## 1. Visão Geral do Sistema

O **FechaZap** é uma plataforma comercial moderna projetada para prestadores de serviços, profissionais autônomos e pequenas e médias empresas emitirem orçamentos profissionais, gerarem documentos em PDF/impressão sanitizados contra XSS, enviarem propostas comerciais detalhadas via WhatsApp e acelerarem fechamentos com Inteligência Artificial (Google Gemini).

---

## 2. Instalação e Execução Local

### Pré-requisitos
- **Node.js** 20+ ou **Bun** 1.0+
- **NPM** 10+
- **Supabase CLI** (para execução local ou deploy de Edge Functions)

### Passos de Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/seu-usuario/fechazap.git
cd fechazap

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env

# 4. Executar em modo desenvolvimento
npm run dev

# 5. Executar lint e testes
npm run lint
npm run build
bun test
```

---

## 3. Variáveis de Ambiente

Consulte `.env.example` para referências.

### Frontend (`.env` ou variáveis no Netlify / Vercel)
| Variável | Obrigatória | Descrição | Exemplo |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Sim | URL do projeto Supabase | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Sim | Chave pública `anon` do Supabase | `eyJhbGciOi...` |

### Backend / Supabase Secrets (Edge Functions)
Configurados via `supabase secrets set`:

| Secret | Obrigatória | Descrição |
|---|---|---|
| `FRONTEND_ORIGIN` | Sim | URL permitida no CORS (ex: `https://fechazap.app`) |
| `GEMINI_API_KEY` | Sim (TURBO) | Chave de API do Google Gemini |
| `WHATSAPP_TOKEN` | Sim (Cloud API) | Token de acesso do Meta WhatsApp Business |
| `WHATSAPP_APP_SECRET` | Sim (Webhook) | Segredo do aplicativo Meta para validação HMAC-SHA256 |
| `WHATSAPP_VERIFY_TOKEN` | Sim (Webhook) | Token personalizado para verificação do webhook da Meta |
| `PHONE_NUMBER_ID` | Sim (Cloud API) | ID do número do WhatsApp Business |
| `STRIPE_SECRET_KEY` | Sim (Stripe) | Chave secreta da API do Stripe |
| `STRIPE_WEBHOOK_SECRET` | Sim (Stripe) | Segredo do webhook de eventos do Stripe (`whsec_...`) |

---

## 4. Banco de Dados e Migrations (Supabase PostgreSQL)

O banco é protegido por **Row Level Security (RLS)** em todas as tabelas. Nenhuma linha é visível ou mutável fora do `user_id` autenticado.

### Arquivos de Migração (`supabase/migrations/`)
1. `schema.sql`: Estrutura inicial das tabelas `profiles`, `empresa_config`, `clientes`, `orcamentos`, `mensagens_whatsapp` com RLS ativado.
2. `20260928_enforce_orcamento_quota.sql`: Triggers e stored procedure `can_create_orcamento(user_uuid)` que impõe limite de 5 orçamentos mensais no plano GRATUITO.
3. `20260928_whatsapp_multitenant_optin.sql`: Estrutura para webhooks WhatsApp, deduplicação de mensagens e controle de opt-in/opt-out (`STOP`, `PARAR`).
4. `20260929_plans_monetization_stripe.sql`:
   - Revogação de permissão `UPDATE (plano)` para `authenticated` e `anon`.
   - Trigger `protect_profile_plan_update()` (Anti-Tampering definitivo).
   - Tabela `subscription_history` e RPC de débito de IA `check_and_consume_ia_quota`.

### Aplicando as Migrations
```bash
# Vincular projeto Supabase
supabase link --project-ref seu-project-ref

# Aplicar migrações
supabase db push
```

---

## 5. Supabase Edge Functions

Localizadas em `supabase/functions/`:

1. **`fecha-ia`**:
   - Gera propostas comerciais e orçamentos estruturados a partir de texto ou áudio transcrito.
   - Valida JWT e quotas de IA antes do consumo.
   - Comunica-se com o modelo Gemini usando structured JSON output.

2. **`stripe-webhook`**:
   - Processa eventos do Stripe (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`).
   - Valida assinatura HMAC do Stripe.
   - Aplica idempotência através da tabela de eventos processados.
   - Altera planos no banco de dados com autoridade exclusiva `service_role`.

3. **`whatsapp-webhook`**:
   - Recebe eventos de mensagens recebidas e status de envio da Meta.
   - Valida `X-Hub-Signature-256`.
   - Trata comandos de descadastramento (`STOP`, `PARAR`).
   - Persiste histórico em `mensagens_whatsapp` para o tenant correspondente.

4. **`whatsapp-followup`**:
   - Envia mensagens de acompanhamento comercial via WhatsApp Cloud API oficial (plano TURBO) com fallback universal `wa.me`.

### Deploy das Edge Functions
```bash
supabase functions deploy fecha-ia
supabase functions deploy stripe-webhook
supabase functions deploy whatsapp-webhook
supabase functions deploy whatsapp-followup
```

---

## 6. Inteligência Artificial (Google Gemini)

- **Modelo Utilizado:** Gemini Flash otimizado para alta velocidade e baixa latência.
- **Segurança de Quota:** Usuários FREE e PRO têm 0 créditos de IA no backend e são bloqueados antes de qualquer requisição. Usuários TURBO recebem 1.500 créditos mensais.
- **Resiliência:** Tratamento específico de erros 503, sanitização de JSON com regex e fallback para resposta padrão sem interrupção de fluxo.

---

## 7. WhatsApp & Políticas de Mensageria

- **Modo Manual:** Geração de link universal `https://wa.me/55...` com mensagem personalizada e chave PIX para qualquer plano sem necessidade de configuração complexa.
- **Modo Oficial Cloud API:** Disparo de templates homologados via Edge Function para planos TURBO com WhatsApp Business API.
- **Isolamento de Tenant:** Proibido roteamento heurístico por DDD ou tenant aleatório; todo evento exige validação de identificador de empresa e deduplicação de mensagens.

---

## 8. PWA (Progressive Web App)

- **Instalabilidade:** Suporte a Android, iOS e Desktop com `manifest.json` e ícones maskable.
- **Offline First:** Service Worker com cache `fechazap-cache-v3.3.0` mantendo navegação e recursos locais mesmo sem conexão de internet.
- **Sincronização Offline:** Fila indexada por usuário para sincronização imediata no retorno da rede.

---

## 9. Deploy do Frontend (Produção)

### Netlify / Vercel / Cloudflare Pages

1. **Build Command:** `npm run build`
2. **Publish Directory:** `dist`
3. **SPA Redirects:** Adicionar regra `/* /index.html 200` (já presente em `public/_redirects`).
4. **Variáveis de Ambiente:** Preencher `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

---

## 10. Checklist de Segurança e Release

- [x] Zero credenciais privadas no repositório.
- [x] `npm run lint` validado com 0 erros.
- [x] `npm run build` compilado com sucesso.
- [x] RLS e triggers de proteção contra adulteração ativos.
- [x] Versão unificada em `3.3.0`.
