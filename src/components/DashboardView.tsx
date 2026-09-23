import React from 'react';
import {
  FileText,
  DollarSign,
  TrendingUp,
  Clock,
  Plus,
  Sparkles,
  Send,
  Eye,
  CheckCircle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Orcamento, Cliente, ConfiguracaoEmpresa, StatusOrcamento } from '../types';
import { formatCurrency, formatDate, formatPhone, getStatusBadge } from '../utils/format';
import { generateWhatsAppQuoteText, openWhatsAppMessage } from '../utils/whatsapp';
import { ReceitaAcumuladaChart } from './ReceitaAcumuladaChart';

interface DashboardViewProps {
  orcamentos: Orcamento[];
  clientes: Cliente[];
  empresa: ConfiguracaoEmpresa;
  onOpenNovoOrcamento: () => void;
  onOpenIAForOrcamento: (orcamentoId: string) => void;
  onViewOrcamento: (orcamento: Orcamento) => void;
  onUpdateStatus: (orcamentoId: string, status: StatusOrcamento) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orcamentos,
  clientes,
  empresa,
  onOpenNovoOrcamento,
  onOpenIAForOrcamento,
  onViewOrcamento,
  onUpdateStatus,
  onShowToast,
}) => {
  // Métricas
  const totalOrcamentos = orcamentos.length;
  const orcAprovados = orcamentos.filter((o) => o.status === 'aprovado');
  const orcPendentes = orcamentos.filter((o) => o.status === 'pendente' || o.status === 'enviado');
  const orcRecusados = orcamentos.filter((o) => o.status === 'recusado');

  const faturamentoAprovado = orcAprovados.reduce((acc, o) => acc + o.valorTotal, 0);
  const valorEmAberto = orcPendentes.reduce((acc, o) => acc + o.valorTotal, 0);
  const taxaConversao =
    totalOrcamentos > 0 ? Math.round((orcAprovados.length / totalOrcamentos) * 100) : 0;

  const handleApproveWithConfetti = (orcamento: Orcamento, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateStatus(orcamento.id, 'aprovado');
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}
    onShowToast('🎉 Venda Fechada!', `Orçamento #${orcamento.numero} aprovado com sucesso!`, 'success');
  };

  const handleSendWhatsApp = (orcamento: Orcamento, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = generateWhatsAppQuoteText(orcamento, empresa);
    openWhatsAppMessage(orcamento.clienteTelefone, text);
    if (orcamento.status === 'pendente') {
      onUpdateStatus(orcamento.id, 'enviado');
    }
    onShowToast('WhatsApp aberto', `Enviando proposta para ${orcamento.clienteNome}`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Gemini AI callout */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Google Gemini 3.8 Flash Integrado</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Fechamento Rápido pelo WhatsApp
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Você tem <strong>{orcPendentes.length} orçamentos em aberto</strong> somando{' '}
              <strong>{formatCurrency(valorEmAberto)}</strong>. Use a IA Gemini para disparar gatilhos e quebrar objeções agora.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (orcPendentes.length > 0) {
                  onOpenIAForOrcamento(orcPendentes[0].id);
                } else if (orcamentos.length > 0) {
                  onOpenIAForOrcamento(orcamentos[0].id);
                } else {
                  onOpenNovoOrcamento();
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Fechar com Gemini IA</span>
            </button>

            <button
              onClick={onOpenNovoOrcamento}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Orçamento</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Faturamento Aprovado */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Faturado / Aprovado</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {formatCurrency(faturamentoAprovado)}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              <span>{orcAprovados.length} orçamentos fechados</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Valor em Aberto */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Em Aberto (A Fechar)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {formatCurrency(valorEmAberto)}
            </div>
            <div className="text-[11px] text-amber-700 font-semibold mt-1">
              {orcPendentes.length} orçamentos aguardando
            </div>
          </div>
        </div>

        {/* KPI 3: Taxa de Conversão */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Taxa de Conversão</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {taxaConversao}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Meta ideal no WhatsApp: &gt; 35%
            </div>
          </div>
        </div>

        {/* KPI 4: Total de Orçamentos */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Total de Propostas</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {totalOrcamentos}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {clientes.length} clientes na carteira
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart: Receita Total Acumulada dos Últimos 6 Meses */}
      <ReceitaAcumuladaChart orcamentos={orcamentos} />

      {/* Visual Pipeline Funnel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
        <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
          <span>Funil de Status das Propostas</span>
        </h3>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200">
            <span className="block text-[11px] font-bold text-amber-800 uppercase">Pendentes</span>
            <span className="text-lg font-black text-amber-900">
              {orcamentos.filter((o) => o.status === 'pendente').length}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200">
            <span className="block text-[11px] font-bold text-blue-800 uppercase">Enviados</span>
            <span className="text-lg font-black text-blue-900">
              {orcamentos.filter((o) => o.status === 'enviado').length}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200">
            <span className="block text-[11px] font-bold text-emerald-800 uppercase">Aprovados</span>
            <span className="text-lg font-black text-emerald-900">
              {orcAprovados.length}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200">
            <span className="block text-[11px] font-bold text-rose-800 uppercase">Recusados</span>
            <span className="text-lg font-black text-rose-900">
              {orcRecusados.length}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Quotes Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900">
              Orçamentos Recentes
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique em um orçamento para ver detalhes ou use os botões rápidos.
            </p>
          </div>
          <button
            onClick={onOpenNovoOrcamento}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar Orçamento</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {orcamentos.map((orc) => {
            const badge = getStatusBadge(orc.status);
            return (
              <div
                key={orc.id}
                onClick={() => onViewOrcamento(orc)}
                className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Left info */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                    #{orc.numero}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {orc.clienteNome}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {orc.itens?.length || 0} {orc.itens?.length === 1 ? 'item' : 'itens'} •{' '}
                      {formatPhone(orc.clienteTelefone)} • Vence em {formatDate(orc.dataValidade)}
                    </div>
                  </div>
                </div>

                {/* Right Value & Quick Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right sm:mr-2">
                    <span className="block text-xs text-slate-400">Total:</span>
                    <span className="font-extrabold text-base text-slate-900">
                      {formatCurrency(orc.valorTotal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Gemini AI closure action */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenIAForOrcamento(orc.id);
                      }}
                      title="Fechar com IA Gemini"
                      className="p-2 rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>

                    {/* Send WhatsApp action */}
                    <button
                      onClick={(e) => handleSendWhatsApp(orc, e)}
                      title="Enviar Proposta no WhatsApp"
                      className="p-2 rounded-xl text-emerald-600 bg-white hover:bg-emerald-50 border border-slate-200 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>

                    {/* Approve button if pending/enviado */}
                    {orc.status !== 'aprovado' && (
                      <button
                        onClick={(e) => handleApproveWithConfetti(orc, e)}
                        title="Marcar como Aprovado / Venda Fechada"
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Aprovar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
