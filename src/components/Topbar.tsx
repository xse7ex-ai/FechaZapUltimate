import React, { useState } from 'react';
import { Plus, Settings, Bell } from 'lucide-react';
import { ConfiguracaoEmpresa, Orcamento, TipoPlano } from '../types';
import { OrcamentoVencimentoInfo } from '../utils/validadeNotifications';
import { NotificationDropdown } from './NotificationDropdown';

interface TopbarProps {
  empresa: ConfiguracaoEmpresa;
  onOpenNovoOrcamento: () => void;
  onOpenIA: () => void;
  onOpenConfig: () => void;
  onOpenTutorial: () => void;
  onOpenPerfil?: () => void;
  userPlano?: TipoPlano;
  geminiOnline: boolean;
  vencimentos: OrcamentoVencimentoInfo[];
  onOpenIAForOrcamento: (orcamentoId: string) => void;
  onViewOrcamento: (orcamento: Orcamento) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  empresa,
  onOpenNovoOrcamento,
  onOpenConfig,
  onOpenPerfil,
  userPlano = 'GRATUITO',
  vencimentos,
  onOpenIAForOrcamento,
  onViewOrcamento,
  onShowToast,
}) => {
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const urgentCount = vencimentos.length;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-2.5 sm:px-6 lg:px-8 py-2 sm:py-2.5 transition-colors overflow-x-clip">
      <div className="flex items-center justify-between gap-1.5 sm:gap-4 max-w-7xl mx-auto w-full">
        {/* Left: LOGO */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black text-base sm:text-lg shadow-sm shadow-emerald-500/20 shrink-0 select-none">
            ⚡
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight leading-none select-none">
              Fecha<span className="text-emerald-600 dark:text-emerald-400">Zap</span>
            </span>
            {empresa.nomeFantasia && (
              <span className="hidden sm:inline-block text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate max-w-[180px] leading-tight mt-0.5">
                {empresa.nomeFantasia}
              </span>
            )}
          </div>
        </div>

        {/* Right: [PLANO] [NOTIFICAÇÕES] [+ NOVO] [CONFIGURAÇÕES] */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* 1. PLANO - Compact, elegant, discreet badge */}
          {onOpenPerfil ? (
            <button
              type="button"
              onClick={onOpenPerfil}
              title={`Plano da Conta: ${userPlano}. Clique para gerenciar cotas e plano.`}
              className={`text-[9px] sm:text-xs font-bold px-1.5 sm:px-2.5 py-1 rounded-md sm:rounded-lg uppercase tracking-wider transition-all active:scale-95 cursor-pointer shrink-0 border select-none ${
                userPlano === 'TURBO'
                  ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                  : userPlano === 'PRO'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {userPlano}
            </button>
          ) : (
            <span
              className={`text-[9px] sm:text-xs font-bold px-1.5 sm:px-2.5 py-1 rounded-md sm:rounded-lg uppercase tracking-wider shrink-0 border select-none ${
                userPlano === 'TURBO'
                  ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                  : userPlano === 'PRO'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {userPlano}
            </span>
          )}

          {/* 2. NOTIFICAÇÕES (Sino com badge de contagem) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              title={
                urgentCount > 0
                  ? `${urgentCount} orçamento(s) próximo(s) do vencimento!`
                  : 'Nenhum alerta de vencimento'
              }
              aria-label="Notificações de orçamentos"
              className={`p-1.5 sm:p-2 rounded-xl transition-all relative cursor-pointer ${
                urgentCount > 0
                  ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300/80 dark:border-amber-700 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
              }`}
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {urgentCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 sm:min-w-4 sm:h-4 px-0.5 bg-red-600 text-white text-[8px] sm:text-[9px] font-black rounded-full flex items-center justify-center shadow-xs">
                  {urgentCount}
                </span>
              )}
            </button>

            <NotificationDropdown
              isOpen={isNotificationOpen}
              onClose={() => setIsNotificationOpen(false)}
              vencimentos={vencimentos}
              empresa={empresa}
              onOpenIAForOrcamento={onOpenIAForOrcamento}
              onViewOrcamento={onViewOrcamento}
              onShowToast={onShowToast}
            />
          </div>

          {/* 3. BOTÃO NOVO (Ação Primária Compacta e Destacada) */}
          <button
            type="button"
            onClick={onOpenNovoOrcamento}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all shadow-sm shadow-emerald-600/25 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            <span className="sm:hidden">Novo</span>
            <span className="hidden sm:inline">Novo Orçamento</span>
          </button>

          {/* 4. CONFIGURAÇÕES (Ícone de Engrenagem) */}
          <button
            type="button"
            onClick={onOpenConfig}
            title="Configurações"
            aria-label="Configurações"
            className="p-1.5 sm:p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent cursor-pointer shrink-0"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
