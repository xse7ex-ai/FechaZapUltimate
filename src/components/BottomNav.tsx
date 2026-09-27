import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActiveTab, TipoPlano } from '../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendentesCount: number;
  userPlano?: TipoPlano;
  unreadMensagensCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  pendentesCount,
  userPlano = 'GRATUITO',
  unreadMensagensCount = 0,
}) => {
  const { t } = useTranslation();

  const isTurbo = userPlano === 'TURBO';

  const items = isTurbo
    ? [
        {
          id: 'dashboard' as ActiveTab,
          label: t('nav.dashboard', 'Início'),
          icon: LayoutDashboard,
        },
        {
          id: 'orcamentos' as ActiveTab,
          label: t('nav.orcamentos', 'Orçamentos'),
          icon: FileText,
          badge: pendentesCount > 0 ? pendentesCount : null,
        },
        {
          id: 'mensagens' as ActiveTab,
          label: 'Respostas',
          icon: MessageSquare,
          badge: unreadMensagensCount > 0 ? unreadMensagensCount : null,
          badgeColor: 'bg-emerald-500',
        },
        {
          id: 'ia' as ActiveTab,
          label: t('nav.ia', 'Gemini IA'),
          icon: Sparkles,
          highlight: true,
        },
        {
          id: 'clientes' as ActiveTab,
          label: t('nav.clientes', 'Clientes'),
          icon: Users,
        },
      ]
    : [
        {
          id: 'dashboard' as ActiveTab,
          label: t('nav.dashboard', 'Início'),
          icon: LayoutDashboard,
        },
        {
          id: 'orcamentos' as ActiveTab,
          label: t('nav.orcamentos', 'Orçamentos'),
          icon: FileText,
          badge: pendentesCount > 0 ? pendentesCount : null,
        },
        {
          id: 'ia' as ActiveTab,
          label: t('nav.ia', 'Gemini IA'),
          icon: Sparkles,
          highlight: true,
        },
        {
          id: 'clientes' as ActiveTab,
          label: t('nav.clientes', 'Clientes'),
          icon: Users,
        },
        {
          id: 'relatorios' as ActiveTab,
          label: t('nav.relatorios', 'Relatórios'),
          icon: BarChart3,
        },
      ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 flex items-center justify-around">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
              isActive
                ? 'text-emerald-400 font-bold'
                : item.highlight
                ? 'text-emerald-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${item.highlight ? 'scale-110 text-emerald-400' : ''}`} />
              {item.badge && (
                <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
