import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { formatCurrency, formatDate, formatPhone, formatDocument } from './format';

/**
 * Sanitiza valores de texto para evitar vulnerabilidades de XSS na janela de impressão/PDF.
 */
function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateOrcamentoPrintHtml(orcamento: Orcamento, empresa: ConfiguracaoEmpresa): string {

  const safeClienteNome = escapeHtml(orcamento.clienteNome || 'Cliente');
  const safeNumero = escapeHtml(orcamento.numero || '1');
  const safeStatus = escapeHtml(orcamento.status || 'pendente');
  const safeFormaPagamento = escapeHtml(orcamento.formaPagamento || 'A combinar');
  const safePrazoEntrega = escapeHtml(orcamento.prazoEntrega || 'A combinar');
  const safeObservacoes = escapeHtml(orcamento.observacoes || '');
  const safeTermosGarantia = escapeHtml(
    orcamento.termosGarantia ||
      'Garantia de qualidade e atendimento conforme especificações acima. Proposta sujeita a disponibilidade de agenda.'
  );

  const safeEmpresaNome = escapeHtml(empresa.nomeFantasia || 'Prestador de Serviços');
  const safeRazaoSocial = escapeHtml(empresa.razaoSocial || '');
  const safeCnpj = empresa.cnpj ? formatDocument(empresa.cnpj) : '';
  const safeTelefone = formatPhone(empresa.telefone || '');
  const safeEmail = escapeHtml(empresa.email || '');
  const safeEndereco = escapeHtml(empresa.endereco || '');
  const safeCidadeEstado = escapeHtml(empresa.cidadeEstado || '');
  const safeChavePix = escapeHtml(empresa.chavePix || '');
  const safeTipoChavePix = escapeHtml((empresa.tipoChavePix || 'cpf').toUpperCase());

  const itemsRows = (orcamento.itens || [])
    .map(
      (item, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
      <td style="padding: 10px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="padding: 10px 8px; font-weight: 500; color: #1e293b; overflow-wrap: break-word; word-break: break-word;">${escapeHtml(item.descricao)}</td>
      <td style="padding: 10px 8px; text-align: center; color: #334155;">${Number(item.quantidade) || 0}</td>
      <td style="padding: 10px 8px; text-align: right; color: #334155;">${formatCurrency(item.valorUnitario ?? 0)}</td>
      <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a;">${formatCurrency(item.total ?? 0)}</td>
    </tr>
  `
    )
    .join('');

  let descontoRow = '';
  if (orcamento.descontoValor > 0) {
    const descDisplay =
      orcamento.descontoTipo === 'porcentagem'
        ? `${orcamento.descontoValor}% (-${formatCurrency(orcamento.subtotal - orcamento.valorTotal)})`
        : formatCurrency(orcamento.descontoValor);
    descontoRow = `
      <tr>
        <td colspan="4" style="text-align: right; padding: 6px 8px; color: #e11d48; font-weight: 500;">Desconto Especial:</td>
        <td style="text-align: right; padding: 6px 8px; color: #e11d48; font-weight: 600;">-${escapeHtml(descDisplay)}</td>
      </tr>
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Orçamento #${safeNumero} - ${safeClienteNome}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 32px;
          background: #fff;
          font-size: 14px;
          line-height: 1.5;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }
        .company-title {
          font-size: 24px;
          font-weight: 800;
          color: #1e3a8a;
          margin: 0 0 4px 0;
          overflow-wrap: break-word;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-pendente { background: #fef3c7; color: #b45309; }
        .badge-enviado { background: #dbeafe; color: #1d4ed8; }
        .badge-aprovado { background: #dcfce7; color: #15803d; }
        .badge-recusado { background: #ffe4e6; color: #be123c; }
        .grid-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
          background: #f8fafc;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        th {
          background: #f1f5f9;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 10px 8px;
        }
        .total-box {
          margin-left: auto;
          width: 320px;
          background: #f8fafc;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .footer-terms {
          margin-top: 36px;
          padding-top: 16px;
          border-top: 1px dashed #cbd5e1;
          font-size: 12px;
          color: #64748b;
          page-break-inside: avoid;
          break-inside: avoid;
          overflow-wrap: break-word;
        }
        @media print {
          body { padding: 10mm; }
          .no-print { display: none; }
          tr, .total-box, .grid-info, .footer-terms {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 6px;">
            ${
              empresa.logoUrl
                ? `<img src="${escapeHtml(empresa.logoUrl)}" alt="Logo" style="max-height: 52px; max-width: 140px; object-fit: contain; border-radius: 6px;" />`
                : ''
            }
            <h1 class="company-title" style="margin: 0;">${safeEmpresaNome}</h1>
          </div>
          <div style="color: #64748b; font-size: 13px;">
            ${safeRazaoSocial ? `${safeRazaoSocial} | ` : ''}
            ${safeCnpj ? `CNPJ: ${safeCnpj} | ` : ''}
            Tel: ${safeTelefone}
          </div>
          <div style="color: #64748b; font-size: 13px;">
            ${safeEmail ? `Email: ${safeEmail} | ` : ''}
            ${safeEndereco ? `${safeEndereco} - ${safeCidadeEstado}` : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 20px; font-weight: 800; color: #2563eb;">ORÇAMENTO #${safeNumero}</div>
          <div style="color: #64748b; font-size: 13px; margin: 4px 0;">Emissão: ${formatDate(orcamento.dataCriacao)}</div>
          <span class="badge badge-${safeStatus}">${safeStatus}</span>
        </div>
      </div>

      <div class="grid-info">
        <div>
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">DADOS DO CLIENTE</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a; overflow-wrap: break-word;">${safeClienteNome}</div>
          <div style="color: #334155; font-size: 13px;">WhatsApp/Tel: ${formatPhone(orcamento.clienteTelefone)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">CONDIÇÕES & PRAZOS</div>
          <div style="color: #334155; font-size: 13px;">Validade: <strong>${formatDate(orcamento.dataValidade)}</strong></div>
          <div style="color: #334155; font-size: 13px;">Pagamento: <strong>${safeFormaPagamento}</strong></div>
          <div style="color: #334155; font-size: 13px;">Prazo de entrega: <strong>${safePrazoEntrega}</strong></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">Item</th>
            <th style="text-align: left;">Descrição do Serviço / Produto</th>
            <th style="width: 60px; text-align: center;">Qtd</th>
            <th style="width: 120px; text-align: right;">Valor Unit.</th>
            <th style="width: 120px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows || '<tr><td colspan="5" style="text-align:center; padding: 16px; color: #94a3b8;">Nenhum item adicionado à proposta.</td></tr>'}
        </tbody>
      </table>

      <div class="total-box">
        <table style="margin: 0; width: 100%;">
          <tr>
            <td colspan="4" style="text-align: right; padding: 4px 8px; color: #64748b;">Subtotal:</td>
            <td style="text-align: right; padding: 4px 8px; font-weight: 500;">${formatCurrency(orcamento.subtotal)}</td>
          </tr>
          ${descontoRow}
          <tr style="border-top: 2px solid #cbd5e1;">
            <td colspan="4" style="text-align: right; padding: 10px 8px 4px 8px; font-size: 16px; font-weight: 800; color: #0f172a;">TOTAL GERAL:</td>
            <td style="text-align: right; padding: 10px 8px 4px 8px; font-size: 18px; font-weight: 800; color: #2563eb;">${formatCurrency(orcamento.valorTotal)}</td>
          </tr>
        </table>
      </div>

      ${
        safeChavePix
          ? `
        <div style="margin-top: 24px; padding: 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; page-break-inside: avoid; break-inside: avoid;">
          <strong style="color: #065f46;">Dados para Pagamento via PIX:</strong>
          <div style="color: #047857; margin-top: 4px; overflow-wrap: break-word;">Chave (${safeTipoChavePix}): <code>${safeChavePix}</code></div>
          <div style="color: #065f46; font-size: 12px; margin-top: 2px;">Favorecido: ${safeEmpresaNome}</div>
        </div>
      `
          : ''
      }

      ${
        safeObservacoes
          ? `
        <div style="margin-top: 20px; page-break-inside: avoid; break-inside: avoid;">
          <strong style="color: #475569; font-size: 13px;">Observações Importantes:</strong>
          <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px; white-space: pre-line; overflow-wrap: break-word;">${safeObservacoes}</p>
        </div>
      `
          : ''
      }

      <div class="footer-terms">
        ${safeTermosGarantia}
        <div style="margin-top: 8px; font-size: 11px; text-align: center; color: #94a3b8;">
          Documento gerado pelo CLOSI 3.3.0 - Gestão de Orçamentos e Atendimento ao Cliente
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  return htmlContent;
}

export function imprimirOrcamento(orcamento: Orcamento, empresa: ConfiguracaoEmpresa): boolean {
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    console.warn('[CLOSI PDF] Falha ao abrir janela de impressão. Bloqueador de pop-ups ativo.');
    return false;
  }

  const htmlContent = generateOrcamentoPrintHtml(orcamento, empresa);
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  return true;
}

