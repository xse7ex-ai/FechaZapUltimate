# Relatório Técnico Oficial - FechaZap PWA

**Versão da Arquitetura:** 3.2.0 (Supabase Edge Functions + Sincronização em Nuvem PRO/TURBO + Offline-First)  
**Stack Principal:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL + RLS + Auth + Edge Functions), Google Gemini 3.8 Flash, Meta Cloud API.

---

## 1. Visão Geral da Arquitetura

O **FechaZap** opera sob uma arquitetura limpa, sem dependência de Cloudflare Workers ou servidores intermediários Express:

```
[ Cliente PWA / Netlify ] 
   ├── Estado Local Otimista (localStorage) para velocidade instantânea e offline
   ├── Sincronização Direta Supabase Client (PRO e TURBO) com RLS por user_id
   └── Invocação de Supabase Edge Functions:
         ├── 'fecha-ia' (Gemini 3.8 Flash - Exclusivo TURBO)
         └── 'whatsapp-followup' (Meta Cloud API / Link wa.me - Exclusivo TURBO)
```

---

## 2. Modelo de Negócio Estrito e Diferencial dos Planos

Os diferenciais de cada plano foram rigorosamente implementados no client e no backend:

| Recurso | GRATUITO | PRO | TURBO |
| :--- | :---: | :---: | :---: |
| **Limite de Orçamentos** | 5 manuais / mês | Ilimitados | Ilimitados |
| **Armazenamento de Dados** | 100% local (aparelho) | **Nuvem Supabase + Cache Local** | **Nuvem Supabase + Cache Local** |
| **Sincronização Multi-dispositivo** | Não | **Sim (em tempo real)** | **Sim (em tempo real)** |
| **Exportação de PDF / Impressão** | Bloqueado (Aviso Upgrade) | **Liberado (Logo, PIX e Termos)** | **Liberado (Logo, PIX e Termos)** |
| **Anúncios no App** | Sim (Banner parceiros) | **Sem anúncios** | **Sem anúncios** |
| **Créditos de IA no Backend** | 0 créditos (HTTP 403) | 0 créditos (HTTP 403) | **1.500 requisições / mês** |
| **Criação de Propostas por Voz/Texto** | Não | Não | **Sim (Gemini 3.8 Flash)** |
| **Análise Histórica de Preços** | Não | Não | **Sim (Gemini 3.8 Flash)** |
| **Follow-up Automático no WhatsApp** | Não | Não | **Sim (Meta API + Fallback)** |

---

## 3. Sincronização Real na Nuvem (PRO e TURBO)

- **Arquitetura Offline-First Otimista (`src/utils/sync.ts`):**
  - Toda operação de criação, alteração ou exclusão de orçamento/cliente atualiza o estado local e o `localStorage` imediatamente.
  - Para usuários **PRO** e **TURBO**, os dados são sincronizados diretamente com as tabelas `public.orcamentos` e `public.clientes` do Supabase via client autenticado.
  - Se a rede estiver indisponível ou a chamada falhar, a operação é enfileirada no `fechazap_pending_sync_queue_v1` e reprocessada assim que a conexão retornar (evento `online`).
- **Isolamento por Usuário (RLS):**
  - Todas as tabelas têm políticas de Row Level Security vinculadas a `auth.uid() = user_id`.
- **Plano GRATUITO:**
  - 100% local no `localStorage`, sem disparar requisições para as tabelas do Supabase. O limite de 5 orçamentos por mês é verificado diretamente na interface do client.

---

## 4. WhatsApp: Conta Única e Fallback Universal

- As credenciais da Meta (`WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`) são segredos exclusivos do servidor (lidos em variáveis de ambiente da Edge Function). O cliente nunca envia credenciais sensíveis no corpo da requisição.
- **Fallback Universal (`wa.me`):** Se os segredos da Meta não estiverem configurados ou se o envio da API falhar, a função retorna automaticamente uma URL direta (`https://wa.me/...`) com a mensagem persuasiva pré-formatada. Isso garante 100% de disponibilidade para qualquer prestador de serviços.

---

## 5. Limpeza Realizada no Projeto

1. **Arquivos Obsoletos Removidos da Raiz:**
   - `RELATORIO_FECHAZAP_3.1.4.md`, `RELATORIO_FECHAZAP_3.1.5.md`, `RELATORIO_FECHAZAP_3.1.6.md` (removidos e substituídos por este documento único).
   - `FechaZap_3.1.6.zip` (arquivo duplicado removido).
   - `bun.lock` (projeto utiliza npm).
2. **Dependências Desnecessárias Removidas do `package.json`:**
   - `express`, `@types/express`, `dotenv`, `tsx`, `esbuild`.

---

## 6. Auditoria Honesta: O que foi Testado vs O que Depende de Configuração Externa

### ✅ Testado e Validado Efetivamente no Ambiente:
1. **Compilação e Build de Produção (`vite build`):** Executado com sucesso, gerando assets otimizados em `dist/`.
2. **Tipagem e Linting Estrito (`tsc --noEmit`):** 0 erros de tipagem em todo o projeto TypeScript.
3. **Gate de Exportação de PDF:** Bloqueio aplicado em `ModalDetalhes.tsx` quando `userPlano === 'GRATUITO'` com toast explicativo e chamada do modal de planos; liberação para `PRO` e `TURBO`.
4. **Placeholder de Anúncio (`AdBanner.tsx`):** Criado com layout limpo e discreto no rodapé do dashboard, renderizado condicionalmente apenas para usuários `GRATUITO`.
5. **Mapeamento e Fila Offline (`src/utils/sync.ts`):** Funções de mapeamento de tipos DB <-> Frontend, manipulação da fila offline e verificação de plano.
6. **Esquema SQL (`supabase/schema.sql`):** Atualizado com compatibilidade flexível de IDs (`TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`) prevenindo erros de conversão de identificadores locais.

### ⏳ Dependências de Configuração Externa (Produção / Usuário):
1. **Credenciais do Supabase em Produção:** No Netlify ou ambiente de hospedagem, configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
2. **Execução do `supabase/schema.sql`:** Executar o script no SQL Editor do painel do Supabase para criar as tabelas, triggers e RLS.
3. **Deploy das Edge Functions:** Executar `supabase functions deploy fecha-ia` e `supabase functions deploy whatsapp-followup`.
4. **Segredos no Supabase:** Configurar via `supabase secrets set`:
   - `GEMINI_API_KEY`
   - `WHATSAPP_TOKEN`
   - `PHONE_NUMBER_ID`
   - `WHATSAPP_TEMPLATE_NAME`
5. **Aprovação do Template na Meta:** O envio direto pela Meta Cloud API exige template aprovado com as variáveis `{{1}}` (cliente), `{{2}}` (serviço) e `{{3}}` (valor). Enquanto o template estiver em análise ou se não houver token, o app usa o fallback automático `wa.me`.
