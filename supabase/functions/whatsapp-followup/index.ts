// Supabase Edge Function: whatsapp-followup
// Assistente Automatizado de Follow-up via WhatsApp (Exclusivo para Plano TURBO)
// Arquitetura:
//   - Validação estrita de Tenant Isolation (orcamentoId pertence ao user.id autenticado)
//   - Verificação obrigatória de Opt-in/Opt-out do cliente antes do envio
//   - Consumo de quota atômica de IA apenas após validação de parâmetros e elegibilidade
//   - Envio exclusivo via Template pré-aprovado da Meta (SEM fallback automático para texto livre)
//   - Suporte exclusivo à conexão WhatsApp multi-tenant ativa do usuário

import { getCorsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function cleanPhoneNumber(phone: string): string {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = `55${cleaned}`;
  }
  return cleaned;
}

function buildDirectWhatsAppUrl(phone: string, text: string): string {
  const cleaned = cleanPhoneNumber(phone);
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

Deno.serve(async (req) => {
  const currentCorsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: currentCorsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

  // Credenciais centrais do servidor para envio via Meta Cloud API
  const metaToken = Deno.env.get('WHATSAPP_TOKEN') || Deno.env.get('META_WHATSAPP_TOKEN') || '';
  const centralServerPhoneId = Deno.env.get('PHONE_NUMBER_ID') || Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const metaTemplateName = Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'fechazap_followup';

  try {
    // 1. Validação Estrita do JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado. JWT ausente ou inválido.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.startsWith('local-')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida. Faça login com sua conta.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expirado ou não autorizado.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authData.user;
    const body = await req.json().catch(() => ({}));
    const orcamentoId = body?.orcamentoId;

    if (!orcamentoId || typeof orcamentoId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'O parâmetro "orcamentoId" é obrigatório.' }),
        { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validação de Plano TURBO no servidor
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, nome, plano')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perfil de usuário não encontrado.' }),
        { status: 404, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPlano = (profile.plano || 'GRATUITO').toUpperCase();
    if (userPlano !== 'TURBO') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'O assistente de follow-up via WhatsApp com IA é exclusivo para o plano TURBO.',
          code: 'PLAN_TURBO_REQUIRED',
          planoAtual: userPlano,
          planoNecessario: 'TURBO',
        }),
        { status: 403, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validação de Propriedade do Orçamento (Tenant Isolation)
    const { data: orcamento, error: orcErr } = await supabaseAdmin
      .from('orcamentos')
      .select('*')
      .eq('id', orcamentoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (orcErr || !orcamento) {
      return new Response(
        JSON.stringify({ success: false, error: 'Orçamento não encontrado ou não pertence à sua conta.' }),
        { status: 404, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const telefoneDestino = orcamento.cliente_telefone || body.to;
    if (!telefoneDestino) {
      return new Response(
        JSON.stringify({ success: false, error: 'O cliente não possui telefone de contato cadastrado.' }),
        { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const phoneClean = cleanPhoneNumber(telefoneDestino);
    const digitsOnly = phoneClean.replace(/\D/g, '');
    const lastDigits = digitsOnly.length >= 8 ? digitsOnly.slice(-8) : digitsOnly;

    // 4. Verificação de Opt-in / Opt-out do Cliente (LGPD e Políticas Meta)
    let clienteData: any = null;
    if (orcamento.cliente_id) {
      const { data: cliById } = await supabaseAdmin
        .from('clientes')
        .select('id, nome, whatsapp_opt_in, whatsapp_opt_out_at')
        .eq('id', orcamento.cliente_id)
        .eq('user_id', user.id)
        .maybeSingle();
      clienteData = cliById;
    }

    if (!clienteData) {
      const { data: cliByPhone } = await supabaseAdmin
        .from('clientes')
        .select('id, nome, whatsapp_opt_in, whatsapp_opt_out_at')
        .eq('user_id', user.id)
        .ilike('telefone', `%${lastDigits}%`)
        .limit(1)
        .maybeSingle();
      clienteData = cliByPhone;
    }

    // Se o cliente solicitou descadastro prévio, bloqueia envio automático
    if (clienteData && (clienteData.whatsapp_opt_in === false || clienteData.whatsapp_opt_out_at)) {
      const directUrl = buildDirectWhatsAppUrl(phoneClean, `Olá, ${orcamento.cliente_nome || 'Cliente'}.`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'O cliente solicitou descadastro (opt-out) e não recebe mensagens automatizadas. Você pode abrir o WhatsApp para contato manual.',
          code: 'CLIENT_OPTED_OUT',
          fallbackUrl: directUrl,
        }),
        { status: 403, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // 5. Verificação da Conexão WhatsApp (Modelo Híbrido: Individual > Central)
    //
    // MODO A (WhatsApp Individual do Usuário):
    //   - Se o usuário possui conexão ativa em whatsapp_connections, utiliza a conexão individual.
    //   - O phone_number_id e credencial associada pertencem exclusivamente ao usuário.
    //   - Validação estrita: se phoneNumberId foi enviado pelo frontend, deve
    //     pertencer à conexão ativa deste usuário. Jamais usar conexão de outro.
    //
    // MODO B (WhatsApp Central Compartilhado do FechaZap):
    //   - Se o usuário NÃO possui conexão individual ativa:
    //   - Recai controladamente para o WhatsApp central autorizado do FechaZap.
    //   - Utiliza exclusivamente WHATSAPP_TOKEN e PHONE_NUMBER_ID do backend.
    //   - Se phoneNumberId foi enviado pelo frontend, deve corresponder ao central.
    //   - NUNCA expõe essas credenciais ao frontend nem no localStorage.
    // =========================================================================
    const requestedPhoneId = body?.phoneNumberId || body?.phone_number_id;
    const centralPhoneId = centralServerPhoneId || '';

    const isCentralId = (id?: string | null) =>
      Boolean(
        id &&
        ((centralPhoneId && id === centralPhoneId) ||
          id === '106934522435791' ||
          id.includes('central_fechazap'))
      );

    // PASSO 1: Verificar se existe whatsapp_connections ativa para o usuário autenticado
    const { data: userConn, error: connErr } = await supabaseAdmin
      .from('whatsapp_connections')
      .select('phone_number_id, status, user_id, access_token_encrypted')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    let effectivePhoneId = '';
    let effectiveToken = '';
    let connectionMode: 'individual' | 'central' = 'central';

    // Se o usuário possui conexão individual ativa (que NÃO seja o canal central)
    if (userConn?.phone_number_id && !isCentralId(userConn.phone_number_id)) {
      // MODO A: Conexão individual do usuário tem prioridade absoluta
      if (requestedPhoneId && requestedPhoneId !== userConn.phone_number_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'O phone_number_id solicitado não pertence à conexão ativa do usuário autenticado.',
            code: 'WHATSAPP_FORBIDDEN_PHONE_ID',
          }),
          { status: 403, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      effectivePhoneId = userConn.phone_number_id;
      // Credencial individual (se houver credencial específica criptografada, senão token seguro do servidor)
      effectiveToken = userConn.access_token_encrypted || metaToken;
      connectionMode = 'individual';
    } else {
      // PASSO 2: Fallback controlado para WhatsApp Central Compartilhado Autorizado
      const centralToken = metaToken;

      if (!centralPhoneId || !centralToken) {
        const directUrl = buildDirectWhatsAppUrl(phoneClean, `Olá, ${orcamento.cliente_nome || 'Cliente'}.`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Conexão do WhatsApp comercial não configurada no servidor e nenhuma conexão individual ativa.',
            code: 'WHATSAPP_CONNECTION_REQUIRED',
            fallbackUrl: directUrl,
          }),
          { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (requestedPhoneId && requestedPhoneId !== centralPhoneId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'O phone_number_id solicitado não é autorizado para este usuário.',
            code: 'WHATSAPP_FORBIDDEN_PHONE_ID',
          }),
          { status: 403, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      effectivePhoneId = centralPhoneId;
      effectiveToken = centralToken;
      connectionMode = 'central';
    }

    // 6. CONSUMO ATÔMICO DE QUOTA DE IA
    // Executado exclusivamente após validação completa de autorização, orçamento, opt-in e conexão WhatsApp ativa
    const { data: quota, error: quotaErr } = await supabaseAdmin.rpc('consume_ai_quota', {
      p_user_id: user.id,
      p_tipo_operacao: 'whatsapp_followup_turbo',
      p_modelo: 'gemini-3.8-flash',
    });

    if (quotaErr || !quota) {
      console.error('[consume_ai_quota RPC Error]:', quotaErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Serviço de quota temporariamente indisponível.' }),
        { status: 503, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: quota.error || `Limite mensal de IA atingido (${quota.used}/${quota.limit}).`,
          quotaExceeded: true,
          quota,
        }),
        { status: 429, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Dados para Formatação da Mensagem
    const { data: userConfig } = await supabaseAdmin
      .from('configuracoes')
      .select('nome_fantasia')
      .eq('user_id', user.id)
      .maybeSingle();

    const empresaNome = userConfig?.nome_fantasia || profile.nome || 'Nossa Empresa';
    const clienteNome = orcamento.cliente_nome || 'Cliente';
    const valorTotalFormatado = Number(orcamento.valor_total || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    let primeiroServico = 'Serviço sob medida';
    if (Array.isArray(orcamento.itens) && orcamento.itens.length > 0 && orcamento.itens[0]?.descricao) {
      primeiroServico = orcamento.itens[0].descricao;
    }

    // 8. Geração da Mensagem Persuasiva (Gemini)
    let messageText = `Olá, *${clienteNome}*! Tudo bem? Aqui é da *${empresaNome}*. 🤝

Passando rapidamente para saber se você conseguiu avaliar a proposta referente a *${primeiroServico}* no valor de *${valorTotalFormatado}*.

Ficou com alguma dúvida sobre o serviço ou forma de pagamento para darmos início? Me avise por aqui! 😊`;

    if (geminiApiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
        const aiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Gere uma mensagem persuasiva, acolhedora e curta (2 parágrafos) de follow-up no WhatsApp referente à proposta #${orcamento.numero}:
Cliente: ${clienteNome}
Empresa: ${empresaNome}
Serviço: ${primeiroServico}
Valor: ${valorTotalFormatado}
Objetivo: Perguntar se restou alguma dúvida para fechar o serviço. Use negritos para destacar.`,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.65 },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const generated = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (generated && generated.trim().length > 0) {
            messageText = generated.trim();
          }
        }
      } catch (err) {
        console.warn('Falha na chamada Gemini para follow-up, utilizando texto padrão:', err);
      }
    }

    const fallbackUrl = buildDirectWhatsAppUrl(phoneClean, messageText);

    // 9. Disparo via Meta WhatsApp Cloud API
    if (!effectiveToken || !effectivePhoneId) {
      return new Response(
        JSON.stringify({
          success: true,
          provider: 'wa_me_fallback',
          messageId: undefined,
          text: messageText,
          fallbackUrl,
          notice: 'Meta Cloud API não configurada. Utilize o envio manual via link direto.',
          quotaRemaining: quota.remaining,
          orcamento: {
            id: orcamento.id,
            numero: orcamento.numero,
            clienteNome,
            clienteTelefone: telefoneDestino,
          },
        }),
        { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Envio estrito via Template pré-aprovado
    // REGRA DE SEGURANÇA: SEM fallback automático para texto livre
    try {
      const metaUrl = `https://graph.facebook.com/v19.0/${effectivePhoneId}/messages`;
      const templatePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneClean,
        type: 'template',
        template: {
          name: metaTemplateName,
          language: { code: 'pt_BR' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: clienteNome },
                { type: 'text', text: primeiroServico },
                { type: 'text', text: valorTotalFormatado },
              ],
            },
          ],
        },
      };

      const metaRes = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: JSON.stringify(templatePayload),
      });

      const metaData = await metaRes.json().catch(() => ({}));

      if (metaRes.ok && metaData?.messages?.[0]?.id) {
        // Registra mensagem enviada na tabela
        await supabaseAdmin.from('mensagens_whatsapp').insert({
          user_id: user.id,
          phone_number_id: effectivePhoneId,
          cliente_telefone: phoneClean,
          cliente_nome: clienteNome,
          corpo: messageText,
          direcao: 'outbound',
          status: 'sent',
          lida: true,
          wa_message_id: metaData.messages[0].id,
          orcamento_id: orcamento.id,
        });

        return new Response(
          JSON.stringify({
            success: true,
            provider: 'meta-cloud-api',
            messageId: metaData.messages[0].id,
            text: messageText,
            fallbackUrl,
            quotaRemaining: quota.remaining,
            orcamento: {
              id: orcamento.id,
              numero: orcamento.numero,
              clienteNome,
              clienteTelefone: telefoneDestino,
            },
          }),
          { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Log técnico sem vazar credenciais
        const errorCode = metaData?.error?.code || 'META_API_ERROR';
        const errorMessage = metaData?.error?.message || 'Falha no envio do template pré-aprovado pela Meta.';
        console.warn(`[whatsapp-followup] Falha no template Meta (Code: ${errorCode}): ${errorMessage}`);

        // Trata token inválido / revogado da Meta (Código 190 ou subcódigos de expiração)
        const isTokenRevoked =
          errorCode === 190 ||
          errorCode === '190' ||
          metaData?.error?.error_subcode === 463 ||
          metaData?.error?.error_subcode === 467;

        if (isTokenRevoked && connectionMode === 'individual') {
          console.warn(`[whatsapp-followup] Token Meta expirado ou revogado para o usuário ${user.id}`);
          await supabaseAdmin
            .from('whatsapp_connections')
            .update({ status: 'revoked', updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('phone_number_id', effectivePhoneId);
        }

        const userFriendlyError = isTokenRevoked
          ? 'Sua conexão com o WhatsApp oficial da Meta expirou ou foi revogada. Por favor, acesse as Configurações para reconectar seu número.'
          : 'Não foi possível enviar o acompanhamento pelo WhatsApp comercial oficial da Meta. Você pode abrir o WhatsApp e enviar manualmente.';

        // Retorna erro compreensível com a opção manual transparente via wa.me (Regra 6)
        return new Response(
          JSON.stringify({
            success: false,
            provider: 'meta-cloud-api',
            error: userFriendlyError,
            code: isTokenRevoked ? 'META_TOKEN_REVOKED' : errorCode,
            fallbackUrl,
            quotaRemaining: quota.remaining,
          }),
          { status: 422, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (metaErr: any) {
      console.warn('[whatsapp-followup Exception na Meta API]:', metaErr?.message);
      return new Response(
        JSON.stringify({
          success: false,
          provider: 'meta-cloud-api',
          error: 'Erro de comunicação com a Meta Graph API. Utilize o envio manual pelo WhatsApp.',
          fallbackUrl,
          quotaRemaining: quota.remaining,
        }),
        { status: 502, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    console.error('[whatsapp-followup Exception]:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Erro interno no processamento de follow-up.',
      }),
      { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
