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
  Calendar,
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

  return (
    <div className="space-y-5">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gerenciador de Orçamentos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Crie, envie via WhatsApp e feche mais rápido com a IA Gemini.
          </p>
        </div>

        <button
          onClick={onOpenNovoOrcamento}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Orçamento</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por cliente, número ou serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 text-xs">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'pendente', label: 'Pendentes' },
            { id: 'enviado', label: 'Enviados' },
            { id: 'aprovado', label: 'Aprovados' },
            { id: 'recusado', label: 'Recusados' },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                statusFilter === st.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredOrcamentos.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <p className="font-semibold text-sm text-slate-600">Nenhum orçamento encontrado.</p>
            <p className="mt-1">Tente ajustar seus termos de busca ou crie um novo orçamento.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredOrcamentos.map((orc) => {
              const badge = getStatusBadge(orc.status);
              return (
                <div
                  key={orc.id}
                  onClick={() => onViewOrcamento(orc)}
                  className="p-4 sm:p-5 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Info */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                      <span>#{orc.numero}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm sm:text-base">
                          {orc.clienteNome}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>WhatsApp: {formatPhone(orc.clienteTelefone)}</span>
                        <span>•</span>
                        <span>{orc.itens?.length || 0} itens</span>
                        <span>•</span>
                        <span>Vence em {formatDate(orc.dataValidade)}</span>
                      </div>

                      {orc.itens && orc.itens[0] && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          Serviço: {orc.itens.map((i) => i.descricao).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Actions & Value */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                    <div className="text-left md:text-right md:mr-3">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">
                        Valor Total
                      </span>
                      <span className="font-black text-base sm:text-lg text-slate-900">
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
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Gemini IA</span>
                      </button>

                      {/* WhatsApp */}
                      <button
                        onClick={(e) => handleSendWhatsApp(orc, e)}
                        title="Enviar via WhatsApp"
                        className="p-2 rounded-xl text-emerald-600 bg-white hover:bg-emerald-50 border border-slate-200 transition-colors"
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
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
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
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
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
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
