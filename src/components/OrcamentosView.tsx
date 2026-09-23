import React, { useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Sparkles,
  Send,
  MoreVertical,
  Trash2,
  Copy,
  Edit,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Orcamento, ConfiguracaoEmpresa, StatusOrcamento } from '../types';
import { formatCurrency, formatDate, formatPhone, getStatusBadge } from '../utils/format';
import { generateWhatsAppQuoteText, openWhatsAppMessage } from '../utils/whatsapp';

interface OrcamentosViewProps {
  orcamentos: Orcamento[];
  empresa: ConfiguracaoEmpresa;
  onOpenNovoOrcamento: () => void;
  onEditOrcamento: (orcamento: Orcamento) => void;
  onViewOrcamento: (orcamento: Orcamento) => void;
  onDeleteOrcamento: (orcamentoId: string) => void;
  onDuplicateOrcamento: (orcamento: Orcamento) => void;
  onOpenIAForOrcamento: (orcamentoId: string) => void;
  onUpdateStatus: (orcamentoId: string, status: StatusOrcamento) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

export const OrcamentosView: React.FC<OrcamentosViewProps> = ({
  orcamentos,
  empresa,
  onOpenNovoOrcamento,
  onEditOrcamento,
  onViewOrcamento,
  onDeleteOrcamento,
  onDuplicateOrcamento,
  onOpenIAForOrcamento,
  onUpdateStatus,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Contadores por status para os badges do filtro
  const counts = {
    todos: orcamentos.length,
    pendente: orcamentos.filter((o) => o.status === 'pendente').length,
    enviado: orcamentos.filter((o) => o.status === 'enviado').length,
    aprovado: orcamentos.filter((o) => o.status === 'aprovado').length,
    recusado: orcamentos.filter((o) => o.status === 'recusado').length,
  };

  const filteredOrcamentos = orcamentos.filter((orc) => {
    // Status
    if (statusFilter !== 'todos' && orc.status !== statusFilter) {
      return false;
    }
    // Search
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const matchNumero = orc.numero.toLowerCase().includes(term);
    const matchCliente = orc.clienteNome.toLowerCase().includes(term);
    const matchTel = orc.clienteTelefone.includes(term);
    const matchItens = orc.itens?.some((i) => i.descricao.toLowerCase().includes(term));
    return matchNumero || matchCliente || matchTel || matchItens;
  });

  const handleSendWhatsApp = (orc: Orcamento, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = generateWhatsAppQuoteText(orc, empresa);
    openWhatsAppMessage(orc.clienteTelefone, text);
    if (orc.status === 'pendente') {
      onUpdateStatus(orc.id, 'enviado');
    }
    onShowToast('WhatsApp aberto', `Enviando proposta para ${orc.clienteNome}`, 'info');
  };

  const handleApprove = (orc: Orcamento, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateStatus(orc.id, 'aprovado');
    try {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
    } catch {}
    onShowToast('🎉 Venda Fechada!', `Orçamento #${orc.numero} marcado como aprovado!`, 'success');
  };

  const statusOptions = [
    { id: 'todos', label: 'Todos os Status', icon: Filter, color: 'slate' },
    { id: 'pendente', label: 'Pendente', icon: Clock, color: 'amber' },
    { id: 'enviado', label: 'Enviado', icon: Send, color: 'blue' },
    { id: 'aprovado', label: 'Aprovado', icon: CheckCircle2, color: 'emerald' },
    { id: 'recusado', label: 'Recusado', icon: XCircle, color: 'rose' },
  ];

  return (
    <div className="space-y-5">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Gerenciador de Orçamentos
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Crie, envie via WhatsApp e feche mais rápido com a IA Gemini.
          </p>
        </div>

        <button
          onClick={onOpenNovoOrcamento}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white dark:text-slate-950 shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Orçamento</span>
        </button>
      </div>

      {/* Filter and Search Bar Container */}
      <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar por cliente, número ou serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Seletor de Filtro Dropdown */}
          <div className="relative min-w-[200px] shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white dark:focus-within:bg-slate-800">
              <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <label htmlFor="status-select-filter" className="sr-only">
                Filtrar por Status
              </label>
              <select
                id="status-select-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer py-1"
              >
                <option value="todos" className="dark:bg-slate-800">Todos os Status ({counts.todos})</option>
                <option value="pendente" className="dark:bg-slate-800">⏳ Pendente ({counts.pendente})</option>
                <option value="enviado" className="dark:bg-slate-800">📤 Enviado ({counts.enviado})</option>
                <option value="aprovado" className="dark:bg-slate-800">✅ Aprovado ({counts.aprovado})</option>
                <option value="recusado" className="dark:bg-slate-800">❌ Recusado ({counts.recusado})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Status Filter Buttons / Pills with Counters */}
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
            Status:
          </span>

          {statusOptions.map((st) => {
            const Icon = st.icon;
            const count = counts[st.id as keyof typeof counts] ?? 0;
            const isSelected = statusFilter === st.id;

            return (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? st.id === 'pendente'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : st.id === 'enviado'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : st.id === 'aprovado'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : st.id === 'recusado'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{st.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Active Filter Clear Tag */}
          {statusFilter !== 'todos' && (
            <button
              onClick={() => setStatusFilter('todos')}
              className="ml-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Limpar filtro</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Information Bar (when filtered) */}
      {statusFilter !== 'todos' && (
        <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              Exibindo apenas orçamentos com status <strong>{statusFilter.toUpperCase()}</strong> ({filteredOrcamentos.length} de {orcamentos.length})
            </span>
          </div>
          <button
            onClick={() => setStatusFilter('todos')}
            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
          >
            Ver todos
          </button>
        </div>
      )}

      {/* Quotes List / Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        {filteredOrcamentos.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Filter className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
              Nenhum orçamento encontrado com os filtros atuais.
            </p>
            <p className="text-slate-500 dark:text-slate-400">
              {statusFilter !== 'todos'
                ? `Não há propostas com o status "${statusFilter}".`
                : 'Tente ajustar seus termos de busca.'}
            </p>
            {statusFilter !== 'todos' && (
              <button
                onClick={() => setStatusFilter('todos')}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Mostrar todos os orçamentos</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredOrcamentos.map((orc) => {
              const badge = getStatusBadge(orc.status);
              return (
                <div
                  key={orc.id}
                  onClick={() => onViewOrcamento(orc)}
                  className="p-4 sm:p-5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Info */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                      <span>#{orc.numero}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                          {orc.clienteNome}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatusFilter(orc.status);
                          }}
                          title={`Filtrar lista por ${badge.label}`}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border hover:opacity-80 transition-opacity cursor-pointer ${badge.bg}`}
                        >
                          {badge.label}
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>WhatsApp: {formatPhone(orc.clienteTelefone)}</span>
                        <span>•</span>
                        <span>{orc.itens?.length || 0} itens</span>
                        <span>•</span>
                        <span>Vence em {formatDate(orc.dataValidade)}</span>
                      </div>

                      {orc.itens && orc.itens[0] && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 line-clamp-1">
                          Serviço: {orc.itens.map((i) => i.descricao).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Actions & Value */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                    <div className="text-left md:text-right md:mr-3">
                      <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                        Valor Total
                      </span>
                      <span className="font-black text-base sm:text-lg text-slate-900 dark:text-white">
                        {formatCurrency(orc.valorTotal)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Gemini AI Action */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenIAForOrcamento(orc.id);
                        }}
                        title="Fechar com IA Gemini 3.8"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Gemini IA</span>
                      </button>

                      {/* WhatsApp */}
                      <button
                        onClick={(e) => handleSendWhatsApp(orc, e)}
                        title="Enviar via WhatsApp"
                        className="p-2 rounded-xl text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>

                      {/* Edit */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditOrcamento(orc);
                        }}
                        title="Editar Orçamento"
                        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      {/* Duplicate */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateOrcamento(orc);
                        }}
                        title="Duplicar Orçamento"
                        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Deseja realmente excluir o orçamento #${orc.numero}?`)) {
                            onDeleteOrcamento(orc.id);
                          }
                        }}
                        title="Excluir Orçamento"
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
