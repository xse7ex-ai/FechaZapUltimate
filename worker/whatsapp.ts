// Cloudflare Worker - Módulo WhatsApp (Meta Cloud API) Server-side Seguro
import { Env, UserAuthContext } from './types';

export function cleanPhoneNumber(phone: string): string {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = `55${cleaned}`;
  }
  return cleaned;
}

export async function sendMetaWhatsAppMessage(
  env: Env,
  user: UserAuthContext,
  payload: { to: string; text: string; orcamentoId?: string }
): Promise<{
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
  fallbackUrl?: string;
}> {
  const phone = cleanPhoneNumber(payload.to);
  const fallbackUrl = `https://wa.me/${phone}?text=${encodeURIComponent(payload.text)}`;

  // 1. Verificação de permissão do plano (PRO e TURBO possuem envio automatizado via Meta API)
  if (user.isAuthed && user.plano === 'GRATUITO') {
    return {
      success: false,
      provider: 'plano_gratuito_fallback',
      error: 'O envio automatizado via Meta WhatsApp Cloud API é exclusivo para os planos PRO e TURBO. Use o botão de envio direto pelo WhatsApp Web/App.',
      fallbackUrl,
    };
  }

  // 2. Verificação de credenciais seguras no ambiente
  if (!env.WHATSAPP_TOKEN || !env.PHONE_NUMBER_ID) {
    return {
      success: false,
      provider: 'meta_not_configured',
      error: 'Meta WhatsApp Cloud API não configurada no servidor (WHATSAPP_TOKEN e PHONE_NUMBER_ID ausentes). Redirecionando para WhatsApp direto.',
      fallbackUrl,
    };
  }

  // 3. Chamada à API Oficial da Meta (Graph API)
  try {
    const url = `https://graph.facebook.com/v19.0/${env.PHONE_NUMBER_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: {
          preview_url: false,
          body: payload.text,
        },
      }),
    });

    const data: any = await res.json();

    if (!res.ok) {
      console.warn('Erro na Meta Graph API:', data);
      return {
        success: false,
        provider: 'meta_api_error',
        error: data.error?.message || 'Falha ao despachar mensagem pelo Meta Cloud API.',
        fallbackUrl,
      };
    }

    const messageId = data.messages?.[0]?.id;
    return {
      success: true,
      messageId,
      provider: 'meta-cloud-api',
    };
  } catch (err: any) {
    console.error('Erro de conexão com Meta WhatsApp API:', err);
    return {
      success: false,
      provider: 'network_error',
      error: err?.message || 'Erro de rede ao conectar com Meta API.',
      fallbackUrl,
    };
  }
}
