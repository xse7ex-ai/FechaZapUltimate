// Supabase Edge Function: whatsapp-webhook
// Receptor Inbound de Mensagens do WhatsApp Cloud API (Meta)
// Arquitetura Multi-Tenant & Hardening de Segurança

import { getCorsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Normaliza número de telefone removendo caracteres não numéricos
 * e garantindo o DDI 55 (Brasil) se aplicável.
 */
function cleanPhoneNumber(phone: string): string {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = `55${cleaned}`;
  }
  return cleaned;
}

/**
 * Validação de Assinatura HMAC-SHA256 enviada pela Meta no header X-Hub-Signature-256.
 * Executada estritamente sobre o corpo bruto (raw text) recebido.
 */
async function verifyMetaHmac(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedHex = parts[1].toLowerCase().trim();

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const computedHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return computedHex === expectedHex;
  } catch (err) {
    console.error('[verifyMetaHmac Exception]:', err);
    return false;
  }
}

// Palavras-chave normatizadas para cancelamento proativo (Opt-out) e reativação (Opt-in)
const OPT_OUT_KEYWORDS = [
  'STOP',
  'SAIR',
  'PARAR',
  'CANCELAR',
  'DESCADASTRAR',
  'DESATIVAR',
  'UNSUBSCRIBE',
  'NÃO QUERO MAIS',
  'NAO QUERO MAIS',
];

const OPT_IN_KEYWORDS = [
  'START',
  'COMECAR',
  'COMEÇAR',
  'VOLTAR',
  'SIM',
  'ATIVAR',
  'REATIVAR',
];

Deno.serve(async (req) => {
  const currentCorsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: currentCorsHeaders });
  }

  const url = new URL(req.url);

  // =========================================================================
  // 1. GET: Verificação Oficial do Webhook pela Meta
  // =========================================================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';

    if (mode === 'subscribe' && token && challenge) {
      if (verifyToken && token === verifyToken) {
        console.log('[whatsapp-webhook] Verificação da Meta aprovada com sucesso.');
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      } else {
        console.warn('[whatsapp-webhook] Token de verificação incorreto ou não configurado.');
        return new Response('Forbidden: Invalid verification token', {
          status: 403,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    return new Response('Bad Request: Missing hub parameters', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // =========================================================================
  // 2. POST: Mensagem Recebida via Webhook
  // =========================================================================
  if (req.method === 'POST') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || '';

    // SEGURANÇA CRÍTICA: Se o segredo do app não estiver configurado, falha fechado imediatamente
    if (!appSecret) {
      console.error('[whatsapp-webhook] Configuração crítica ausente: WHATSAPP_APP_SECRET não definido.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Webhook secret missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Lê o corpo bruto para cálculo de integridade HMAC
    const rawBody = await req.text();

    const signatureHeader =
      req.headers.get('x-hub-signature-256') || req.headers.get('X-Hub-Signature-256');

    const isValid = await verifyMetaHmac(rawBody, signatureHeader, appSecret);
    if (!isValid) {
      console.warn('[whatsapp-webhook] Assinatura X-Hub-Signature-256 inválida ou ausente. Requisição rejeitada.');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Invalid webhook signature' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
      const payload = JSON.parse(rawBody || '{}');

      if (payload.object !== 'whatsapp_business_account' && !payload.entry) {
        return new Response(
          JSON.stringify({ status: 'ignored', reason: 'not_whatsapp_event' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      let processedCount = 0;

      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          if (!value) continue;

          // Metadados da Meta: phone_number_id do número comercial receptor
          const phoneNumberId = value.metadata?.phone_number_id || null;
          const displayPhoneNumber = value.metadata?.display_phone_number || null;

          const messages = value.messages || [];
          if (!Array.isArray(messages) || messages.length === 0) {
            continue;
          }

          const contacts = value.contacts || [];

          for (const msg of messages) {
            const waMessageId = msg.id;
            const fromRaw = msg.from;

            if (!waMessageId || !fromRaw) continue;

            // Extração do conteúdo
            let corpoTexto = '';
            if (msg.type === 'text') {
              corpoTexto = msg.text?.body || '';
            } else if (msg.type === 'button') {
              corpoTexto = msg.button?.text || '[Botão clicado]';
            } else if (msg.type === 'interactive') {
              corpoTexto =
                msg.interactive?.button_reply?.title ||
                msg.interactive?.list_reply?.title ||
                '[Resposta interativa]';
            } else if (msg.type === 'audio') {
              corpoTexto = '[Áudio recebido]';
            } else if (msg.type === 'image') {
              corpoTexto = msg.image?.caption || '[Imagem recebida]';
            } else if (msg.type === 'document') {
              corpoTexto = msg.document?.filename
                ? `[Documento: ${msg.document.filename}]`
                : '[Documento recebido]';
            } else {
              corpoTexto = `[Mensagem: ${msg.type || 'WhatsApp'}]`;
            }

            if (!corpoTexto.trim()) {
              corpoTexto = '[Mensagem recebida]';
            }

            // Contato enviado pela Meta
            const contactName =
              contacts.find((c: any) => c.wa_id === fromRaw)?.profile?.name || null;

            // Idempotência: Se wa_message_id já foi persistido, ignora sem duplicar
            const { data: existingMsg } = await supabaseAdmin
              .from('mensagens_whatsapp')
              .select('id')
              .eq('wa_message_id', waMessageId)
              .maybeSingle();

            if (existingMsg) {
              console.log('[whatsapp-webhook] Mensagem já registrada (idempotência):', waMessageId);
              continue;
            }

            const cleanFrom = cleanPhoneNumber(fromRaw);

            // =========================================================================
            // ROTEAMENTO MULTI-TENANT SEGURO (Baseado estritamente em phone_number_id)
            // =========================================================================
            if (!phoneNumberId) {
              console.warn('[whatsapp-webhook] Mensagem descartada: metadata.phone_number_id ausente.');
              continue;
            }

            const { data: conn } = await supabaseAdmin
              .from('whatsapp_connections')
              .select('user_id, status')
              .eq('phone_number_id', phoneNumberId)
              .eq('status', 'active')
              .maybeSingle();

            const ownerUserId = conn?.user_id || null;

            // Se não existir conexão ativa correspondente em whatsapp_connections:
            // NÃO inserir mensagem, NÃO procurar dono pelo telefone, NÃO escolher usuário TURBO, NÃO usar fallback central.
            if (!ownerUserId) {
              console.warn(
                `[whatsapp-webhook] Nenhuma conexão ativa encontrada para phone_number_id="${phoneNumberId}". Mensagem descartada por segurança.`
              );
              continue;
            }

            // Busca orçamento e cliente vinculados exclusivamente para o ownerUserId autenticado
            const digitsOnly = cleanFrom.replace(/\D/g, '');
            const lastDigits = digitsOnly.length >= 8 ? digitsOnly.slice(-8) : digitsOnly;

            let ownerClienteNome: string | null = null;
            let ownerOrcamentoId: string | null = null;
            let matchedClienteId: string | null = null;

            // Busca orçamentos deste prestador específico
            const { data: orcMatch } = await supabaseAdmin
              .from('orcamentos')
              .select('id, cliente_nome, cliente_id')
              .eq('user_id', ownerUserId)
              .ilike('cliente_telefone', `%${lastDigits}%`)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (orcMatch) {
              ownerOrcamentoId = orcMatch.id;
              ownerClienteNome = orcMatch.cliente_nome;
              matchedClienteId = orcMatch.cliente_id;
            }

            // Busca cliente cadastrado no banco deste prestador específico
            if (!matchedClienteId) {
              const { data: cliMatch } = await supabaseAdmin
                .from('clientes')
                .select('id, nome')
                .eq('user_id', ownerUserId)
                .ilike('telefone', `%${lastDigits}%`)
                .limit(1)
                .maybeSingle();

              if (cliMatch) {
                matchedClienteId = cliMatch.id;
                if (!ownerClienteNome) ownerClienteNome = cliMatch.nome;
              }
            }

            // =========================================================================
            // Tratamento de Opt-in / Opt-out e Última Interação
            // =========================================================================
            const normalizedCorpo = corpoTexto.trim().toUpperCase();
            const isOptOut = OPT_OUT_KEYWORDS.includes(normalizedCorpo);
            const isOptIn = OPT_IN_KEYWORDS.includes(normalizedCorpo);

            if (matchedClienteId) {
              if (isOptOut) {
                console.log(`[whatsapp-webhook] Solicitação de descadastro (opt-out) do cliente ${matchedClienteId}`);
                await supabaseAdmin
                  .from('clientes')
                  .update({
                    whatsapp_opt_in: false,
                    whatsapp_opt_out_at: new Date().toISOString(),
                    last_inbound_at: new Date().toISOString(),
                  })
                  .eq('id', matchedClienteId)
                  .eq('user_id', ownerUserId);
              } else if (isOptIn) {
                console.log(`[whatsapp-webhook] Reativação de cadastro (opt-in) do cliente ${matchedClienteId}`);
                await supabaseAdmin
                  .from('clientes')
                  .update({
                    whatsapp_opt_in: true,
                    whatsapp_opt_in_at: new Date().toISOString(),
                    whatsapp_opt_in_source: 'whatsapp_inbound',
                    whatsapp_opt_out_at: null,
                    last_inbound_at: new Date().toISOString(),
                  })
                  .eq('id', matchedClienteId)
                  .eq('user_id', ownerUserId);
              } else {
                await supabaseAdmin
                  .from('clientes')
                  .update({
                    last_inbound_at: new Date().toISOString(),
                  })
                  .eq('id', matchedClienteId)
                  .eq('user_id', ownerUserId);
              }
            }

            // Tratamento do timestamp original da Meta (epoch seconds)
            let msgTimestamp = new Date().toISOString();
            if (msg.timestamp) {
              const parsedEpoch = parseInt(String(msg.timestamp), 10);
              if (!isNaN(parsedEpoch) && parsedEpoch > 0) {
                msgTimestamp = new Date(parsedEpoch * 1000).toISOString();
              }
            }

            // Gravação segura na tabela public.mensagens_whatsapp com RLS service_role
            const nomeFinal = contactName || ownerClienteNome || 'Cliente WhatsApp';

            const { error: insertErr } = await supabaseAdmin.from('mensagens_whatsapp').insert({
              user_id: ownerUserId,
              phone_number_id: phoneNumberId,
              cliente_id: matchedClienteId,
              cliente_telefone: cleanFrom,
              cliente_nome: nomeFinal,
              corpo: corpoTexto,
              direcao: 'inbound',
              status: 'delivered',
              lida: false,
              wa_message_id: waMessageId,
              orcamento_id: ownerOrcamentoId,
              timestamp: msgTimestamp,
            });

            if (insertErr) {
              console.error('[whatsapp-webhook] Erro ao gravar mensagem no banco:', insertErr);
            } else {
              processedCount++;
            }
          }

          // =========================================================================
          // Processamento de Recibos e Atualizações de Status (value.statuses)
          // =========================================================================
          const statuses = value.statuses || [];
          for (const st of statuses) {
            const statusWaId = st.id;
            const statusType = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
            if (statusWaId && statusType) {
              await supabaseAdmin
                .from('mensagens_whatsapp')
                .update({ status: statusType })
                .eq('wa_message_id', statusWaId);
            }

            // Detecção de token revogado / expirado (código 190 da Meta)
            const errors = st.errors || [];
            for (const err of errors) {
              if (err.code === 190 && phoneNumberId) {
                console.warn(`[whatsapp-webhook] Meta token revogado/expirado para phone_number_id=${phoneNumberId}`);
                await supabaseAdmin
                  .from('whatsapp_connections')
                  .update({ status: 'revoked', updated_at: new Date().toISOString() })
                  .eq('phone_number_id', phoneNumberId);
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, processed: processedCount }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      console.error('[whatsapp-webhook Exception]:', err);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal processing error' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
