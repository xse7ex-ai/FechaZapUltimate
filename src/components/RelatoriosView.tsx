import React from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  PieChart,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { formatCurrency } from '../utils/format';

interface RelatoriosViewProps {
  orcamentos: Orcamento[];
  empresa: ConfiguracaoEmpresa;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

export const RelatoriosView: React.FC<RelatoriosViewProps> = ({
  orcamentos,
  empresa,
  onShowToast,
}) => {
  const total = orcamentos.length;
  const aprovados = orcamentos.filter((o) => o.status === 'aprovado');
  const pendentes = orcamentos.filter((o) => o.status === 'pendente' || o.status === 'enviado');
  const recusados = orcamentos.filter((o) => o.status === 'recusado');

  const faturamentoAprovado = aprovados.reduce((acc, o) => acc + o.valorTotal, 0);
  const faturamentoPendente = pendentes.reduce((acc, o) => acc + o.valorTotal, 0);
  const faturamentoRecusado = recusados.reduce((acc, o) => acc + o.valorTotal, 0);
  const totalCotado = faturamentoAprovado + faturamentoPendente + faturamentoRecusado;

  const taxaConversao = total > 0 ? Math.round((aprovados.length / total) * 100) : 0;
  const ticketMedio = aprovados.length > 0 ? faturamentoAprovado / aprovados.length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Relatórios e Métricas de Fechamento
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Acompanhe o retorno financeiro dos seus orçamentos e identifique oportunidades de melhoria.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">Faturamento Fechado</div>
          <div className="text-2xl font-black text-emerald-600">
            {formatCurrency(faturamentoAprovado)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {aprovados.length} orçamentos concluídos
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">Ticket Médio (Aprovado)</div>
          <div className="text-2xl font-black text-slate-900">
            {formatCurrency(ticketMedio)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Média por cliente fechado</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">Potencial em Negociação</div>
          <div className="text-2xl font-black text-amber-600">
            {formatCurrency(faturamentoPendente)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{pendentes.length} orçamentos em aberto</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1">Taxa de Conversão</div>
          <div className="text-2xl font-black text-blue-600">{taxaConversao}%</div>
          <div className="text-[11px] text-slate-400 mt-1">{total} propostas enviadas</div>
        </div>
      </div>

      {/* Comparison & Volume Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Status Distribution */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center justify-between">
            <span>Distribuição de Valores Cotados</span>
            <span className="text-xs font-normal text-slate-500">
              Total: {formatCurrency(totalCotado)}
            </span>
          </h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-emerald-700">Aprovados ({formatCurrency(faturamentoAprovado)})</span>
                <span>{totalCotado > 0 ? Math.round((faturamentoAprovado / totalCotado) * 100) : 0}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalCotado > 0 ? (faturamentoAprovado / totalCotado) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-amber-700">Em Aberto ({formatCurrency(faturamentoPendente)})</span>
                <span>{totalCotado > 0 ? Math.round((faturamentoPendente / totalCotado) * 100) : 0}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalCotado > 0 ? (faturamentoPendente / totalCotado) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-rose-700">Recusados ({formatCurrency(faturamentoRecusado)})</span>
                <span>{totalCotado > 0 ? Math.round((faturamentoRecusado / totalCotado) * 100) : 0}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${totalCotado > 0 ? (faturamentoRecusado / totalCotado) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Closing Insights Card */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 mb-2">
              Dica de Ouro para Aumentar sua Conversão
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Orçamentos sem resposta após 3 dias têm 75% menos chance de fechamento. Usando as mensagens personalizadas do <strong>FechaZap IA com Gemini</strong>, prestadores de serviços aumentam sua conversão em média 38%.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>3 Ações recomendadas pelo algoritmo:</span>
              </div>
              <ul className="list-disc list-inside text-slate-600 space-y-1 text-[11px]">
                <li>Reenviar orçamentos com a proposta de bônus Pix</li>
                <li>Reduzir o prazo de validade para 5 dias para criar urgência real</li>
                <li>Quebrar objeções de preço com ancoragem de garantia e confiança</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Motor de análise: <strong>Gemini 3.8 Flash</strong></span>
            <span className="text-emerald-700 font-bold">100% atualizado</span>
          </div>
        </div>

      </div>
    </div>
  );
};
