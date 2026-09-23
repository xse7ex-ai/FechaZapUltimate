import React from 'react';
import {
  X,
  Printer,
  Copy,
  Send,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  CreditCard,
  Building,
  User,
  ShieldAlert,
} from 'lucide-react';
import { Orcamento, ConfiguracaoEmpresa, StatusOrcamento } from '../types';
import { formatCurrency, formatDate, formatPhone, getStatusBadge } from '../utils/format';
import { generateWhatsAppQuoteText, openWhatsAppMessage } from '../utils/whatsapp';
import { imprimirOrcamento } from '../utils/pdf';

interface ModalDetalhesProps {
  isOpen: boolean;
  onClose: () => void;
  orcamento: Orcamento | null;
  empresa: ConfiguracaoEmpresa;
  onOpenIAForOrcamento: (orcamentoId: string) => void;
  onUpdateStatus: (orcamentoId: string, status: StatusOrcamento) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

export const ModalDetalhes: React.FC<ModalDetalhesProps> = ({
  isOpen,
  onClose,
  orcamento,
  empresa,
  onOpenIAForOrcamento,
  onUpdateStatus,
  onShowToast,
}) => {
  if (!isOpen || !orcamento) return null;

  const badge = getStatusBadge(orcamento.status);

  const handleCopyFormattedText = () => {
    const text = generateWhatsAppQuoteText(orcamento, empresa);
    navigator.clipboard.writeText(text);
    onShowToast('Texto copiado!', 'Texto formatado para WhatsApp na área de transferência.', 'success');
  };

  const handleSendWhatsApp = () => {
    const text = generateWhatsAppQuoteText(orcamento, empresa);
    openWhatsAppMessage(orcamento.clienteTelefone, text);
    onUpdateStatus(orcamento.id, 'enviado');
    onShowToast('WhatsApp aberto!', 'Orçamento enviado para o cliente.', 'info');
  };

  const handlePrint = () => {
    imprimirOrcamento(orcamento, empresa);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              #{orcamento.numero}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">Orçamento #{orcamento.numero}</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg}`}>
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Emitido em {formatDate(orcamento.dataCriacao)} • Validade: {formatDate(orcamento.dataValidade)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50 dark:bg-slate-900/60">
          
          {/* Client & Status quick controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-750 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-2">
                <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Dados do Cliente
              </span>
              <div className="font-bold text-slate-900 dark:text-white text-sm">{orcamento.clienteNome}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                WhatsApp: <strong className="text-slate-900 dark:text-slate-200">{formatPhone(orcamento.clienteTelefone)}</strong>
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-750 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Status do Orçamento
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={orcamento.status}
                  onChange={(e) => onUpdateStatus(orcamento.id, e.target.value as StatusOrcamento)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="pendente">🟡 Pendente (Aguardando Envio)</option>
                  <option value="enviado">🔵 Enviado (No WhatsApp)</option>
                  <option value="aprovado">🟢 Aprovado (Fechado! 🎉)</option>
                  <option value="recusado">🔴 Recusado (Perdido)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-750 overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-100/60 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Itens da Proposta
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {orcamento.itens.map((item, idx) => (
                <div key={item.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                  <div className="flex-1">
                    <span className="text-slate-400 dark:text-slate-500 mr-2 font-mono">{idx + 1}.</span>
                    <strong className="text-slate-900 dark:text-white">{item.descricao}</strong>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                      {item.quantidade}x un. de {formatCurrency(item.valorUnitario)}
                    </div>
                  </div>
                  <div className="text-right font-bold text-slate-900 dark:text-emerald-400 text-sm">
                    {formatCurrency(item.total)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals Summary */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 border-t border-slate-200 dark:border-slate-700 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal:</span>
                <span className="text-slate-800 dark:text-slate-200">{formatCurrency(orcamento.subtotal)}</span>
              </div>
              {orcamento.descontoValor > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-medium">
                  <span>
                    Desconto (
                    {orcamento.descontoTipo === 'porcentagem'
                      ? `${orcamento.descontoValor}%`
                      : 'Fixo'}
                    ):
                  </span>
                  <span>-{formatCurrency(orcamento.subtotal - orcamento.valorTotal)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>VALOR TOTAL:</span>
                <span className="text-lg text-emerald-600 dark:text-emerald-400">{formatCurrency(orcamento.valorTotal)}</span>
              </div>
            </div>
          </div>

          {/* Conditions & Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-750">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Forma de Pagamento
              </div>
              <p className="text-slate-600 dark:text-slate-400">{orcamento.formaPagamento || 'A combinar'}</p>
            </div>

            <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-750">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Prazo de Execução
              </div>
              <p className="text-slate-600 dark:text-slate-400">{orcamento.prazoEntrega || 'A combinar'}</p>
            </div>
          </div>

          {/* Observations */}
          {orcamento.observacoes && (
            <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-750 text-xs">
              <strong className="block text-slate-700 dark:text-slate-300 mb-1">Observações:</strong>
              <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line">{orcamento.observacoes}</p>
            </div>
          )}

          {/* GEMINI AI ACTION CARD */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg border border-emerald-900/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-300 animate-spin-slow" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Fechar este Orçamento com a Gemini IA</h4>
                <p className="text-xs text-slate-300">
                  Gere mensagens de gatilhos, quebre objeções ou envie follow-up inteligente.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenIAForOrcamento(orcamento.id);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md shrink-0 active:scale-95 cursor-pointer"
            >
              Abrir Assistente Gemini
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={handleCopyFormattedText}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar Texto</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Fechar
            </button>
            <button
              onClick={handleSendWhatsApp}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 transition-all active:scale-95 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar no WhatsApp</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
