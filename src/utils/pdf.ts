import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { formatCurrency, formatDate, formatPhone, formatDocument } from './format';

export function imprimirOrcamento(orcamento: Orcamento, empresa: ConfiguracaoEmpresa): void {
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    alert('Por favor, permita pop-ups para imprimir o orçamento.');
    return;
  }

  const itemsRows = orcamento.itens
    .map(
      (item, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="padding: 10px 8px; font-weight: 500; color: #1e293b;">${item.descricao}</td>
      <td style="padding: 10px 8px; text-align: center; color: #334155;">${item.quantidade}</td>
      <td style="padding: 10px 8px; text-align: right; color: #334155;">${formatCurrency(item.valorUnitario)}</td>
      <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a;">${formatCurrency(item.total)}</td>
    </tr>
  `
    )
    .join('');

  let descontoRow = '';
  if (orcamento.descontoValor > 0) {
    const descDisplay = orcamento.descontoTipo === 'porcentagem'
      ? `${orcamento.descontoValor}% (-${formatCurrency(orcamento.subtotal - orcamento.valorTotal)})`
      : formatCurrency(orcamento.descontoValor);
    descontoRow = `
      <tr>
        <td colspan="4" style="text-align: right; padding: 6px 8px; color: #e11d48; font-weight: 500;">Desconto Especial:</td>
        <td style="text-align: right; padding: 6px 8px; color: #e11d48; font-weight: 600;">-${descDisplay}</td>
      </tr>
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Orçamento #${orcamento.numero} - ${orcamento.clienteNome}</title>
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
        }
        .footer-terms {
          margin-top: 36px;
          padding-top: 16px;
          border-top: 1px dashed #cbd5e1;
          font-size: 12px;
          color: #64748b;
        }
        @media print {
          body { padding: 10mm; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="company-title">${empresa.nomeFantasia || 'Prestador de Serviços'}</h1>
          <div style="color: #64748b; font-size: 13px;">
            ${empresa.razaoSocial ? `${empresa.razaoSocial} | ` : ''}
            ${empresa.cnpj ? `CNPJ: ${formatDocument(empresa.cnpj)} | ` : ''}
            Tel: ${formatPhone(empresa.telefone || '')}
          </div>
          <div style="color: #64748b; font-size: 13px;">
            ${empresa.email ? `Email: ${empresa.email} | ` : ''}
            ${empresa.endereco ? `${empresa.endereco} - ${empresa.cidadeEstado}` : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 20px; font-weight: 800; color: #2563eb;">ORÇAMENTO #${orcamento.numero}</div>
          <div style="color: #64748b; font-size: 13px; margin: 4px 0;">Emissão: ${formatDate(orcamento.dataCriacao)}</div>
          <span class="badge badge-${orcamento.status}">${orcamento.status}</span>
        </div>
      </div>

      <div class="grid-info">
        <div>
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">DADOS DO CLIENTE</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${orcamento.clienteNome}</div>
          <div style="color: #334155; font-size: 13px;">WhatsApp/Tel: ${formatPhone(orcamento.clienteTelefone)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">CONDIÇÕES & PRAZOS</div>
          <div style="color: #334155; font-size: 13px;">Validade: <strong>${formatDate(orcamento.dataValidade)}</strong></div>
          <div style="color: #334155; font-size: 13px;">Pagamento: <strong>${orcamento.formaPagamento || 'A combinar'}</strong></div>
          <div style="color: #334155; font-size: 13px;">Prazo de entrega: <strong>${orcamento.prazoEntrega || 'A combinar'}</strong></div>
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
          ${itemsRows}
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
        empresa.chavePix
          ? `
        <div style="margin-top: 24px; padding: 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
          <strong style="color: #065f46;">Dados para Pagamento via PIX:</strong>
          <div style="color: #047857; margin-top: 4px;">Chave (${empresa.tipoChavePix.toUpperCase()}): <code>${empresa.chavePix}</code></div>
          <div style="color: #065f46; font-size: 12px; margin-top: 2px;">Favorecido: ${empresa.nomeFantasia}</div>
        </div>
      `
          : ''
      }

      ${
        orcamento.observacoes
          ? `
        <div style="margin-top: 20px;">
          <strong style="color: #475569; font-size: 13px;">Observações Importantes:</strong>
          <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px; white-space: pre-line;">${orcamento.observacoes}</p>
        </div>
      `
          : ''
      }

      <div class="footer-terms">
        ${orcamento.termosGarantia || 'Garantia de qualidade e atendimento conforme especificações acima. Proposta sujeita a disponibilidade de agenda.'}
        <div style="margin-top: 8px; font-size: 11px; text-align: center; color: #94a3b8;">
          Documento gerado pelo FechaZap 3.1.2 - Inteligência Artificial para Fechamento de Vendas
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

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
