import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { TrendingUp, DollarSign, Calendar, ArrowUpRight, BarChart2 } from 'lucide-react';
import { Orcamento } from '../types';
import { formatCurrency } from '../utils/format';

interface ReceitaAcumuladaChartProps {
  orcamentos: Orcamento[];
}

type ViewMode = 'acumulada' | 'mensal' | 'comparativo';

interface MesData {
  mesKey: string;
  mesLabel: string;
  mesCompleto: string;
  receitaMes: number;
  receitaAcumulada: number;
  qtdAprovados: number;
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const MONTH_NAMES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const ReceitaAcumuladaChart: React.FC<ReceitaAcumuladaChartProps> = ({ orcamentos }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('acumulada');

  // Calcula os últimos 6 meses com base na data atual
  const chartData = useMemo<MesData[]>(() => {
    const now = new Date();
    const meses: MesData[] = [];

    // Gerar chaves dos últimos 6 meses (do mais antigo para o atual)
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStr = String(month + 1).padStart(2, '0');
      const mesKey = `${year}-${monthStr}`;
      const mesLabel = `${MONTH_NAMES_SHORT[month]}/${String(year).slice(-2)}`;
      const mesCompleto = `${MONTH_NAMES_FULL[month]} de ${year}`;

      meses.push({
        mesKey,
        mesLabel,
        mesCompleto,
        receitaMes: 0,
        receitaAcumulada: 0,
        qtdAprovados: 0,
      });
    }

    // Mapear apenas orçamentos aprovados
    const aprovados = orcamentos.filter((o) => o.status === 'aprovado');

    // Somar receita de cada mês
    meses.forEach((m) => {
      const orcsDoMes = aprovados.filter((o) => {
        if (!o.dataCriacao) return false;
        return o.dataCriacao.startsWith(m.mesKey);
      });

      const totalMes = orcsDoMes.reduce((sum, o) => sum + (Number(o.valorTotal) || 0), 0);
      m.receitaMes = totalMes;
      m.qtdAprovados = orcsDoMes.length;
    });

    // Calcular receita acumulada de forma contínua
    let acumulado = 0;
    meses.forEach((m) => {
      acumulado += m.receitaMes;
      m.receitaAcumulada = acumulado;
    });

    return meses;
  }, [orcamentos]);

  // Estatísticas gerais dos 6 meses
  const totalPeriodo = chartData[chartData.length - 1]?.receitaAcumulada || 0;
  const primeiroMesReceita = chartData[0]?.receitaMes || 0;
  const ultimoMesReceita = chartData[chartData.length - 1]?.receitaMes || 0;
  const mediaMensal = totalPeriodo / 6;

  const crescimentoPercentual =
    primeiroMesReceita > 0
      ? Math.round(((ultimoMesReceita - primeiroMesReceita) / primeiroMesReceita) * 100)
      : 0;

  // Custom Tooltip do Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data: MesData = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[200px] z-50">
          <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between">
            <span>{data.mesCompleto}</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
              {data.qtdAprovados} {data.qtdAprovados === 1 ? 'venda' : 'vendas'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="font-medium">Receita Acumulada:</span>
              <span className="font-bold">{formatCurrency(data.receitaAcumulada)}</span>
            </div>

            <div className="flex items-center justify-between text-teal-300">
              <span className="font-medium">Faturamento do Mês:</span>
              <span className="font-bold">{formatCurrency(data.receitaMes)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 mb-1.5">
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Desempenho Comercial Semestral</span>
          </div>
          <h3 className="font-black text-slate-900 text-base sm:text-lg tracking-tight">
            Receita Total Acumulada (Últimos 6 Meses)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Progressão financeira dos orçamentos fechados e evolução mês a mês.
          </p>
        </div>

        {/* View Mode Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
          <button
            onClick={() => setViewMode('acumulada')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'acumulada'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Acumulada
          </button>
          <button
            onClick={() => setViewMode('mensal')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'mensal'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mês a Mês
          </button>
          <button
            onClick={() => setViewMode('comparativo')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'comparativo'
                ? 'bg-white text-slate-900 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Comparativo
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-emerald-800 tracking-wider">
              Total Acumulado (6M)
            </span>
            <div className="text-lg sm:text-xl font-black text-emerald-950 mt-0.5">
              {formatCurrency(totalPeriodo)}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
              Média Mensal Fechada
            </span>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
              {formatCurrency(mediaMensal)}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
              Faturamento Último Mês
            </span>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
              {formatCurrency(ultimoMesReceita)}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[280px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 15, right: 10, left: 0, bottom: 5 }}
          >
            <defs>
              {/* Gradient para Receita Acumulada */}
              <linearGradient id="emeraldBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
              </linearGradient>

              {/* Gradient para Receita Mensal */}
              <linearGradient id="tealBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.6} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

            <XAxis
              dataKey="mesLabel"
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(value) => {
                if (value >= 1000) {
                  return `R$ ${(value / 1000).toFixed(0)}k`;
                }
                return `R$ ${value}`;
              }}
              width={65}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />

            {viewMode === 'comparativo' && (
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                iconType="circle"
              />
            )}

            {/* Barras baseadas no viewMode */}
            {viewMode === 'acumulada' && (
              <Bar
                dataKey="receitaAcumulada"
                name="Receita Acumulada"
                fill="url(#emeraldBarGradient)"
                radius={[8, 8, 0, 0]}
                maxBarSize={48}
                animationDuration={800}
              />
            )}

            {viewMode === 'mensal' && (
              <Bar
                dataKey="receitaMes"
                name="Receita do Mês"
                fill="url(#tealBarGradient)"
                radius={[8, 8, 0, 0]}
                maxBarSize={48}
                animationDuration={800}
              />
            )}

            {viewMode === 'comparativo' && (
              <>
                <Bar
                  dataKey="receitaAcumulada"
                  name="Receita Acumulada"
                  fill="url(#emeraldBarGradient)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  animationDuration={800}
                />
                <Bar
                  dataKey="receitaMes"
                  name="Receita do Mês"
                  fill="url(#tealBarGradient)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  animationDuration={800}
                />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Footer Insight */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <span>
            Gráfico atualizado em tempo real conforme propostas são aprovadas.
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          * Considerando apenas orçamentos com status "Aprovado".
        </span>
      </div>
    </div>
  );
};
