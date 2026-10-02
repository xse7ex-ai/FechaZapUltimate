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

### Fonte de Verdade da Modelagem
- **`supabase/schema.sql`**: **Snapshot Consolidado e Fonte de Verdade** do estado atual do banco de dados (tabelas, triggers, restrições, funções SECURITY DEFINER de menor privilégio e políticas RLS).
- **`supabase/migrations/`**: Histórico incremental de migrações cronológicas aplicadas:
  1. `20260928_enforce_orcamento_quota.sql`: Triggers e enforcement de limite de 5 orçamentos mensais no plano GRATUITO.
  2. `20260928_whatsapp_multitenant_optin.sql`: Estrutura multi-tenant de WhatsApp, deduplicação de mensagens e controle de opt-in/opt-out (`STOP`, `PARAR`).
  3. `20260929_plans_monetization_stripe.sql`:
     - Revogação de permissão `UPDATE (plano)` para `authenticated` e `anon`.
     - Trigger `protect_profile_plan_update()` (Anti-Tampering).
     - Menor privilégio em `calculate_effective_user_plan` e `sync_profile_from_subscription` restritos a `service_role`.

### Aplicando as Migrations
```bash
# Vincular projeto Supabase
supabase link --project-ref seu-project-ref

# Aplicar migrações incrementais
supabase db push
```

---

## 5. Supabase Edge Functions

Localizadas em `supabase/functions/`:

1. **`fecha-ia`**:
   - Gera propostas comerciais e orçamentos estruturados a partir de texto ou áudio transcrito (exclusivo TURBO).
   - Valida JWT e quotas atômicas de IA antes do consumo.
   - **`test_connection`**: Endpoint de diagnóstico que testa a conectividade com o Google Gemini para usuários autenticados sem consumir quota e sem exigir plano TURBO.
   - Comunica-se com o modelo Gemini usando structured JSON output.

2. **`stripe-webhook`**:
   - Processa eventos do Stripe (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`).
   - Valida assinatura HMAC-SHA256 do Stripe e previne ataques de repetição.
   - **Resolução Estrita de Planos**: Nunca concede PRO silenciosamente para produtos ou preços desconhecidos. Se não reconhecido, registra aviso e preserva o plano atual.
   - Aplica idempotência através da tabela `stripe_events`.
   - Altera planos no banco de dados com autoridade exclusiva `service_role`.

3. **`whatsapp-webhook`**:
   - Recebe eventos de mensagens recebidas e status de envio da Meta Cloud API.
   - Valida assinatura criptográfica `X-Hub-Signature-256`.
   - **Roteamento Híbrido Seguro (`resolveCentralWhatsappOwner`)**:
     - *MODO A (Individual)*: Localiza o tenant proprietário via `phone_number_id` cadastrado em `whatsapp_connections` com prioridade total.
     - *MODO B (Central Compartilhado)*: Caso recebido no número central do FechaZap, localiza candidatos por telefone totalmente normalizado (DDI+DDD+número). Recência é usada apenas para descartar inativos (> 12 meses). Se restarem 2 ou mais ativos, o status é obrigatoriamente AMBIGUOUS com falha segura (descarta sem associar arbitrariamente) e emissão de log estruturado.
   - Trata comandos automáticos de descadastro (`STOP`, `PARAR`, `CANCELAR`).
   - Persiste histórico em `mensagens_whatsapp` para o tenant correspondente.

4. **`whatsapp-followup`**:
   - Envia mensagens de acompanhamento comercial via WhatsApp Cloud API oficial (plano TURBO) com fallback universal `wa.me`.
   - **Modelo Híbrido Outbound**:
     - Se o usuário tem conexão ativa em `whatsapp_connections`, prioriza sua conexão individual e valida o `phone_number_id`.
     - Se não possui conexão individual, utiliza com segurança o WhatsApp central autorizado do FechaZap configurado no servidor (`PHONE_NUMBER_ID` e `WHATSAPP_TOKEN`).
     - Rejeita qualquer tentativa de utilizar `phone_number_id` alheio com 403.
     - Nunca expõe tokens ao frontend nem armazena em localStorage.

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
- **Segurança de Quota:** Usuários FREE e PRO têm 0 créditos de IA no backend e são bloqueados antes de qualquer requisição comercial. Usuários TURBO recebem 1.500 créditos mensais debitados atomicamente via `consume_ai_quota`.
- **Diagnóstico:** O teste de conexão está disponível para qualquer usuário autenticado para verificar a prontidão do backend sem consumir quota.
- **Resiliência:** Tratamento específico de erros 503, sanitização de JSON com regex e fallback para resposta padrão sem interrupção de fluxo.

---

## 7. WhatsApp & Políticas de Mensageria

- **Modo Manual:** Geração de link universal `https://wa.me/55...` com mensagem personalizada e chave PIX para qualquer plano sem necessidade de configuração complexa.
- **Modo Oficial Cloud API (Híbrido Controlado):**
  - **MODO A (Individual):** Conexão individual do usuário tem prioridade total e utiliza credenciais/canal exclusivos do usuário.
  - **MODO B (Central Compartilhado):** Fallback seguro para o WhatsApp central autorizado do FechaZap quando o usuário não possui conexão individual ativa.
  - **Segurança de Ambiguidade:** Em caso de múltiplos prestadores com o mesmo cliente no número central sem remetente único recente, executa falha segura (fechada) sem atribuição arbitrária.
  - **Privacidade de Credenciais:** Tokens de acesso e segredos de webhook nunca são expostos ao cliente web nem armazenados no localStorage.

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
