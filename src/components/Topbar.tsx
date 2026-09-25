import React, { useState } from 'react';
import { Plus, Sparkles, Settings, Bell, HelpCircle, Sun, Moon, User } from 'lucide-react';
import { ConfiguracaoEmpresa, Orcamento, TipoPlano } from '../types';
import { OrcamentoVencimentoInfo } from '../utils/validadeNotifications';
import { NotificationDropdown } from './NotificationDropdown';
import { useTheme } from '../context/ThemeContext';

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
  onOpenIA,
  onOpenConfig,
  onOpenTutorial,
  onOpenPerfil,
  userPlano = 'GRATUITO',
  geminiOnline,
  vencimentos,
  onOpenIAForOrcamento,
  onViewOrcamento,
  onShowToast,
}) => {
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const { theme, toggleTheme, isDark } = useTheme();
  const urgentCount = vencimentos.length;

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 lg:px-8 py-2.5 transition-colors overflow-x-clip">
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-7xl mx-auto">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-md shadow-emerald-500/20 shrink-0">
            ⚡
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight truncate">
                Fecha<span className="text-emerald-600 dark:text-emerald-400">Zap</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                v3.1.6
              </span>
              {onOpenPerfil && (
                <button
                  type="button"
                  onClick={onOpenPerfil}
                  title="Ver cota de IA e plano da conta"
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider transition-transform active:scale-95 cursor-pointer shrink-0 ${
                    userPlano === 'TURBO'
                      ? 'bg-amber-400 text-slate-950 shadow-xs'
                      : userPlano === 'PRO'
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {userPlano}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="hidden sm:inline font-medium truncate">
                {empresa.nomeFantasia || 'Minha Empresa'}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800/60 shrink-0">
                <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                Gemini 3.8
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Theme Toggle Button (Claro / Escuro) */}
          <button
            onClick={() => {
              toggleTheme();
              onShowToast(
                isDark ? '☀️ Modo Claro ativado' : '🌙 Modo Escuro ativado',
                undefined,
                'info'
              );
            }}
            title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
            aria-label="Alternar tema claro e escuro"
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-amber-400 animate-in spin-in-180 duration-200" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600 hover:text-slate-900 transition-colors" />
            )}
          </button>

          {/* User Account & Plan Button */}
          {onOpenPerfil && (
            <button
              onClick={onOpenPerfil}
              title={`Conta & Plano: ${userPlano}`}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
            >
              <User className="w-5 h-5" />
            </button>
          )}

          {/* Notification Bell with Badge & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              title={
                urgentCount > 0
                  ? `${urgentCount} orçamento(s) próximo(s) do vencimento!`
                  : 'Nenhum alerta de vencimento'
              }
              className={`p-2 rounded-xl transition-all relative cursor-pointer ${
                urgentCount > 0
                  ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300/80 dark:border-amber-700 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
              }`}
            >
              <Bell className="w-5 h-5" />
              {urgentCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse">
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

          {/* Tutorial / Guia Button (visível a partir de sm - no mobile está disponível via menu e primeiro acesso) */}
          <button
            onClick={onOpenTutorial}
            title="Abrir Tutorial e Guia FechaZap"
            className="hidden sm:flex p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800/60 cursor-pointer"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* New Quote button - Primary Action */}
          <button
            onClick={onOpenNovoOrcamento}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white dark:text-slate-950 font-bold active:scale-95 transition-all shadow-md shadow-emerald-600/25 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Orçamento</span>
            <span className="sm:hidden">Novo</span>
          </button>

          {/* Settings button */}
          <button
            onClick={onOpenConfig}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
            title="Configurações da Empresa e API Gemini"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

