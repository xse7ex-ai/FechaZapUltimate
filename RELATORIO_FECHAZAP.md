# Relatório Técnico Oficial - FechaZap

**Versão da Arquitetura:** 3.3.0  
**Stack Principal:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL com RLS + Auth + Edge Functions), Google Gemini (gemini-3.8-flash), Meta WhatsApp Cloud API (WABA), Stripe Subscriptions.

---

## 1. Visão Geral da Arquitetura

O **FechaZap** opera sob arquitetura serverless moderna com separação rigorosa de privilégios e isolamento multi-tenant:

```
[ Cliente PWA / Web ] 
   ├── Estado Local Otimista (localStorage isolado por user_id) para operação offline
   ├── Sincronização Direta com Supabase Client com RLS estrito (auth.uid() = user_id)
   ├── Caixa de Entrada WhatsApp (Exclusiva TURBO) alimentada via Edge Function
   └── Invocação Segura de Supabase Edge Functions:
         ├── 'fecha-ia' (Google Gemini - Exclusivo TURBO, com test_connection auditado)
         ├── 'whatsapp-followup' (Envio de templates Meta Cloud API com fallback wa.me)
         ├── 'whatsapp-webhook' (Receptor oficial Inbound da Meta Cloud API)
         └── 'stripe-webhook' (Gestor do ciclo de vida de assinaturas com HMAC)
```

---

## 2. Modelo de Negócio e Planos de Assinatura

| Recurso | GRATUITO | PRO | TURBO |
| :--- | :---: | :---: | :---: |
| **Limite de Orçamentos** | 5 / mês (enforced via PostgreSQL trigger) | Ilimitados | Ilimitados |
| **Armazenamento de Dados** | Nuvem Supabase + Cache Local | Nuvem Supabase + Cache Local | Nuvem Supabase + Cache Local |
| **Sincronização Multi-dispositivo** | Sim (RLS ativo) | Sim (RLS ativo) | Sim (RLS ativo) |
| **Exportação de PDF / Impressão** | Liberado (sanitizado contra XSS) | Liberado (sanitizado contra XSS) | Liberado (sanitizado contra XSS) |
| **Créditos de IA no Backend** | 0 créditos (bloqueio no banco e API) | 0 créditos (bloqueio no banco e API) | 1.500 créditos / mês |
| **Criação de Propostas por IA** | Não | Não | Sim (Gemini) |
| **Follow-up Automático WhatsApp** | Envio manual via wa.me | Envio manual via wa.me | Disparo de Template Meta + wa.me |
| **Caixa de Entrada Inbound WhatsApp** | Não | Não | Sim (Centralizada no App) |

---

## 3. Arquitetura WhatsApp Híbrida Controlada (Inbound e Outbound)

O sistema opera sob o modelo híbrido controlado, garantindo o funcionamento imediato com o número central do FechaZap e total preparação para canais individuais por usuário:

### MODO A: WhatsApp Individual do Usuário (Prioridade Total)
- Se o usuário autenticado possui registro com status `active` em `public.whatsapp_connections`, o sistema utiliza exclusivamente seu `phone_number_id` e credencial associada.
- No outbound, qualquer tentativa de especificar um `phone_number_id` diferente de sua conexão ativa é bloqueada com HTTP 403 (`WHATSAPP_FORBIDDEN_PHONE_ID`).
- No inbound, mensagens recebidas com seu `phone_number_id` são roteadas direta e exclusivamente para sua conta.

### MODO B: WhatsApp Central Compartilhado Autorizado
- Se o usuário NÃO possui conexão individual ativa, o sistema recorre de forma controlada ao WhatsApp central autorizado do FechaZap.
- Configurado exclusivamente no backend via variáveis de ambiente seguras (`PHONE_NUMBER_ID` e `WHATSAPP_TOKEN`).
- Nenhum token, segredo ou credencial administrativa é exposto ao frontend ou persistido em `localStorage`.
- No outbound, é terminantemente proibido ao frontend selecionar arbitrariamente outros canais.

### Roteamento Inbound (`whatsapp-webhook`):
1. **Validação Criptográfica:** Validação de assinatura HMAC-SHA256 no cabeçalho `X-Hub-Signature-256` utilizando `WHATSAPP_APP_SECRET`. Falha fechado imediatamente caso o segredo esteja ausente ou a assinatura seja inválida.
2. **Handshake da Meta:** Verificação via `GET` respondendo `hub.challenge` caso `hub.verify_token === WHATSAPP_VERIFY_TOKEN`.
3. **Idempotência:** Deduplicação estrita através do campo `wa_message_id` na tabela `public.mensagens_whatsapp`. Eventos duplicados são descartados sem gerar efeitos colaterais.
4. **Roteamento Híbrido e Resolução Segura de Ambiguidade (`resolveCentralWhatsappOwner`):**
   - *Passo 1 (Conexão Individual):* O sistema verifica primeiro se o `phone_number_id` pertence a uma conexão ativa em `whatsapp_connections`. Em caso positivo, associa ao prestador proprietário com isolamento estrito.
   - *Passo 2 (Número Compartilhado - `resolveCentralWhatsappOwner`):*
     - **Definição Estrita de Candidato:** Um usuário só é candidato se possuir cliente ou orçamento com o telefone **totalmente normalizado** (DDI+DDD+número completo) idêntico ao da mensagem recebida (nunca apenas últimos dígitos).
     - **Critério de Inatividade (12 meses):** A recência e última interação são utilizadas **estritamente** para descartar candidatos inativos há mais de 12 meses. Se restarem 2 ou mais candidatos ativos, o resultado é **obrigatoriamente AMBIGUOUS**, independentemente de qual tenha o registro mais recente.
     - **Falha Fechada por Segurança:** Em caso de status `AMBIGUOUS` ou `NOT_FOUND`, a mensagem é descartada por segurança sem ser atribuída a nenhum usuário. Não existe escolha heurística ou aleatória de usuário TURBO.
     - **Log Estruturado Obrigatório:** Emissão de log JSON padronizado com `event: 'whatsapp_central_routing'`, `routing_status`, `phone_number_id`, `timestamp` e contadores sem exposição de dados pessoais sensíveis.
5. **Opt-in / Opt-out Automático:** Mensagens com palavras-chave de descadastro (`STOP`, `PARAR`, `CANCELAR`, `SAIR`) atualizam automaticamente `whatsapp_opt_in = false` e o timestamp `whatsapp_opt_out_at` do cliente no banco de dados.

### Estratégia de Credenciais Outbound (`whatsapp-followup`):
1. **Modelo Híbrido Seguro:** Prioriza conexão individual do usuário; recai para o WhatsApp central do servidor se não houver conexão individual.
2. **Proteção Total de Credenciais:** Nenhum token de acesso da Meta ou credencial é exposto ao frontend.
3. **Validação Estrita de Canal:** Rejeita com HTTP 403 qualquer requisição com `phone_number_id` alheio.
4. **Templates Pré-Aprovados:** Disparos automáticos utilizam templates pré-aprovados pela Meta, com fallback transparente via `wa.me` universal.

---

## 4. Segurança do Banco de Dados e Permissões (PostgreSQL)

- **Row Level Security (RLS):** Ativado em todas as tabelas (`orcamentos`, `clientes`, `profiles`, `mensagens_whatsapp`, `subscriptions`, `stripe_events`, `empresa_config`). Todas as leituras e mutações do usuário são restritas a `auth.uid() = user_id`.
- **Anti-Adulteração de Planos (Anti-Tampering):**
   - A permissão `UPDATE (plano)` está revogada para `anon` e `authenticated` na tabela `public.profiles`.
   - Trigger `protect_profile_plan_update()` reverte qualquer tentativa indevida do frontend de alterar a coluna `plano`.
   - Atualizações de plano são de competência exclusiva do `service_role` via webhook do Stripe.
- **Funções `SECURITY DEFINER` e Princípio do Menor Privilégio:**
   - Funções internas como `calculate_effective_user_plan(UUID)`, `sync_profile_from_subscription()`, `consume_ai_quota()` e `check_ai_quota()` têm permissão `EXECUTE` revogada de `PUBLIC`, `anon` e `authenticated`, sendo restritas estritamente a `service_role`.
   - Triggers operam com `search_path = public, pg_temp` explícito para evitar injeção por caminho de busca.

---

## 5. Integração com Stripe e Resolução de Planos

- **Validação de Webhook:** Assinatura HMAC-SHA256 validada com tolerância temporal de 5 minutos contra replay attacks.
- **Resolução Estrita de Plano (`resolvePlanFromStripeObject`):**
   - O sistema inspeciona explicitamente metadados, identificadores de produto e apelidos de preço para 'TURBO' ou 'PRO'.
   - **Eliminação do Fallback Silencioso para PRO:** Se o produto ou plano não for identificado, a função retorna `null`, o evento é registrado com status de auditoria e nenhum plano pago é concedido indevidamente.
- **Ciclo de Vida:** Suporte a ativação (`checkout.session.completed`), tolerância de pagamento (`past_due` com 5 dias de grace period) e cancelamento definitivo (`customer.subscription.deleted`) com reversão automática para `GRATUITO`.

---

## 6. Inteligência Artificial (Google Gemini)

- **Backend:** Edge Function `fecha-ia` encapsula todas as requisições ao modelo `gemini-3.8-flash`.
- **Proteção de Chave:** `GEMINI_API_KEY` mantida exclusivamente no cofre do servidor.
- **Contrato de `test_connection`:**
   - Autenticação com JWT obrigatória (usuários anônimos são rejeitados com 401).
   - Não consome créditos de quota do usuário.
   - Permite verificar a operacionalidade do serviço sem exigir plano TURBO.
   - Operações comerciais reais (`gerar_orcamento`, `analisar_precos`, etc.) exigem plano TURBO e debitam cota atomicamente via `consume_ai_quota`.

---

## 7. Progressive Web App (PWA) e Operação Offline

- **Manifest:** `public/manifest.json` com `display: standalone`, tema visual e ícones de 192px e 512px com suporte a maskable.
- **Service Worker:** `public/sw.js` com cache versionado (`fechazap-cache-v3.3.0`) aplicando Stale-While-Revalidate para ativos estáticos da interface e Network-First para endpoints dinâmicos.
- **Isolamento de Dados Locais:** O armazenamento local e as filas de sincronização são indexados pelo ID do usuário (`fechazap_${userId}_...`), impedindo mistura de dados entre sessões no mesmo navegador.
