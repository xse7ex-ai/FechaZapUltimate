import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { formatCurrency, formatDate, cleanPhone } from './format';
import { getAuthToken } from './supabase';
import { getApiUrl } from './apiConfig';

export function generateWhatsAppQuoteText(orcamento: Orcamento, empresa: ConfiguracaoEmpresa): string {
  const itemsText = orcamento.itens
    .map((item, index) => {
      return `${index + 1}. *${item.descricao}*\n   Qtd: ${item.quantidade}x | Unit: ${formatCurrency(item.valorUnitario)} | Total: *${formatCurrency(item.total)}*`;
    })
    .join('\n\n');

  let discountText = '';
  if (orcamento.descontoValor > 0) {
    const descDisplay = orcamento.descontoTipo === 'porcentagem'
      ? `${orcamento.descontoValor}% (-${formatCurrency(orcamento.subtotal - orcamento.valorTotal)})`
      : formatCurrency(orcamento.descontoValor);
    discountText = `\n🎁 *Desconto Especial:* ${descDisplay}`;
  }

  let pixInfo = '';
  if (empresa.chavePix) {
    pixInfo = `\n⚡ *Chave PIX (${empresa.tipoChavePix.toUpperCase()}):* \`${empresa.chavePix}\``;
  }

  return `📄 *ORÇAMENTO #${orcamento.numero}*
🏢 *${empresa.nomeFantasia || 'Nossa Empresa'}*
----------------------------------------
Olá, *${orcamento.clienteNome}*! Segue a proposta detalhada para seu atendimento:

*ITENS & SERVIÇOS:*
${itemsText}
----------------------------------------
💰 *Subtotal:* ${formatCurrency(orcamento.subtotal)}${discountText}
✅ *VALOR TOTAL:* *${formatCurrency(orcamento.valorTotal)}*

💳 *Condições de Pagamento:* ${orcamento.formaPagamento || 'A combinar'}
⏱️ *Prazo estimado:* ${orcamento.prazoEntrega || 'A combinar'}
📅 *Validade da Proposta:* até ${formatDate(orcamento.dataValidade)}${pixInfo}

${orcamento.observacoes ? `📌 *Observações:* ${orcamento.observacoes}\n` : ''}
Ficou com alguma dúvida ou gostaria de aprovar para iniciarmos? Me avise por aqui! 🤝`;
}

export function generateWhatsAppUrl(phone: string, text: string): string {
  let cleaned = cleanPhone(phone);
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = `55${cleaned}`;
  }
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

export function openWhatsAppMessage(phone: string, text: string): void {
  const url = generateWhatsAppUrl(phone, text);
  window.open(url, '_blank');
}

// Disparo direto via Meta WhatsApp Cloud API utilizando as credenciais da empresa do cliente
export async function sendWhatsAppViaApi(
  to: string,
  text: string,
  empresa: ConfiguracaoEmpresa,
  orcamentoId?: string
): Promise<{ success: boolean; provider: string; messageId?: string; error?: string; fallbackUrl?: string }> {
  const phone = cleanPhone(to);
  const fallbackUrl = generateWhatsAppUrl(phone, text);

  // Validação amigável das credenciais da empresa (sem import.meta.env)
  const token = empresa?.whatsappToken?.trim();
  const phoneId = empresa?.whatsappPhoneId?.trim();

  if (!token || !phoneId) {
    return {
      success: false,
      provider: 'meta_cloud_api',
      error: 'Credenciais da API do WhatsApp não configuradas. Acesse as Configurações da Empresa e preencha o Token de Acesso e o ID do Número de Telefone da Meta.',
      fallbackUrl,
    };
  }

  try {
    let formattedPhone = phone;
    if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10 && formattedPhone.length <= 11) {
      formattedPhone = `55${formattedPhone}`;
    }

    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMessage = data?.error?.message || `Erro HTTP ${res.status} ao conectar à Meta API`;
      return {
        success: false,
        provider: 'meta_cloud_api',
        error: `Meta API: ${errorMessage}`,
        fallbackUrl,
      };
    }

    return {
      success: true,
      provider: 'meta_cloud_api',
      messageId: data?.messages?.[0]?.id,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: 'meta_cloud_api',
      error: err?.message || 'Falha de conexão com a API da Meta',
      fallbackUrl,
    };
  }
}

// Disparo seguro autenticado através do Worker/Backend (Planos PRO e TURBO)
export async function sendWhatsAppViaBackend(
  to: string,
  text: string,
  orcamentoId?: string
): Promise<{ success: boolean; provider: string; messageId?: string; error?: string; fallbackUrl?: string }> {
  const phone = cleanPhone(to);
  const fallbackUrl = generateWhatsAppUrl(phone, text);

  try {
    const token = await getAuthToken();
    if (!token) {
      return {
        success: false,
        provider: 'unauthorized',
        error: 'É necessário estar autenticado para utilizar o envio automatizado pelo servidor.',
        fallbackUrl,
      };
    }

    const res = await fetch(getApiUrl('/api/whatsapp/send'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        message: text,
        orcamentoId,
      }),
    });

    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      provider: 'network_error',
      error: err?.message || 'Falha de comunicação com o servidor',
      fallbackUrl,
    };
  }
}

export const sendWhatsAppMeta = sendWhatsAppViaApi;
