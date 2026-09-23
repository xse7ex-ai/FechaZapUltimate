import React from 'react';
import { Plus, Sparkles, Settings, Building2 } from 'lucide-react';
import { ConfiguracaoEmpresa } from '../types';

interface TopbarProps {
  empresa: ConfiguracaoEmpresa;
  onOpenNovoOrcamento: () => void;
  onOpenIA: () => void;
  onOpenConfig: () => void;
  geminiOnline: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  empresa,
  onOpenNovoOrcamento,
  onOpenIA,
  onOpenConfig,
  geminiOnline,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black text-xl shadow-md shadow-emerald-500/20">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-slate-900 tracking-tight">
                  Fecha<span className="text-emerald-600">Zap</span>
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  v3.1.2
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline font-medium">
                  {empresa.nomeFantasia || 'Minha Empresa'}
                </span>
                <span className="hidden sm:inline text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Gemini 3.8
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Gemini AI Trigger */}
          <button
            onClick={onOpenIA}
            title="Abrir Assistente FechaZap com Google Gemini"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-teal-50 to-emerald-50 text-emerald-800 border border-emerald-300 hover:border-emerald-400 hover:bg-emerald-100/60 transition-all shadow-sm active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-emerald-600 animate-spin-slow" />
            <span className="hidden sm:inline">Assistente IA</span>
            <span className="sm:hidden">IA</span>
          </button>

          {/* New Quote button */}
          <button
            onClick={onOpenNovoOrcamento}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-600/25"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Orçamento</span>
            <span className="sm:hidden">Novo</span>
          </button>

          {/* Settings button */}
          <button
            onClick={onOpenConfig}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
            title="Configurações da Empresa e API Gemini"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
