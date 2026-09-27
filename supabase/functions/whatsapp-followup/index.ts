// Supabase Edge Function: whatsapp-followup
// Assistente Automatizado de Follow-up via WhatsApp (Exclusivo para Plano TURBO)
// Arquitetura:
//   - Credenciais Meta WhatsApp Cloud API são segredos ÚNICOS do servidor (WHATSAPP_TOKEN, PHONE_NUMBER_ID)
//   - NUNCA aceita token/phone_id do body da requisição
//   - Validação de que o orcamentoId pertence ao usuário autenticado (Tenant Isolation)
//   - Validação de plano TURBO na tabela public.profiles
//   - Fallback Universal para link direto (wa.me) quando a Meta API não estiver configurada ou falhar

import { corsHeaders } from '../_shared/cors.ts';
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
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

  // Segredos ÚNICOS do servidor (não por usuário)
  const metaToken = Deno.env.get('WHATSAPP_TOKEN') || '';
  const metaPhoneId = Deno.env.get('PHONE_NUMBER_ID') || '';
  const metaTemplateName = Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'fechazap_followup';

  try {
    // 1. Validação Estrita do JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado. JWT ausente ou inválido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.startsWith('local-')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida. Faça login com sua conta.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expirado ou não autorizado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authData.user;
    const body = await req.json().catch(() => ({}));
    const orcamentoId = body?.orcamentoId;

    if (!orcamentoId || typeof orcamentoId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'O parâmetro "orcamentoId" é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validação de Segurança (CRÍTICO): Plano TURBO exigido no servidor
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, nome, plano')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perfil de usuário não encontrado.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Consumo Atômico de Cota de IA
    const { data: quota, error: quotaErr } = await supabaseAdmin.rpc('consume_ai_quota', {
      p_user_id: user.id,
      p_tipo_operacao: 'whatsapp_followup_turbo',
      p_modelo: 'gemini-3.8-flash',
    });

    if (quotaErr || !quota) {
      console.error('[consume_ai_quota RPC Error]:', quotaErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Serviço de quota temporariamente indisponível.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Busca de Dados: SELECT na tabela orçamentos com filtro user_id (Tenant Isolation)
    const { data: orcamento, error: orcErr } = await supabaseAdmin
      .from('orcamentos')
      .select('*')
      .eq('id', orcamentoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (orcErr || !orcamento) {
      return new Response(
        JSON.stringify({ success: false, error: 'Orçamento não encontrado ou não pertence à sua conta.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const telefoneDestino = orcamento.cliente_telefone || body.to;
    if (!telefoneDestino) {
      return new Response(
        JSON.stringify({ success: false, error: 'O cliente não possui telefone de contato cadastrado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Consulta personalizações da empresa do usuário (Nome fantasia para a mensagem)
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

    // 6. Geração da Mensagem Persuasiva (Gemini com fallback determinístico)
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
        console.warn('Gemini follow-up generation failed, using standard template text:', err);
      }
    }

    // 7. Fallback Universal URL (wa.me) sempre gerado
    const phoneClean = cleanPhoneNumber(telefoneDestino);
    const fallbackUrl = buildDirectWhatsAppUrl(phoneClean, messageText);

    // 8. Disparo via Meta WhatsApp Cloud API (Conta Única do Servidor)
    // Se o segredo não estiver configurado, cai automaticamente para o link direto
    if (!metaToken || !metaPhoneId) {
      return new Response(
        JSON.stringify({
          success: true,
          provider: 'wa_me_fallback',
          messageId: undefined,
          text: messageText,
          fallbackUrl,
          notice: 'Meta Cloud API não configurada no servidor. Mensagem pronta gerada para envio via WhatsApp Web/App.',
          quotaRemaining: quota.remaining,
          orcamento: {
            id: orcamento.id,
            numero: orcamento.numero,
            clienteNome,
            clienteTelefone: telefoneDestino,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tenta disparo via Meta Cloud API com Template pré-aprovado ou Mensagem de Texto
    try {
      const metaUrl = `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`;
      
      // Tenta primeiro via template pré-aprovado da Meta
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

      let metaRes = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${metaToken}`,
        },
        body: JSON.stringify(templatePayload),
      });

      // Se falhar o template (ex.: template não aprovado ou janela 24h), tenta envio como texto direto
      if (!metaRes.ok) {
        const textPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneClean,
          type: 'text',
          text: {
            preview_url: false,
            body: messageText,
          },
        };

        metaRes = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${metaToken}`,
          },
          body: JSON.stringify(textPayload),
        });
      }

      const metaData = await metaRes.json().catch(() => ({}));

      if (metaRes.ok && metaData?.messages?.[0]?.id) {
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
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.warn('[Meta Cloud API Warning]:', metaData);
        // Fallback gracioso: Não quebra a experiência do usuário
        return new Response(
          JSON.stringify({
            success: true,
            provider: 'wa_me_fallback',
            text: messageText,
            fallbackUrl,
            metaError: metaData?.error?.message || 'Meta API não concluiu o envio direto.',
            notice: 'Disparo direto indisponível no momento. Use o link do WhatsApp com a mensagem pronta.',
            quotaRemaining: quota.remaining,
            orcamento: {
              id: orcamento.id,
              numero: orcamento.numero,
              clienteNome,
              clienteTelefone: telefoneDestino,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (metaErr: any) {
      console.warn('[Meta API Exception]:', metaErr?.message);
      return new Response(
        JSON.stringify({
          success: true,
          provider: 'wa_me_fallback',
          text: messageText,
          fallbackUrl,
          notice: 'Erro de conexão com Meta API. Redirecionando para o WhatsApp Web.',
          quotaRemaining: quota.remaining,
          orcamento: {
            id: orcamento.id,
            numero: orcamento.numero,
            clienteNome,
            clienteTelefone: telefoneDestino,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    console.error('[whatsapp-followup Exception]:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Erro interno no processamento de follow-up.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
