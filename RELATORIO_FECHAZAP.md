# Relatório Técnico Oficial - FechaZap PWA

**Versão da Arquitetura:** 3.3.0 (Supabase Edge Functions + Inbound WhatsApp Webhook + Caixa de Entrada TURBO + Sincronização em Nuvem PRO/TURBO)  
**Stack Principal:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL + RLS + Auth + Edge Functions), Google Gemini 3.8 Flash, Meta Cloud API.

---

## 1. Visão Geral da Arquitetura

O **FechaZap** opera sob uma arquitetura serverless moderna e sem dependência de Cloudflare Workers ou servidores intermediários Express:

```
[ Cliente PWA / Netlify ] 
   ├── Estado Local Otimista (localStorage) para velocidade instantânea e offline
   ├── Sincronização Direta Supabase Client (PRO e TURBO) com RLS por user_id
   ├── Caixa de Entrada WhatsApp (Exclusiva TURBO) com indicador de não lidas e wa.me
   └── Invocação de Supabase Edge Functions:
         ├── 'fecha-ia' (Gemini 3.8 Flash - Exclusivo TURBO)
         ├── 'whatsapp-followup' (Disparo Meta Cloud API / Link wa.me - Exclusivo TURBO)
         └── 'whatsapp-webhook' (Receptor oficial Inbound da Meta Cloud API)
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
| **Caixa de Entrada de Respostas WhatsApp** | Não (conversas no zap pessoal) | Não (conversas no zap pessoal) | **Sim (Centralizada no App)** |

---

## 3. Inbound Webhook do WhatsApp (`whatsapp-webhook`)

Para fechar o ciclo de vendas dos usuários do plano **TURBO**, foi criada a Edge Function `whatsapp-webhook`:

1. **GET (Handshake & Verificação da Meta):**
   - Responde com o valor de `hub.challenge` em texto puro se `hub.verify_token === WHATSAPP_VERIFY_TOKEN`.
   - Rejeita com HTTP 403 caso o token seja inválido ou o segredo não esteja configurado.
2. **POST (Mensagens Recebidas):**
   - **Validação Criptográfica:** Valida o cabeçalho `X-Hub-Signature-256` via HMAC-SHA256 usando o segredo `WHATSAPP_APP_SECRET`.
   - **Resiliência e SLA:** Responde HTTP 200 rapidamente à Meta para evitar reenvios desnecessários ou desativação do webhook.
   - **Idempotência Rigorosa:** Utiliza `wa_message_id` (ID oficial da mensagem gerado pela Meta) para ignorar mensagens já processadas.
   - **Descoberta do Dono (Multi-Tenant Estrito):** Mapeia o destinatário comercial diretamente a partir de `value.metadata.phone_number_id` cruzado com conexões ativas em `public.whatsapp_connections`. Elimina qualquer risco de vazamento cross-tenant e descarta mensagens de números não vinculados a uma conta ativa.
   - **Gravação Segura:** Insere na tabela `public.mensagens_whatsapp` via credencial `service_role`.

---

## 4. Tabela `public.mensagens_whatsapp` e Segurança (RLS)

- **Campos:**
  - `id`: identificador único do registro (TEXT / UUID).
  - `user_id`: UUID do prestador dono da mensagem (NOT NULL, FK `auth.users`).
  - `cliente_telefone`: telefone formatado/limpo do remetente.
  - `cliente_nome`: nome informado pelo contato da Meta ou pelo cadastro de clientes.
  - `corpo`: texto da mensagem enviada pelo cliente.
  - `lida`: booleano indicando status de leitura (default `false`).
  - `wa_message_id`: identificador único da Meta (UNIQUE).
  - `orcamento_id`: vínculo opcional com a proposta mais recente (FK `orcamentos`, `ON DELETE SET NULL`).
  - `created_at`: data/hora de recebimento.
- **Políticas de Row Level Security (RLS):**
  - **SELECT:** Usuário autenticado visualiza somente suas próprias mensagens (`auth.uid() = user_id`).
  - **UPDATE:** Usuário autenticado pode atualizar apenas o campo `lida` das suas próprias mensagens.
  - **INSERT:** Estritamente proibido para clientes autenticados e anônimos. Apenas a Edge Function autenticada com `service_role` possui permissão de escrita.
- **Índices de Performance:**
  - `(user_id, lida)` para contagem ultra rápida de não lidas.
  - `cliente_telefone` para buscas rápidas.
  - `created_at DESC` para ordenação temporal.

---

## 5. Caixa de Entrada no Frontend (Exclusiva TURBO)

- **Componente `src/components/MensagensView.tsx`:**
  - Exibido nos menus (Sidebar e BottomNav) com indicador visual de mensagens não lidas.
  - Se um usuário `GRATUITO` ou `PRO` acessar, uma tela explicativa apresenta o diferencial do plano TURBO e oferece botão de upgrade.
  - Listagem com filtro por busca textual e aba de "Apenas Não Lidas".
  - Identificação visual imediata de mensagens não lidas com dot luminoso e destaque.
  - Vínculo direto com o orçamento relacionado (botão de atalho para abrir os detalhes da proposta).
  - Botão **"Responder no WhatsApp"**: ao clicar, marca a mensagem como lida e abre o link `https://wa.me/<telefone>` para que o prestador responda manualmente pelo WhatsApp. Não há disparo automático por IA de respostas recebidas (preservando o controle humano do prestador).

---

## 6. Auditoria Honesta: O que foi Testado vs O que Depende de Configuração Externa

### ✅ Testado e Validado Efetivamente no Ambiente:
1. **Compilação e Build de Produção (`vite build`):** Executado com sucesso, sem qualquer erro de bundle ou empacotamento.
2. **Tipagem Estrita (`tsc --noEmit`):** 0 erros TypeScript no projeto.
3. **Lógica de Normalização Telefônica (`cleanPhoneNumber`):** Testada contra números com/sem DDI 55 e com/sem máscara de formatação (`(11) 98888-7777`, `11988887777`, `5511988887777`).
4. **Validação Criptográfica HMAC-SHA256:** Testada em script Node/Web Crypto simulando o cabeçalho `sha256=<hex>` da Meta com chave válida e inválida.
5. **Simulação de Roteamento Multi-prestador:** Validado o algoritmo que prioriza o prestador com o orçamento/cadastro mais recente e descarta números não cadastrados.
6. **Interface e Contador de Não Lidas:** Integrado à Sidebar e à BottomNav com visualização condicionada ao plano `TURBO`.

### ⚠️ Limitação Técnica Documentada:
- **Colisão de Clientes em Múltiplos Prestadores:** Como o FechaZap utiliza uma conta centralizada de WhatsApp Business da plataforma, se o mesmo número de cliente final tiver solicitado orçamentos para mais de um prestador cadastrado no sistema, a mensagem recebida no webhook será roteada para o prestador que tiver a interação mais recente (último orçamento gerado ou cliente cadastrado). Essa é uma limitação inerente ao modelo de conta única compartilhada da Meta Cloud API.

### ⏳ Dependências de Configuração Externa (Produção / Meta / Supabase):
1. **Configuração da URL de Callback no Painel da Meta:**
   - No portal Meta for Developers -> WhatsApp -> Configuration:
   - **Callback URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`
   - **Verify Token:** Definir um token seguro e cadastrá-lo como secret `WHATSAPP_VERIFY_TOKEN` no Supabase.
   - **Campos de Webhook inscritos:** Marcar o campo `messages`.
2. **Segredos no Supabase (`supabase secrets set`):**
   - `WHATSAPP_VERIFY_TOKEN`: Token de verificação escolhido para a Meta.
   - `WHATSAPP_APP_SECRET`: App Secret do aplicativo Meta para validação HMAC do header `X-Hub-Signature-256`.
   - `WHATSAPP_TOKEN` e `PHONE_NUMBER_ID`: Credenciais de envio da conta WhatsApp Business.
   - `GEMINI_API_KEY`: Chave da API Google Gemini para as funções de IA do TURBO.
3. **Deploy da Edge Function:**
   - Executar: `supabase functions deploy whatsapp-webhook`
4. **Execução do `supabase/schema.sql`:**
   - Rodar o script atualizado no SQL Editor do Supabase para criar a tabela `mensagens_whatsapp`, políticas de RLS e o helper `find_whatsapp_message_owner`.
