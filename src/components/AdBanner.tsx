import React from 'react';
import { ExternalLink, Sparkles, Megaphone, Crown } from 'lucide-react';
import { TipoPlano } from '../types';

interface AdBannerProps {
  userPlano?: TipoPlano;
  onOpenPerfil?: () => void;
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({
  userPlano = 'GRATUITO',
  onOpenPerfil,
  className = '',
}) => {
  // Exibido EXCLUSIVAMENTE para usuários no plano GRATUITO
  if (userPlano !== 'GRATUITO') {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-gradient-to-r from-slate-50 via-emerald-50/30 to-slate-100 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 p-4 transition-all shadow-xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Info & Ad Tag */}
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                Publicidade
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Soluções para Prestadores e Autônomos
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Precisa de maquininha sem aluguel, conta PJ gratuita ou seguro para ferramentas? Conheça nossos parceiros homologados.
            </p>
          </div>
        </div>

        {/* Upgrade Call To Action to remove ads */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {onOpenPerfil && (
            <button
              onClick={onOpenPerfil}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 hover:bg-emerald-200/80 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800/60"
            >
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span>Remover anúncios no PRO / TURBO</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
