import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { formatCurrency, formatDate, cleanPhone } from './format';
import { invokeEdgeFunction } from './supabase';

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
    pixInfo = `\n⚡ *Chave PIX (${(empresa.tipoChavePix || 'pix').toUpperCase()}):* \`${empresa.chavePix}\``;
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

// Disparo Automatizado de Follow-up via WhatsApp (Plano TURBO)
// Executado exclusivamente pela Edge Function whatsapp-followup com credenciais únicas do servidor
// Se o segredo não estiver configurado ou falhar, retorna fallbackUrl (wa.me) universal
export async function dispararFollowUpTurbo(
  orcamentoId: string,
  to?: string
): Promise<{
  success: boolean;
  provider: string;
  messageId?: string;
  text?: string;
  fallbackUrl?: string;
  notice?: string;
  error?: string;
}> {
  const { data, error } = await invokeEdgeFunction<any>('whatsapp-followup', {
    orcamentoId,
    to,
  });

  if (error || !data) {
    const errorMsg = error?.message || 'Falha ao conectar com o serviço de follow-up.';
    return {
      success: false,
      provider: 'error',
      error: errorMsg,
      fallbackUrl: to ? generateWhatsAppUrl(to, 'Olá! Gostaria de saber se você avaliou nosso orçamento.') : undefined,
    };
  }

  return {
    success: Boolean(data.success),
    provider: data.provider || 'wa_me_fallback',
    messageId: data.messageId,
    text: data.text,
    fallbackUrl: data.fallbackUrl,
    notice: data.notice,
    error: data.error,
  };
}
