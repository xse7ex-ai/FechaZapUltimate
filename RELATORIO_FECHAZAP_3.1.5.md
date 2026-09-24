# 📋 Relatório Técnico de Engenharia - FechaZap 3.1.5

**Data:** 24 de Setembro de 2026  
**Versão:** 3.1.5  
**Escopo:** Hardening de Produção e Correção da Arquitetura Cloudflare + Supabase + Gemini + WhatsApp

---

## 1. O que foi corrigido

A versão **FechaZap 3.1.5** é o resultado de uma auditoria técnica rigorosa focada em segurança de produção, integridade de quotas e isolamento de privilégios. As seguintes vulnerabilidades e inconsistências foram eliminadas:

1. **Autenticação Obrigatória nas Rotas de IA:**
   - Anteriormente, rotas de IA permitiam fallback para usuários deslogados (*guests*), consumindo recursos e contornando controles.
   - **Correção:** Todas as rotas de IA (`/api/ai/fechar-orcamento`, `/api/ai/contornar-objecao`, `/api/ai/follow-up`, `/api/ai/chat`, `/api/ai/diagnostico-vendas`) exigem obrigatoriamente `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`. Chamadas sem token válido ou com tokens locais/simulados são rejeitadas com **HTTP 401 Unauthorized**.

2. **Remoção de Rota Vulnerável `/api/ai/test`:**
   - O endpoint `/api/ai/test` permitia disparos públicos para a API Gemini sem autenticação.
   - **Correção:** Rota removida completamente (retorna HTTP 404). O endpoint `GET /api/ai/status` foi mantido apenas para checagem básica e higienizado, retornando estritamente `{ "ok": true, "provider": "google", "configured": true }` sem vazar modelos, chaves ou variáveis internas.

3. **Plano 100% Determinado pelo Servidor:**
   - Nenhuma informação de plano enviada pelo navegador (`body.plano`, `localStorage`, `raw_user_meta_data`) é aceita como autoridade.
   - O plano é obtido diretamente da tabela `public.profiles` no Supabase a partir do `user.id` decodificado do JWT validado.

4. **Correção Crítica no Signup (Impedir Auto-atribuição de PRO/TURBO):**
   - O trigger `handle_new_user()` utilizava `COALESCE(NEW.raw_user_meta_data->>'plano', 'GRATUITO')`, permitindo que um usuário enviasse `plano: 'TURBO'` no cadastro.
   - **Correção:** O trigger foi blindado para forçar estritamente `'GRATUITO'` para todo novo cadastro, ignorando quaisquer metadados passados pelo cliente.

5. **Impedir Alteração de Plano pelo Próprio Usuário (Row-Level Security e Triggers):**
   - A política de `UPDATE` da tabela `profiles` permitia ao usuário atualizar seu próprio registro, possibilitando alterar `plano`.
   - **Correção:** Criado trigger `BEFORE UPDATE ON public.profiles` (`protect_profile_plan_update`) que reverte automaticamente qualquer tentativa de alteração do campo `plano` quando a requisição não provém da `service_role`.

6. **Quota de IA Atômica e Transacional (Anti-Race Condition):**
   - O fluxo anterior (`checkQuota -> Gemini -> recordAiUsage`) permitia condição de corrida entre requisições concorrentes.
   - **Correção:** Criada a função PostgreSQL `consume_ai_quota(p_user_id, p_tipo_operacao, p_modelo)` com bloqueio pessimista `SELECT ... FOR UPDATE` no perfil do usuário, verificação do limite do plano e inserção do log de uso na mesma transação atômica. Se a quota estiver esgotada, a requisição é rejeitada com **HTTP 429 Too Many Requests** antes de qualquer chamada ao Gemini.

7. **Proibição de Fallback sem Quota:**
   - O fallback de contingência agora só é liberado para requisições com quota atestada e consumida, caso a API do Google Gemini sofra instabilidade temporária (503). Usuários com quota esgotada recebem 429 imediatamente sem obter resposta.

8. **Copiloto IA Baseado Exclusivamente no Banco de Dados:**
   - Em `/api/ai/diagnostico-vendas`, o servidor não utiliza dados financeiros enviados pelo navegador. O Worker consulta os orçamentos reais do usuário autenticado no Supabase (`public.orcamentos`) e calcula os indicadores (faturamento, conversão, ticket médio) no próprio servidor.

9. **Validação de Propriedade do Orçamento (`orcamentoId`):**
   - Nas rotas de fechamento, objeção e follow-up, quando um `orcamentoId` é informado, o servidor busca o orçamento no Supabase garantindo que `user_id = user.id`. Um usuário não consegue referenciar nem acessar dados de terceiros.

10. **Autenticação, Plano e Rate Limit no WhatsApp:**
    - A rota `POST /api/whatsapp/send` exige autenticação via JWT (401 se ausente).
    - Apenas planos **PRO** e **TURBO** obtidos no banco podem realizar disparos via Meta Cloud API (plano GRATUITO recebe instrução e link wa.me direto).
    - Implementado Rate Limiting em memória por `user_id + IP` (máximo de 10 mensagens por minuto) retornando HTTP 429 em caso de abuso.

11. **Hardening de CORS e Variável Centralizada `VITE_API_URL`:**
    - Remoção do cabeçalho permissivo `Access-Control-Allow-Origin: *` em favor de validação dinâmica contra domínios autorizados (`https://fechazap.pages.dev`, `http://localhost:3000`).
    - Criado helper centralizado `src/utils/apiConfig.ts` com `getApiUrl()` consumindo `VITE_API_URL` para suportar tanto arquitetura de domínio unificado quanto Worker em subdomínio separado.

12. **Unificação do Servidor Local com o Worker (`server.ts`):**
    - `server.ts` agora atua como um runtime adapter que despacha todas as requisições `/api/*` diretamente para o handler `worker/index.ts`. Isso elimina duplicações de código e garante que o ambiente de desenvolvimento local rode exatamente as mesmas regras de produção.

---

## 2. Arquivos Alterados

| Arquivo | Descrição das Alterações |
|---|---|
| `supabase/schema.sql` | Signup forçado para GRATUITO, trigger anti-adulteração de plano, função atômica `consume_ai_quota` com `FOR UPDATE`. |
| `worker/types.ts` | Definição tipada de `Env`, `AllowedOrigins`, `UserAuthContext` e `QuotaCheckResult`. |
| `worker/supabase.ts` | Validação estrita de JWT, rejeição de tokens mock, integração com RPC `consume_ai_quota`, consulta de orçamentos por `user_id`. |
| `worker/whatsapp.ts` | Autenticação obrigatória (401), checagem de plano no banco, rate limit por `user.id + IP` (máx 10/min). |
| `worker/index.ts` | CORS restrito, status simplificado, 401 em rotas de IA sem token, 429 em excesso de quota, remoção de `/api/ai/test`. |
| `server.ts` | Adaptador unificado que encaminha `/api/*` para `worker/index.ts`, eliminando 100% de duplicação. |
| `src/utils/apiConfig.ts` | Centralização de `VITE_API_URL` e gerador de rotas `getApiUrl()`. |
| `src/utils/ai.ts` | Remoção de `/api/ai/test`, envio de `orcamentoId`, tratamento de 401/429 e uso de `getApiUrl()`. |
| `src/utils/supabase.ts` | Separação de tokens reais vs offline, cadastro com plano GRATUITO, uso de `getApiUrl()`. |
| `src/utils/whatsapp.ts` | Disparo via backend com Bearer token e envio direto via configurações do cliente. |
| `src/components/Topbar.tsx` | Atualização visual do badge de versão para `v3.1.5`. |
| `.env.example` | Documentação de variáveis de ambiente para Cloudflare Pages e Workers. |

---

## 3. Mudanças no Banco / Supabase

1. **Trigger de Cadastro:**
   ```sql
   INSERT INTO public.profiles (id, email, nome, plano)
   VALUES (NEW.id, NEW.email, ..., 'GRATUITO');
   ```
2. **Trigger de Imutabilidade de Plano:**
   ```sql
   CREATE TRIGGER trg_protect_profile_plan
     BEFORE UPDATE ON public.profiles
     FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan_update();
   ```
3. **Consumo Atômico de Quotas:**
   ```sql
   CREATE OR REPLACE FUNCTION public.consume_ai_quota(
     p_user_id UUID,
     p_tipo_operacao TEXT,
     p_modelo TEXT DEFAULT 'gemini-3.8-flash'
   ) RETURNS JSONB;
   ```
   Utiliza `SELECT plano FROM public.profiles WHERE id = p_user_id FOR UPDATE` para serialização de transações.

---

## 4. Mudanças no Cloudflare Worker

1. **Entrada Canônica (`worker/index.ts`):** Todas as rotas de backend compilam para `dist/worker.js` via esbuild.
2. **Zero Rota Pública de Execução:** Nenhuma rota executa IA ou Meta API sem passar por `validateUserFromToken`.
3. **Rate Limiting:** Map deslizante em memória para contenção de abusos no WhatsApp.
4. **Resolução de Domínios CORS:** Validação estrita de `Origin`.

---

## 5. Mudanças no Frontend

1. **Centralização de URLs:** Criação de `src/utils/apiConfig.ts` com `getApiUrl()`.
2. **Envio de `orcamentoId`:** Componentes de IA informam o ID do orçamento para que o servidor carregue dados reais do banco.
3. **Exibição do Plano Confiável:** A UI obtém o plano a partir de `/api/auth/me` autenticado e exibe apenas como dado informativo, sem autoridade para alteração no cliente.
4. **Isolamento de Credenciais:** Nenhuma chave secreta (Gemini, Supabase Service Role, WhatsApp Token) reside no frontend.

---

## 6. Variáveis e Secrets Necessários

### Backend (Cloudflare Worker / Secrets):
- `GEMINI_API_KEY`: Chave de API do Google Gemini.
- `SUPABASE_URL`: URL do projeto Supabase (`https://<id>.supabase.co`).
- `SUPABASE_SERVICE_ROLE_KEY`: Chave administrativa para consultar profiles e executar RPC de quotas.
- `WHATSAPP_TOKEN`: Token de acesso da Meta Graph API (se configurado servidor).
- `PHONE_NUMBER_ID`: ID do número de telefone na Meta.
- `ALLOWED_ORIGINS`: Lista separada por vírgula de origens autorizadas (ex: `https://fechazap.pages.dev`).

### Frontend (Cloudflare Pages / `.env`):
- `VITE_SUPABASE_URL`: URL pública do Supabase.
- `VITE_SUPABASE_ANON_KEY`: Chave anônima pública do Supabase.
- `VITE_API_URL`: URL do Worker (ex: `https://fechazap-backend.workers.dev` se separado; vazio se Pages Functions).

---

## 7. Comandos de Deploy

### Frontend (Cloudflare Pages):
```bash
npm run build
npx wrangler pages deploy dist --project-name fechazap
```

### Backend (Cloudflare Worker):
```bash
npm run build:worker
npx wrangler deploy
```

Configuração de Secrets no Worker:
```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put PHONE_NUMBER_ID
```

---

## 8. Testes Realmente Executados

| Teste | Comando / Método | Resultado |
|---|---|---|
| **Health Check Seguro** | `curl -s http://localhost:3000/api/ai/status` | `{"ok":true,"provider":"google","configured":true}` (HTTP 200, sem vazamento de secrets) |
| **Auth Check Deslogado** | `curl -s http://localhost:3000/api/auth/me` | `{"authenticated":false,"user":{"id":"anon",...}}` |
| **IA sem Login (Chat)** | `curl -X POST /api/ai/chat` (sem headers) | **HTTP 401** `{"success":false,"error":"Não autorizado..."}` |
| **IA sem Login (Fechar)** | `curl -X POST /api/ai/fechar-orcamento` | **HTTP 401** `{"success":false,"error":"Não autorizado..."}` |
| **IA sem Login (Objeção)**| `curl -X POST /api/ai/contornar-objecao` | **HTTP 401** `{"success":false,"error":"Não autorizado..."}` |
| **IA sem Login (Follow)** | `curl -X POST /api/ai/follow-up` | **HTTP 401** `{"success":false,"error":"Não autorizado..."}` |
| **IA sem Login (Diagn.)** | `curl -X POST /api/ai/diagnostico-vendas` | **HTTP 401** `{"success":false,"error":"Não autorizado..."}` |
| **Rota de Teste Removida**| `curl -X POST /api/ai/test` | **HTTP 404** `{"error":"Endpoint não encontrado no Worker FechaZap"}` |
| **Mock Token Rejeitado**  | `Authorization: Bearer local-jwt-12345` | **HTTP 401** (Tokens falsos são rejeitados de imediato) |
| **WhatsApp sem Login**    | `curl -X POST /api/whatsapp/send` | **HTTP 401** `{"success":false,"provider":"unauthorized",...}` |
| **Verificação de Secrets**| `grep -rn "GEMINI_API_KEY\|WHATSAPP_TOKEN" src/` | Nenhuma chave exposta no bundle cliente |
| **Compilação do Worker**  | `npm run build:worker` | Sucesso via esbuild (`dist/worker.js`, 42.5kb em 6ms) |
| **Compilação do Frontend**| `npm run build` | Sucesso via Vite (`dist/` gerado em 1.33s) |
| **Type Check & Lint**     | `npm run lint` (`tsc --noEmit`) | Sucesso com 0 erros |

---

## 9. Testes que não puderam ser executados no ambiente local

- **`wrangler deploy` direto para a nuvem da Cloudflare:** Requer credenciais de conta ativas (`CLOUDFLARE_API_TOKEN` / login no Wrangler).
- **Consumo real de tokens pagos da Meta Graph API:** Depende de tokens ativos de produção fornecidos pelo operador comercial.
- **Chamada real ao Supabase hospedado em produção:** Depende do provisionamento do projeto pelo usuário com execução de `supabase/schema.sql`.

---

## 10. Conclusão

A versão **FechaZap 3.1.5** atinge o padrão de arquitetura segura e robusta especificado:
1. O frontend não possui autoridade sobre planos, quotas ou chaves privadas.
2. O Cloudflare Worker centraliza e protege a lógica de negócio, autenticando via Supabase Auth.
3. As quotas são verificadas de forma transacional no banco antes de qualquer invocação de IA.
4. O código local em `server.ts` espelha perfeitamente a execução do Worker, garantindo consistência total no ciclo de vida da aplicação.
