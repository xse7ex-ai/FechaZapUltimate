import React, { useState, useMemo, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
  Phone,
  FileText,
  RefreshCw,
  Crown,
  Inbox,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { MensagemWhatsApp, Orcamento, TipoPlano, WhatsAppConnection } from '../types';
import { formatPhone } from '../utils/format';
import { openWhatsAppMessage } from '../utils/whatsapp';
import { fetchWhatsAppConnection } from '../utils/supabase';

interface MensagensViewProps {
  mensagens: MensagemWhatsApp[];
  onMarkAsRead: (id: string) => void;
  onRefresh: () => void;
  userPlano?: TipoPlano;
  onOpenPerfil?: () => void;
  orcamentos?: Orcamento[];
  onViewOrcamento?: (orcamento: Orcamento) => void;
  onShowToast?: (
    title: string,
    desc?: string,
    type?: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

export const MensagensView: React.FC<MensagensViewProps> = ({
  mensagens,
  onMarkAsRead,
  onRefresh,
  userPlano = 'GRATUITO',
  onOpenPerfil,
  orcamentos = [],
  onViewOrcamento,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);

  const isTurbo = userPlano === 'TURBO';

  useEffect(() => {
    if (isTurbo) {
      fetchWhatsAppConnection().then(setConnection).catch(() => {});
    }
  }, [isTurbo]);

  const unreadCount = useMemo(() => {
    return mensagens.filter((m) => !m.lida).length;
  }, [mensagens]);

  const filteredMensagens = useMemo(() => {
    return mensagens.filter((m) => {
      if (filterType === 'unread' && m.lida) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const nome = (m.clienteNome || '').toLowerCase();
      const telefone = (m.clienteTelefone || '').toLowerCase();
      const corpo = (m.corpo || '').toLowerCase();

      return nome.includes(term) || telefone.includes(term) || corpo.includes(term);
    });
  }, [mensagens, filterType, searchTerm]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (isTurbo) {
        fetchWhatsAppConnection().then(setConnection).catch(() => {});
      }
      await onRefresh();
      onShowToast?.('Caixa Atualizada', 'Mensagens sincronizadas com sucesso.', 'info');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleOpenWhatsAppReply = (msg: MensagemWhatsApp) => {
    if (!msg.lida) {
      onMarkAsRead(msg.id);
    }
    openWhatsAppMessage(msg.clienteTelefone, '');
    onShowToast?.(
      'Abrindo WhatsApp',
      `Iniciando conversa direta com ${msg.clienteNome || formatPhone(msg.clienteTelefone)}.`,
      'success'
    );
  };

  const formatMessageTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      const timeString = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (isToday) {
        return `Hoje às ${timeString}`;
      }

      return `${date.toLocaleDateString('pt-BR')} às ${timeString}`;
    } catch {
      return dateStr;
    }
  };

  // =========================================================================
  // GATE DE PLANO: Apenas assinantes TURBO têm acesso à Caixa de Entrada
  // =========================================================================
  if (!isTurbo) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-amber-300 dark:border-amber-800/80 bg-gradient-to-br from-amber-50 via-white to-amber-100/40 dark:from-slate-900 dark:via-slate-850 dark:to-amber-950/30 p-6 sm:p-10 shadow-xl text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-black uppercase tracking-wider mb-6 border border-amber-300 dark:border-amber-700/80">
            <Crown className="w-4 h-4 text-amber-500" />
            <span>Recurso Exclusivo Plano TURBO</span>
          </div>

          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-5 border border-amber-300 dark:border-amber-700">
            <Inbox className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Caixa de Entrada Inteligente do WhatsApp
          </h2>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed mb-8">
            Quando você utiliza o acompanhamento de propostas via WhatsApp Cloud API do plano <strong>TURBO</strong>, as respostas dos clientes são capturadas via Webhook oficial e centralizadas aqui. Não perca nenhuma resposta de atendimento.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto text-left mb-8">
            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Planos Gratuito e PRO
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-normal">
                Envio manual pelo link <code>wa.me</code>. As respostas já chegam direto no WhatsApp pessoal do seu aparelho celular.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-100/60 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Plano TURBO</span>
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-normal">
                Comunicação estruturada pelo servidor com IA e caixa de entrada integrada para atendimento ao cliente.
              </p>
            </div>
          </div>

          {onOpenPerfil && (
            <button
              onClick={onOpenPerfil}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all transform active:scale-95 cursor-pointer"
            >
              <Crown className="w-4 h-4" />
              <span>Fazer Upgrade para TURBO</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW TURBO: Caixa de Entrada Completa
  // =========================================================================
  return (
    <div className="max-w-5xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Respostas WhatsApp
                </h1>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  TURBO
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mensagens recebidas em resposta aos orçamentos e comunicações autorizadas
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 disabled:opacity-60"
            title="Atualizar mensagens"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Informações do Canal Ativo & Resolução de Roteamento (Arquitetura Híbrida) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${connection?.status === 'active' ? 'text-emerald-500 animate-pulse' : 'text-blue-500'}`} />
            <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
              {connection?.status === 'active' ? 'Canal Individual Ativo' : 'Canal Central Fecha CRM Ativo'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              connection?.status === 'active'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
            }`}>
              {connection?.status === 'active' ? 'Meta WABA Individual' : 'Roteamento Contextual'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Isolamento Multi-Tenant Garantido</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          {connection?.status === 'active'
            ? `Respostas chegam diretamente pelo seu número comercial Meta (ID: ${connection.phoneNumberId}), com prioridade direta.`
            : 'Respostas recebidas no número central oficial do Fecha CRM são roteadas automaticamente para sua conta quando a proposta for exclusiva (UNIQUE). Contatos ambíguos (AMBIGUOUS) ou não cadastrados (NOT_FOUND) são isolados pelo servidor sem vazamento entre contas.'}
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente, telefone ou texto da mensagem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todas ({mensagens.length})
          </button>
          <button
            onClick={() => setFilterType('unread')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterType === 'unread'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>Não Lidas</span>
            {unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Message List */}
      {filteredMensagens.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
            {searchTerm || filterType === 'unread'
              ? 'Nenhuma mensagem encontrada para este filtro.'
              : 'Nenhuma resposta recebida ainda.'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {searchTerm || filterType === 'unread'
              ? 'Tente ajustar os termos de busca ou remover o filtro de mensagens não lidas.'
              : 'Assim que um cliente responder ao orçamento ou mensagem de acompanhamento, a mensagem será direcionada para esta caixa.'}
          </p>
          {!searchTerm && filterType !== 'unread' && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 max-w-lg mx-auto text-[11px] text-slate-400 dark:text-slate-500 space-y-1 text-left bg-slate-50/60 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Garantia de Entrega e Sigilo Multi-Tenant:
              </span>
              <p>• <strong>UNIQUE:</strong> Proposta exclusiva com este cliente é entregue diretamente a você.</p>
              <p>• <strong>AMBIGUOUS / NOT_FOUND:</strong> Respostas sem atribuição inequívoca são retidas no servidor para proteger o sigilo comercial entre prestadores.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMensagens.map((msg) => {
            const linkedOrcamento = msg.orcamentoId
              ? orcamentos.find((o) => o.id === msg.orcamentoId)
              : null;

            return (
              <div
                key={msg.id}
                onClick={() => {
                  if (!msg.lida) onMarkAsRead(msg.id);
                }}
                className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer ${
                  !msg.lida
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  {/* Left: Contact Info */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        !msg.lida
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {msg.clienteNome
                        ? msg.clienteNome.slice(0, 2).toUpperCase()
                        : 'WA'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                          {msg.clienteNome || 'Cliente WhatsApp'}
                        </span>
                        {msg.direcao === 'outbound' ? (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            Enviada
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Recebida
                          </span>
                        )}
                        {/* Indicadores de Opt-in / Opt-out detectados no texto */}
                        {['STOP', 'SAIR', 'PARAR', 'CANCELAR'].includes((msg.corpo || '').trim().toUpperCase()) && (
                          <span className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            Opt-out Solicitado
                          </span>
                        )}
                        {['START', 'COMEÇAR', 'COMECAR', 'VOLTAR', 'SIM'].includes((msg.corpo || '').trim().toUpperCase()) && (
                          <span className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            Opt-in Reativado
                          </span>
                        )}
                        {!msg.lida && msg.direcao !== 'outbound' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            Nova
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {formatPhone(msg.clienteTelefone)}
                        </span>
                        {msg.phoneNumberId && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              Canal: {msg.phoneNumberId}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatMessageTime(msg.timestamp || msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Linked Quote Badge (if available) */}
                  {linkedOrcamento && onViewOrcamento && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewOrcamento(linkedOrcamento);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer self-start"
                      title="Ver orçamento relacionado a esta resposta"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Orçamento #{linkedOrcamento.numero}</span>
                    </button>
                  )}
                </div>

                {/* Message Body Content */}
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 text-sm text-slate-800 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/60 whitespace-pre-wrap leading-relaxed">
                  {msg.corpo}
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between gap-3 mt-3.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {msg.lida ? (
                      <span className="flex items-center gap-1 text-slate-500">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Mensagem lida</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsRead(msg.id);
                        }}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Marcar como lida
                      </button>
                    )}
                  </div>

                  {/* Primary Action: Reply on WhatsApp */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenWhatsAppReply(msg);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-sm shadow-emerald-600/25 cursor-pointer"
                    title={`Abrir WhatsApp Web/App para responder a ${msg.clienteNome || msg.clienteTelefone}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Responder no WhatsApp</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
