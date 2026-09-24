// Cloudflare Worker - Módulo WhatsApp (Meta Cloud API) Server-side Seguro (3.1.5)
import { Env, UserAuthContext } from './types';

// Rate Limiter em memória para proteção contra abuso e flood na Meta API
// Rastreia chave: `${userId}:${ip}` em janela deslizante de 60 segundos
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();

const MAX_MESSAGES_PER_MINUTE = 10;

export function checkWhatsAppRateLimit(userId: string, clientIp: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `${userId}:${clientIp || 'unknown'}`;
  const bucket = rateLimitMap.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + 60000,
    });
    return { allowed: true };
  }

  if (bucket.count >= MAX_MESSAGES_PER_MINUTE) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true };
}

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
  payload: { to: string; text: string; orcamentoId?: string },
  clientIp: string = ''
): Promise<{
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
  fallbackUrl?: string;
  statusCode: number;
}> {
  const phone = cleanPhoneNumber(payload.to);
  const fallbackUrl = `https://wa.me/${phone}?text=${encodeURIComponent(payload.text)}`;

  // 1. AUTENTICAÇÃO OBRIGATÓRIA (Regra 11)
  if (!user.isAuthed || user.id === 'anon') {
    return {
      success: false,
      provider: 'unauthorized',
      error: 'Não autorizado. O envio via WhatsApp Cloud API exige usuário autenticado.',
      fallbackUrl,
      statusCode: 401,
    };
  }

  // 2. AUTORIZAÇÃO POR PLANO (Regra 12)
  // Somente planos PRO e TURBO podem consumir a Meta Cloud API do servidor
  if (user.plano !== 'PRO' && user.plano !== 'TURBO') {
    return {
      success: false,
      provider: 'plano_gratuito_fallback',
      error: 'O envio automatizado via Meta WhatsApp Cloud API é exclusivo para os planos PRO e TURBO. Redirecionando para o link direto do WhatsApp Web.',
      fallbackUrl,
      statusCode: 403,
    };
  }

  // 3. RATE LIMIT POR USUÁRIO E IP (Regra 13)
  const rateLimit = checkWhatsAppRateLimit(user.id, clientIp);
  if (!rateLimit.allowed) {
    return {
      success: false,
      provider: 'rate_limited',
      error: `Limite de taxa de envio de WhatsApp excedido (máximo de ${MAX_MESSAGES_PER_MINUTE} envios por minuto). Aguarde ${rateLimit.retryAfter}s.`,
      fallbackUrl,
      statusCode: 429,
    };
  }

  // 4. Verificação de credenciais seguras do ambiente
  if (!env.WHATSAPP_TOKEN || !env.PHONE_NUMBER_ID) {
    return {
      success: false,
      provider: 'meta_not_configured',
      error: 'Meta WhatsApp Cloud API não configurada no servidor (WHATSAPP_TOKEN ou PHONE_NUMBER_ID ausentes). Utilize o link direto.',
      fallbackUrl,
      statusCode: 503,
    };
  }

  // 5. Chamada Segura à Graph API Oficial da Meta
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
        statusCode: 400,
      };
    }

    const messageId = data.messages?.[0]?.id;
    return {
      success: true,
      messageId,
      provider: 'meta-cloud-api',
      statusCode: 200,
    };
  } catch (err: any) {
    console.error('Erro de conexão com Meta WhatsApp API:', err);
    return {
      success: false,
      provider: 'network_error',
      error: err?.message || 'Erro de rede ao conectar com Meta API.',
      fallbackUrl,
      statusCode: 500,
    };
  }
}
