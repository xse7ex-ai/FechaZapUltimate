# 📋 RELATÓRIO TÉCNICO DE ENGENHARIA - FECHAZAP 3.1.4

**Data:** 24 de Setembro de 2026  
**Versão:** 3.1.4 (Cloudflare & Supabase Production-Ready)  
**Engenharia Conjunta:** Kênyson + ChatGPT + Claude + Google Gemini  

---

## 1. Sumário Executivo

A versão **3.1.4** do FechaZap consolida a transição arquitetural de uma aplicação baseada exclusivamente em servidor Node/Express tradicional para uma **infraestrutura nativa de Edge Computing no Cloudflare Workers / Cloudflare Pages**, integrada com autenticação **Supabase Auth**, autoridade de planos (**GRATUITO**, **PRO**, **TURBO**), cotas de consumo de IA com validação no banco de dados e envio de WhatsApp via Meta Cloud API 100% server-side.

A regra fundamental de segurança da 3.1.3 foi preservada e aprofundada:
> **O Frontend jamais conhece, manipula ou recebe `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `WHATSAPP_TOKEN`.**
> Todas as chamadas protegidas passam por validação de token JWT no Cloudflare Worker / backend, que consulta o plano real e cotas diretamente no Supabase.

---

## 2. Comparativo: Arquitetura Anterior vs. Nova Arquitetura

### 2.1 Arquitetura Anterior (v3.1.3)
```text
┌────────────────┐          ┌───────────────────────┐          ┌─────────────────┐
│ React / Vite   │ ───────> │  Express.js (Node.js) │ ───────> │  Google Gemini  │
│ (Navegador)    │          │  (dist/server.js)     │          │  API            │
└────────────────┘          └───────────────────────┘          └─────────────────┘
         │
         ▼
  localStorage (autoridade de dados e planos)
  x-gemini-key / geminiKeyCustom (resquícios)
```

### 2.2 Nova Arquitetura de Produção (v3.1.4)
```text
                        ┌───────────────────────────────┐
                        │      Cliente FechaZap 3.1.4   │
                        │    (React / PWA / Tailwind)   │
                        │  Hospedado no Cloudflare Pages│
                        └───────────────┬───────────────┘
                                        │
                         Bearer JWT (Supabase Auth)
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │    Cloudflare Worker (Edge)   │
                        │      (worker/index.ts)        │
                        │  Validação JWT + Limite Plano │
                        └───────┬───────┬───────┬───────┘
                                │       │       │
            ┌───────────────────┘       │       └──────────────────┐
            ▼                           ▼                          ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│     Supabase DB       │   │    Google Gemini      │   │   Meta WhatsApp       │
│  - Profiles (Planos)  │   │  - gemini-3.8-flash   │   │     Cloud API         │
│  - Orçamentos Reais   │   │  - Fallback Resiliente│   │  - Token no servidor  │
│  - ai_usage (Cotas)   │   │  - Contingência       │   │  - PRO / TURBO        │
└───────────────────────┘   └───────────────────────┘   └───────────────────────┘
```

---

## 3. Arquivos Criados e Alterados

| Arquivo | Status | Finalidade |
| :--- | :---: | :--- |
| `worker/index.ts` | **Novo** | Roteador e handler principal do Cloudflare Worker com CORS, JWT e limites. |
| `worker/gemini.ts` | **Novo** | Cliente Gemini REST para Edge com multi-model fallback e contingência inteligente. |
| `worker/supabase.ts` | **Novo** | Validador de JWT, consulta autoritária de plano, controle de cotas e orçamentos reais. |
| `worker/whatsapp.ts` | **Novo** | Despacho seguro de mensagens via Meta Graph API com autorização por plano. |
| `worker/types.ts` | **Novo** | Tipagem de variáveis de ambiente (`Env`), cotas e contexto do usuário autenticado. |
| `wrangler.toml` | **Novo** | Configuração oficial de deploy do Cloudflare Worker. |
| `supabase/schema.sql` | **Novo** | Script DDL completo de PostgreSQL (tabelas, RLS, triggers e funções de cota). |
| `src/utils/supabase.ts` | **Novo** | Utilitário de autenticação frontend (Login, Cadastro, Sessão JWT). |
| `src/components/ModalPerfilUsuario.tsx` | **Novo** | Interface de gerenciamento de conta, visualização de cota mensal e comparativo de planos. |
| `server.ts` | **Atualizado** | Compatibilidade total com ambiente de desenvolvimento local / Node dev server (porta 3000), removendo resquícios de chaves personalizadas e adicionando verificação JWT/planos. |
| `src/types.ts` | **Atualizado** | Remoção de `geminiKeyCustom` de `ConfiguracaoEmpresa` e adição de tipos de planos (`GRATUITO`, `PRO`, `TURBO`). |
| `src/utils/ai.ts` | **Atualizado** | Removido `customKey` e `x-gemini-key`. Injeção automática de `Bearer <token>` via Supabase. |
| `src/utils/whatsapp.ts` | **Atualizado** | Função `sendWhatsAppViaApi` integrada ao endpoint seguro do backend. |
| `src/components/ModalConfiguracoes.tsx` | **Atualizado** | Removido campo de chave manual; adicionado selo de garantia de segurança no servidor. |
| `src/components/ModalIA.tsx` | **Atualizado** | Limpeza de argumentos legados de chave de API. |
| `src/components/RelatoriosView.tsx` | **Atualizado** | Integração do Copiloto para indicar procedência dos dados (banco Supabase vs. local). |
| `src/components/Topbar.tsx` | **Atualizado** | Versão atualizada para v3.1.4 e botão dinâmico com badge do plano do usuário. |
| `src/components/Sidebar.tsx` | **Atualizado** | Link direto para "Minha Conta & Plano". |
| `src/App.tsx` | **Atualizado** | Injeção de verificação de cota, abertura do Modal de Perfil e limpeza de chaves. |
| `.env.example` | **Atualizado** | Documentação completa de todas as variáveis do Worker e do Frontend. |

---

## 4. Rotas da API Migradas

Todas as rotas existentes da 3.1.3 foram migradas para o **Cloudflare Worker** (`worker/index.ts`) e replicadas no `server.ts` para ambiente de desenvolvimento local:

| Método | Endpoint | Autenticação / Regra | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/ai/status` | Pública | Retorna o status de conexão com o Gemini e modelo ativo (`gemini-3.8-flash`). |
| `POST` | `/api/ai/test` | Pública / Bearer | Teste de conectividade real do modelo Gemini. |
| `GET` | `/api/auth/me` | Bearer JWT | Retorna o perfil do usuário, plano atual e cota mensal utilizada/disponível. |
| `POST` | `/api/ai/fechar-orcamento` | Bearer (opcional/cota) | Geração de copy persuasiva com gatilhos mentais e CTA para fechamento. |
| `POST` | `/api/ai/contornar-objecao` | Bearer (opcional/cota) | Gera 2 alternativas de contorno para objeções comuns ("tá caro", sócio, etc). |
| `POST` | `/api/ai/follow-up` | Bearer (opcional/cota) | Mensagem educada e estratégica para reativar orçamentos sem resposta. |
| `POST` | `/api/ai/chat` | Bearer (opcional/cota) | Consultor de vendas interativo para técnicas de precificação e scripts. |
| `POST` | `/api/ai/diagnostico-vendas` | Bearer (opcional/cota) | **Copiloto IA:** Quando autenticado, busca orçamentos reais no Supabase e audita gargalos. |
| `POST` | `/api/whatsapp/send` | Bearer (Planos PRO/TURBO) | Despacha mensagem via Meta WhatsApp Cloud API diretamente do servidor. |
| `GET` | `/api/whatsapp/status` | Pública | Indica se a API oficial da Meta está configurada no servidor. |

---

## 5. Autenticação e Autoridade de Planos

### 5.1 Hierarquia de Planos e Limites de IA

| Plano | Limite Mensal IA | Copiloto Supabase | WhatsApp Meta API | Armazenamento |
| :--- | :---: | :---: | :---: | :---: |
| **GRATUITO** | 10 requisições/mês | Modo demonstração | Fallback WhatsApp Web (`wa.me`) | LocalStorage / Offline |
| **PRO** | 250 requisições/mês | Dados reais do banco | Fallback Web / Habilitado | Supabase Cloud |
| **TURBO** | 1500 requisições/mês | Dados reais + prioridade | Despacho 100% automatizado | Supabase Multi-device |

### 5.2 Como o Servidor Determina o Plano
1. O cliente envia `Authorization: Bearer <token_supabase>`.
2. O Worker contacta `${SUPABASE_URL}/auth/v1/user` para validar a assinatura criptográfica do JWT.
3. Se válido, o Worker consulta `${SUPABASE_URL}/rest/v1/profiles` usando a `SUPABASE_SERVICE_ROLE_KEY`.
4. O servidor obtém o campo `plano` cadastrado na base de dados.
5. Em seguida, conta quantas requisições existem na tabela `ai_usage` para o mês corrente (`YYYY-MM`).
6. Se `used >= limit`, a requisição é rejeitada com código HTTP `403 Forbidden` e aviso amigável de upgrade.

---

## 6. O Copiloto IA (Diagnóstico Baseado no Banco de Dados)

Na versão anterior, o navegador calculava as métricas e enviava o JSON para a IA. Na 3.1.4:
1. Quando o usuário autenticado clica em **"Gerar Diagnóstico com IA"**:
2. O Worker recebe o JWT e identifica o `user.id`.
3. O Worker executa uma query direta no Supabase:
   ```sql
   SELECT numero, cliente_nome, valor_total, status, data_criacao, itens
   FROM public.orcamentos
   WHERE user_id = :user_id
   ORDER BY data_criacao DESC LIMIT 50;
   ```
4. O Worker compila o faturamento aprovado verdadeiro, taxa de conversão real e ticket médio.
5. O prompt enviado ao Gemini utiliza **exclusivamente os dados auditados do banco**.
6. A resposta retorna com a flag `dataSource: "supabase_real"`.
7. Usuários sem login continuam podendo testar o app em modo demonstração local com aviso de validação.

---

## 7. Meta WhatsApp Cloud API Segura

- O frontend invoca `POST /api/whatsapp/send`.
- O payload contém apenas `{ to, message, orcamentoId }`.
- O token `WHATSAPP_TOKEN` da Meta e o `PHONE_NUMBER_ID` ficam exclusivamente no ambiente do Worker.
- Usuários do plano `GRATUITO` ou quando as credenciais da Meta não estão configuradas recebem resposta com `fallbackUrl` (`wa.me`), garantindo que **nenhum orçamento deixe de ser enviado**, mesmo sem a API da Meta configurada.

---

## 8. Configuração de Variáveis de Ambiente e Segredos

### 8.1 No Cloudflare Workers
Execute os seguintes comandos via CLI do Wrangler para injetar os segredos de forma criptografada:

```bash
# 1. Chave da Google Gemini API
npx wrangler secret put GEMINI_API_KEY

# 2. Supabase Backend
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_ANON_KEY

# 3. Meta WhatsApp (Opcional para envio corporativo)
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put PHONE_NUMBER_ID
```

### 8.2 No Cloudflare Pages (Frontend)
No painel do Cloudflare Pages (Configurações > Variáveis de Ambiente):
- `VITE_SUPABASE_URL`: URL pública do seu projeto Supabase (ex: `https://xyz.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Chave anônima pública do Supabase

---

## 9. Instruções de Implantação (Passo a Passo)

### Passo 1: Executar o Esquema no Supabase
1. Acesse o painel do seu projeto no [Supabase](https://supabase.com).
2. Vá em **SQL Editor**.
3. Abra e execute o arquivo `supabase/schema.sql`.
4. As tabelas `profiles`, `orcamentos`, `clientes`, `ai_usage` e as políticas de RLS serão criadas automaticamente.

### Passo 2: Publicar o Cloudflare Worker
1. Instale as dependências (se ainda não o fez):
   ```bash
   npm install
   ```
2. Realize o login no Cloudflare:
   ```bash
   npx wrangler login
   ```
3. Defina os segredos conforme a seção 8.1.
4. Execute o deploy do backend Worker:
   ```bash
   npx wrangler deploy
   ```

### Passo 3: Publicar o Frontend no Cloudflare Pages
1. No seu repositório Git, conecte o Cloudflare Pages ao diretório raiz.
2. Defina as configurações de build:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Build Output Directory:** `dist`
3. Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Realize o deploy. O Cloudflare Pages disponibilizará o FechaZap com suporte a PWA e carregamento instantâneo via CDN global.

---

## 10. Validação de Testes e Build Real

- **Compilação e Linter:** Executado `tsc --noEmit` e `vite build`. Todos os componentes e módulos compilam com 0 erros de sintaxe ou tipos.
- **Ambiente de Desenvolvimento:** `server.ts` atualizado na porta 3000 com express e middlewares Vite para desenvolvimento local ininterrupto.
- **Resiliência da IA:** Fallback automático ativo para momentos de alta demanda da API Gemini (código 503 / indisponibilidade temporária), garantindo que o usuário nunca fique sem copy para enviar ao cliente.
