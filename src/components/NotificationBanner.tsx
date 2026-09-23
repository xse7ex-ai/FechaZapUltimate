import React, { useState } from 'react';
import { AlertTriangle, Sparkles, ArrowRight, X, BellRing } from 'lucide-react';
import { OrcamentoVencimentoInfo } from '../utils/validadeNotifications';
import { formatCurrency } from '../utils/format';

interface NotificationBannerProps {
  vencimentos: OrcamentoVencimentoInfo[];
  onOpenIAForOrcamento: (orcamentoId: string) => void;
  onVerOrcamentos: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  vencimentos,
  onOpenIAForOrcamento,
  onVerOrcamentos,
}) => {
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  if (isDismissed || vencimentos.length === 0) return null;

  const maisUrgente = vencimentos[0];

  return (
    <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 text-slate-950 px-4 py-2.5 sm:px-6 shadow-md border-b border-amber-600/40 relative z-20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs sm:text-sm">
        {/* Left message */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-black/10 flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4 text-slate-950 animate-bounce-slow" />
          </div>

          <div className="truncate">
            <span className="font-black uppercase tracking-wider text-[11px] bg-black/10 px-1.5 py-0.5 rounded mr-2">
              Alerta de Validade
            </span>
            <span className="font-semibold text-slate-950">
              {vencimentos.length === 1 ? (
                <>
                  Orçamento <strong>#{maisUrgente.orcamento.numero}</strong> (
                  {maisUrgente.orcamento.clienteNome} -{' '}
                  {formatCurrency(maisUrgente.orcamento.valorTotal)}){' '}
                  <strong className="underline underline-offset-2">
                    {maisUrgente.textoVencimento.toLowerCase()}
                  </strong>
                  !
                </>
              ) : (
                <>
                  Você tem <strong>{vencimentos.length} orçamentos</strong> prestes a expirar nos
                  próximos dias! O mais urgente é o de{' '}
                  <strong>{maisUrgente.orcamento.clienteNome}</strong> ({maisUrgente.textoVencimento.toLowerCase()}).
                </>
              )}
            </span>
          </div>
        </div>

        {/* Right action buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            onClick={() => onOpenIAForOrcamento(maisUrgente.orcamento.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs bg-slate-950 text-white hover:bg-slate-900 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Disparar Gatilho IA</span>
          </button>

          <button
            onClick={onVerOrcamentos}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs bg-white/25 hover:bg-white/40 text-slate-950 transition-colors cursor-pointer"
          >
            <span>Ver Lista</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            onClick={() => setIsDismissed(true)}
            title="Fechar aviso temporariamente"
            className="p-1 rounded-lg hover:bg-black/10 text-slate-900 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
