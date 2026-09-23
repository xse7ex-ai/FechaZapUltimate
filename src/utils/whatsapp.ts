import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { formatCurrency, formatDate, cleanPhone } from './format';

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
