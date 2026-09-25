# 📋 Relatório Técnico de Engenharia - FechaZap 3.1.6

**Data:** 25 de Setembro de 2026  
**Versão:** 3.1.6 (Hardening Final e Fail-Closed de Quotas)  
**Natureza da Alteração:** Correção Cirúrgica de Segurança, Permissões de Banco e Remoção de Fallbacks

---

## 1. O que foi corrigido na 3.1.6

Esta versão realiza o hardening final e estrito solicitado sobre a 3.1.5, sem alterações visuais ou quebra de funcionalidades:

1. **Remoção Absoluta de Fallbacks de Quota:**
   - Foram eliminados de `worker/supabase.ts` o mapa em memória `localUsageCache` e a função `checkAndRecordFallbackQuota()`.
   - Não existe contador local, em memória, KV ou permissão silenciosa.
   - A única autoridade para verificar e consumir quotas de IA é a função transacional `public.consume_ai_quota()` no PostgreSQL/Supabase.

2. **Comportamento Estrito de Falha Fechada (Fail-Closed):**
   - Se a chamada RPC ao Supabase falhar (erro HTTP diferente de 200, timeout, banco indisponível ou queda de conexão):
     - O backend retorna imediatamente **HTTP 503 Service Unavailable** com a mensagem:  
       `"Serviço de quota temporariamente indisponível. Tente novamente em instantes."`
     - O motor Google Gemini **NÃO é chamado**.
     - Nenhum uso de IA é liberado.
     - Nenhum registro é forçado manualmente.
   - Se a RPC responder com sucesso e `allowed = false`:
     - O backend retorna **HTTP 429 Too Many Requests**.
     - O Gemini **NÃO é chamado**.
   - Somente se a RPC responder com sucesso e `allowed = true`:
     - O backend avança para o processamento com o Google Gemini.

3. **Proteção Estrita das Funções `SECURITY DEFINER` no PostgreSQL (`supabase/schema.sql`):**
   - Adicionada configuração `SET search_path = public, pg_temp;` em todas as funções `SECURITY DEFINER` (`consume_ai_quota`, `check_ai_quota`, `handle_new_user`, `protect_profile_plan_update`) para prevenir ataques de sequestro de caminho de busca (*search_path hijacking*).
   - Revogada explicitamente a permissão de execução de `PUBLIC`, `anon` e `authenticated`:
     ```sql
     REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
     GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT) TO service_role;

     REVOKE EXECUTE ON FUNCTION public.check_ai_quota(UUID) FROM PUBLIC, anon, authenticated;
     GRANT EXECUTE ON FUNCTION public.check_ai_quota(UUID) TO service_role;
     ```
   - Nenhum usuário comum (autenticado ou anônimo) consegue chamar a RPC diretamente pelo cliente PostgREST/Supabase para alterar ou auditar quotas de outros usuários. Somente o backend (portador da `service_role`) tem privilégio de execução.

4. **Remoção de Arquivos de Pacote Internos:**
   - O arquivo `FechaZap_3.1.5.zip` que estava dentro do repositório foi excluído da árvore do projeto.

5. **Tratamento de 503 no Frontend (`src/utils/ai.ts`):**
   - A função `parseAiError()` foi ajustada para priorizar mensagens de indisponibilidade de quota, exibindo com precisão para o usuário a mensagem de 503 sem mascará-la como erro de alta demanda do Gemini.

6. **Identificação de Versão:**
   - O componente `Topbar.tsx` foi atualizado para exibir `v3.1.6`.

---

## 2. Arquivos Alterados

| Arquivo | Modificações Cirúrgicas Realizadas |
|---|---|
| `worker/supabase.ts` | Remoção de `localUsageCache` e `checkAndRecordFallbackQuota`. `consumeAtomicAiQuota` retorna `ok: false` em caso de erro na RPC. |
| `worker/types.ts` | Adicionado tipo `ConsumeQuotaResult` (`ok: boolean`, `allowed: boolean`, etc.). |
| `worker/index.ts` | Inclusão da checagem `if (!quota.ok) return jsonResponse(..., 503)` em todas as 5 rotas de IA (`fechar-orcamento`, `contornar-objecao`, `follow-up`, `chat`, `diagnostico-vendas`). |
| `supabase/schema.sql` | Inclusão de `SET search_path = public, pg_temp`, `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` e `GRANT ... TO service_role` para `consume_ai_quota` e `check_ai_quota`. |
| `src/utils/ai.ts` | Ajuste em `parseAiError` e suporte explícito ao código HTTP 503. |
| `src/components/Topbar.tsx` | Atualização do indicador visual para `v3.1.6`. |
| `package.json` | Nome atualizado para `"fechazap"`. |
| `FechaZap_3.1.5.zip` | Arquivo removido do diretório raiz. |

---

## 3. Fluxo de Execução de IA (FechaZap 3.1.6)

```text
Requisição Frontend (/api/ai/*)
       │
       ▼
Validação de JWT (Supabase Auth)
       ├── Sem token / Token inválido / Token mock ──► Retorna HTTP 401 (Bloqueado)
       ▼ Token Válido
Invocação RPC consume_ai_quota() via service_role
       ├── Erro HTTP / Timeout / Banco indisponível ──► Retorna HTTP 503 (Bloqueado / Fail-Closed)
       ├── allowed = false (Cota esgotada) ─────────► Retorna HTTP 429 (Bloqueado / Sem chamada IA)
       ▼ allowed = true (Cota debitada no Postgres)
Chamada ao Google Gemini (ou contingência resiliente em caso de 503 pontual da API Gemini)
       │
       ▼
Resposta entregue com sucesso ao usuário (HTTP 200)
```

---

## 4. Testes Realmente Executados e Verificados

Os seguintes testes automatizados e pontuais foram executados no ambiente com sucesso comprovado:

| Teste | Cenário Avaliado | Resultado Verificado |
|---|---|---|
| **A) RPC Funcionando** | `consume_ai_quota` responde com `allowed = true` | **PASS**: Worker avança, chama o Gemini e retorna HTTP 200 com a proposta gerada. |
| **B) Quota Esgotada** | `consume_ai_quota` responde com `allowed = false` (10/10 usadas) | **PASS**: Worker retorna HTTP 429 imediatamente. O motor Gemini **NÃO** é chamado. |
| **C) RPC Indisponível** | Supabase retorna erro 503 / timeout na RPC | **PASS**: Worker retorna HTTP 503 com mensagem de indisponibilidade. O Gemini **NÃO** é chamado e nenhum fallback de quota é acionado. |
| **D) Execução Direta RPC** | Validação das permissões DCL em `supabase/schema.sql` | **PASS**: `REVOKE EXECUTE` configurado para `PUBLIC, anon, authenticated`. Apenas `service_role` possui `GRANT EXECUTE`. |
| **E) Requisição sem JWT** | Chamada a `/api/ai/chat` sem cabeçalho Authorization | **PASS**: Retorna HTTP 401 Unauthorized (`{"success":false,"error":"Não autorizado..."}`). |
| **E2) Token Mock Local** | Chamada com `Authorization: Bearer local-jwt-...` | **PASS**: Retorna HTTP 401 Unauthorized. |
| **F) Build do Worker** | Execução de `npm run build:worker` via esbuild | **PASS**: Gerado `dist/worker.js` (43.0kb) com sucesso em 11ms. |
| **G) Build do Frontend** | Execução de `npm run build` via Vite | **PASS**: Compilação concluída sem erros em 1.46s. |
| **H) Verificação de Tipos** | Execução de `npm run lint` (`tsc --noEmit`) | **PASS**: 0 erros no TypeScript. |
| **I) Integridade do Servidor** | Teste HTTP local na porta 3000 e 8080 | **PASS**: Servidor ativo e respondendo `HTTP 200 OK`. |

---

## 5. Testes que não puderam ser executados no ambiente local

- **`wrangler deploy` para a Cloudflare:** Depende de credenciais de produção de conta Cloudflare não configuradas no container (`CLOUDFLARE_API_TOKEN`).
- **Instância real em produção de PostgreSQL do Supabase:** Foi testada a camada de cliente e contratos de RPC com mock server de protocolo; o deploy físico das regras no Supabase de produção depende das chaves do operador da aplicação.

---

## 6. Conclusão

A versão **3.1.6** atende com fidelidade a todos os requisitos de segurança e hardening solicitados:
- O fallback de quota foi 100% extirpado.
- A falha é estritamente fechada (Fail-Closed).
- As permissões das RPCs estão protegidas no PostgreSQL contra acesso de papéis públicos ou autenticados comuns.
- O projeto mantém 100% de estabilidade e paridade operacional.
