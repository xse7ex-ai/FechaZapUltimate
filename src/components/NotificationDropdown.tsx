import React, { useRef, useEffect } from 'react';
import { Bell, AlertTriangle, Sparkles, Send, Eye, X, Check, ShieldAlert } from 'lucide-react';
import { OrcamentoVencimentoInfo, solicitarPermissaoNotificacao } from '../utils/validadeNotifications';
import { formatCurrency, formatPhone } from '../utils/format';
import { openWhatsAppMessage, generateWhatsAppQuoteText } from '../utils/whatsapp';
import { ConfiguracaoEmpresa, Orcamento } from '../types';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  vencimentos: OrcamentoVencimentoInfo[];
  empresa: ConfiguracaoEmpresa;
  onOpenIAForOrcamento: (orcamentoId: string) => void;
  onViewOrcamento: (orcamento: Orcamento) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  isOpen,
  onClose,
  vencimentos,
  empresa,
  onOpenIAForOrcamento,
  onViewOrcamento,
  onShowToast,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendWhatsApp = (orc: Orcamento, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = generateWhatsAppQuoteText(orc, empresa);
    openWhatsAppMessage(orc.clienteTelefone, text);
    onShowToast('WhatsApp aberto', `Cobrando proposta de ${orc.clienteNome}`, 'info');
  };

  const handleRequestNativePermission = async () => {
    const granted = await solicitarPermissaoNotificacao();
    if (granted) {
      onShowToast(
        '🔔 Notificações Ativadas!',
        'Você receberá alertas no sistema operacional quando um orçamento estiver próximo da data limite.',
        'success'
      );
    } else {
      onShowToast(
        'Permissão não concedida',
        'Verifique as permissões de notificação no seu navegador.',
        'info'
      );
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-12 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header */}
      <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-sm leading-tight flex items-center gap-1.5">
              <span>Alertas de Validade</span>
              {vencimentos.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950">
                  {vencimentos.length}
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-300">
              Propostas que precisam de fechamento urgente
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Lista de orçamentos a vencer */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {vencimentos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-700 dark:text-slate-300">Tudo em dia!</p>
            <p className="mt-1 text-slate-400 dark:text-slate-500">
              Nenhum orçamento pendente está próximo do vencimento nos próximos 3 dias.
            </p>
          </div>
        ) : (
          vencimentos.map(({ orcamento, textoVencimento, badgeCor, diasRestantes }) => (
            <div
              key={orcamento.id}
              className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      #{orcamento.numero} - {orcamento.clienteNome}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Valor:{' '}
                    <strong className="text-slate-900 dark:text-slate-200">
                      {formatCurrency(orcamento.valorTotal)}
                    </strong>{' '}
                    • {formatPhone(orcamento.clienteTelefone)}
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${badgeCor}`}
                >
                  {textoVencimento}
                </span>
              </div>

              {/* Botões de Ação Rápida */}
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  onClick={() => {
                    onViewOrcamento(orcamento);
                    onClose();
                  }}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>Ver</span>
                </button>

                <button
                  onClick={(e) => handleSendWhatsApp(orcamento, e)}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>WhatsApp</span>
                </button>

                <button
                  onClick={() => {
                    onOpenIAForOrcamento(orcamento.id);
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-slate-950" />
                  <span>Fechar com IA</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer com Permissão de Notificações do Navegador */}
      <div className="p-3 bg-slate-50 dark:bg-slate-850/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400">Notificações no Navegador:</span>
        <button
          onClick={handleRequestNativePermission}
          className="font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Ativar alertas desktop</span>
        </button>
      </div>
    </div>
  );
};
