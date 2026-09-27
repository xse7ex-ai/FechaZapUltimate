// Supabase Edge Function: whatsapp-webhook
// Receptor Inbound de Mensagens do WhatsApp Cloud API (Meta)
// Responsabilidades:
//   1. GET: Verificação oficial do webhook com verificação de 'hub.challenge' e 'hub.verify_token'
//   2. POST: Recebimento de mensagens dos clientes
//      - Validação de integridade HMAC-SHA256 (X-Hub-Signature-256)
//      - Resposta HTTP 200 imediata para conformidade com a Meta
//      - Idempotência rigorosa usando wa_message_id
//      - Roteamento e descoberta do prestador dono (com base em orçamentos e clientes)
//      - Gravação exclusiva no banco com service_role na tabela public.mensagens_whatsapp

import { corsHeaders } from '../_shared/cors.ts';
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
 * Validação de Assinatura HMAC-SHA256 enviada pela Meta no header X-Hub-Signature-256
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

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // =========================================================================
  // 1. GET: Verificação do Webhook pela Meta
  // =========================================================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';

    // Verifica se os parâmetros necessários estão presentes e se o token confere
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

    // Lê o corpo bruto para cálculo do HMAC
    const rawBody = await req.text();

    // Validação de assinatura HMAC da Meta se o segredo estiver configurado
    if (appSecret) {
      const signatureHeader =
        req.headers.get('x-hub-signature-256') || req.headers.get('X-Hub-Signature-256');

      const isValid = await verifyMetaHmac(rawBody, signatureHeader, appSecret);
      if (!isValid) {
        console.warn('[whatsapp-webhook] Assinatura X-Hub-Signature-256 inválida ou ausente.');
        // Responde 200 para a Meta não ficar reenviando, mas descarta o payload
        return new Response(
          JSON.stringify({ status: 'ignored', reason: 'invalid_signature' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Inicializa o cliente com Service Role para bypass de RLS e gravação segura
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
      const payload = JSON.parse(rawBody || '{}');

      // Verifica se é um evento do WhatsApp Business Account
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

          // Se for notificação de status (sent, delivered, read), não é mensagem de texto
          const messages = value.messages || [];
          if (!Array.isArray(messages) || messages.length === 0) {
            continue;
          }

          const contacts = value.contacts || [];

          for (const msg of messages) {
            const waMessageId = msg.id;
            const fromRaw = msg.from;

            if (!waMessageId || !fromRaw) continue;

            // Extrai o conteúdo da mensagem de acordo com o tipo
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

            // Descobre o nome do contato enviado pela Meta
            const contactName =
              contacts.find((c: any) => c.wa_id === fromRaw)?.profile?.name || null;

            // Idempotência: Verifica se a mensagem já foi salva anteriormente
            const { data: existingMsg } = await supabaseAdmin
              .from('mensagens_whatsapp')
              .select('id')
              .eq('wa_message_id', waMessageId)
              .maybeSingle();

            if (existingMsg) {
              console.log('[whatsapp-webhook] Mensagem duplicada ignorada (idempotência):', waMessageId);
              continue;
            }

            // Limpa o número de telefone recebido
            const cleanFrom = cleanPhoneNumber(fromRaw);

            // =========================================================================
            // Descoberta do Dono (Prestador)
            // =========================================================================
            let ownerUserId: string | null = null;
            let ownerClienteNome: string | null = null;
            let ownerOrcamentoId: string | null = null;

            // Tentativa 1: Via RPC no PostgreSQL
            try {
              const { data: rpcOwner, error: rpcErr } = await supabaseAdmin.rpc(
                'find_whatsapp_message_owner',
                { p_clean_phone: cleanFrom }
              );

              if (!rpcErr && Array.isArray(rpcOwner) && rpcOwner.length > 0) {
                ownerUserId = rpcOwner[0].user_id;
                ownerClienteNome = rpcOwner[0].cliente_nome;
                ownerOrcamentoId = rpcOwner[0].orcamento_id;
              }
            } catch (rpcEx) {
              console.warn('[whatsapp-webhook] Falha no RPC find_whatsapp_message_owner, usando fallback:', rpcEx);
            }

            // Tentativa 2 (Fallback): Consulta direta em orçamentos e clientes
            if (!ownerUserId) {
              const digitsOnly = cleanFrom.replace(/\D/g, '');
              const lastDigits = digitsOnly.length >= 8 ? digitsOnly.slice(-8) : digitsOnly;

              // Busca em orçamentos primeiro
              const { data: orcamentosMatches } = await supabaseAdmin
                .from('orcamentos')
                .select('id, user_id, cliente_nome, cliente_telefone, created_at')
                .ilike('cliente_telefone', `%${lastDigits}%`)
                .order('created_at', { ascending: false })
                .limit(5);

              // Busca em clientes
              const { data: clientesMatches } = await supabaseAdmin
                .from('clientes')
                .select('id, user_id, nome, telefone, created_at')
                .ilike('telefone', `%${lastDigits}%`)
                .order('created_at', { ascending: false })
                .limit(5);

              const allCandidates: Array<{
                user_id: string;
                cliente_nome: string;
                orcamento_id: string | null;
                created_at: string;
              }> = [];

              if (orcamentosMatches) {
                for (const o of orcamentosMatches) {
                  allCandidates.push({
                    user_id: o.user_id,
                    cliente_nome: o.cliente_nome,
                    orcamento_id: o.id,
                    created_at: o.created_at,
                  });
                }
              }

              if (clientesMatches) {
                for (const c of clientesMatches) {
                  allCandidates.push({
                    user_id: c.user_id,
                    cliente_nome: c.nome,
                    orcamento_id: null,
                    created_at: c.created_at,
                  });
                }
              }

              // Ordena pelo mais recente
              allCandidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

              if (allCandidates.length > 0) {
                ownerUserId = allCandidates[0].user_id;
                ownerClienteNome = allCandidates[0].cliente_nome;
                ownerOrcamentoId = allCandidates[0].orcamento_id;
              }
            }

            // Se nenhum dono foi encontrado, registra aviso e descarta sem ruído
            if (!ownerUserId) {
              console.warn(
                `[whatsapp-webhook] Nenhum prestador (dono) encontrado para a mensagem recebida de: ${fromRaw} (${cleanFrom}). Mensagem descartada.`
              );
              continue;
            }

            // Insere na tabela public.mensagens_whatsapp com service_role
            const nomeFinal = contactName || ownerClienteNome || 'Cliente WhatsApp';

            const { error: insertErr } = await supabaseAdmin.from('mensagens_whatsapp').insert({
              user_id: ownerUserId,
              cliente_telefone: cleanFrom,
              cliente_nome: nomeFinal,
              corpo: corpoTexto,
              lida: false,
              wa_message_id: waMessageId,
              orcamento_id: ownerOrcamentoId,
            });

            if (insertErr) {
              console.error('[whatsapp-webhook] Erro ao gravar mensagem no banco:', insertErr);
            } else {
              processedCount++;
              console.log(
                `[whatsapp-webhook] Mensagem ${waMessageId} gravada com sucesso para o prestador ${ownerUserId}.`
              );
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
      // Sempre responde 200 para a Meta não suspender o webhook
      return new Response(
        JSON.stringify({ success: false, error: err?.message || 'Internal parsing error' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
