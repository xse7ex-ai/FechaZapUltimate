import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Sparkles,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  User,
} from 'lucide-react';
import { ActiveTab, ConfiguracaoEmpresa, TipoPlano } from '../types';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenConfig: () => void;
  onOpenTutorial: () => void;
  onOpenPerfil?: () => void;
  userPlano?: TipoPlano;
  pendentesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenConfig,
  onOpenTutorial,
  onOpenPerfil,
  userPlano = 'GRATUITO',
  pendentesCount,
}) => {
  const { theme, toggleTheme, isDark } = useTheme();

  const menuItems = [

    {
      id: 'dashboard' as ActiveTab,
      label: 'Visão Geral',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'orcamentos' as ActiveTab,
      label: 'Orçamentos',
      icon: FileText,
      badge: pendentesCount > 0 ? `${pendentesCount} abertos` : null,
    },
    {
      id: 'clientes' as ActiveTab,
      label: 'Clientes',
      icon: Users,
      badge: null,
    },
    {
      id: 'relatorios' as ActiveTab,
      label: 'Relatórios',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'ia' as ActiveTab,
      label: 'FechaZap IA',
      icon: Sparkles,
      highlight: true,
      badge: 'Gemini',
    },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 min-h-[calc(100vh-61px)] p-4 shrink-0 border-r border-slate-800">
      <div className="space-y-1">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Menu Principal
        </p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 font-semibold'
                  : item.highlight
                  ? 'text-emerald-400 hover:bg-slate-800 hover:text-emerald-300'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${item.highlight && !isActive ? 'text-emerald-400' : ''}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-emerald-700 text-white'
                      : item.highlight
                      ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Migration to Gemini Highlight Card */}
      <div className="mt-8 p-3.5 rounded-xl bg-gradient-to-br from-slate-800 to-emerald-950/40 border border-emerald-800/40 text-xs">
        <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Google Gemini Ativo</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          Migrado com sucesso da API Claude para o modelo <strong>Gemini 3.8 Flash</strong> da Google, otimizado para respostas ultra rápidas de fechamento.
        </p>
      </div>

      {/* Bottom Footer Actions */}
      <div className="mt-auto pt-4 border-t border-slate-800 space-y-1">
        {/* Quick Theme Switcher Button */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
            )}
            <span>{isDark ? 'Modo Claro' : 'Modo Escuro'}</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-400 border border-slate-700/60">
            {isDark ? 'Escuro 🌙' : 'Claro ☀️'}
          </span>
        </button>

        {onOpenPerfil && (
          <button
            onClick={onOpenPerfil}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-emerald-400" />
              <span>Minha Conta & Plano</span>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
              userPlano === 'TURBO'
                ? 'bg-amber-400 text-slate-950'
                : userPlano === 'PRO'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {userPlano}
            </span>
          </button>
        )}

        <button
          onClick={onOpenConfig}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Configurações</span>
        </button>

        <button
          onClick={onOpenTutorial}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors group cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300" />
          <span>Tutorial & Guia FechaZap</span>
        </button>
      </div>
    </aside>
  );
};
