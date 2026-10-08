import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  FileText,
  DollarSign,
  Send,
  Trash2,
  Edit,
  X,
} from 'lucide-react';
import { Cliente, Orcamento } from '../types';
import { formatCurrency, formatPhone } from '../utils/format';
import { openWhatsAppMessage } from '../utils/whatsapp';
import { generateUUID } from '../utils/uuid';

interface ClientesViewProps {
  clientes: Cliente[];
  orcamentos: Orcamento[];
  onSaveCliente: (cliente: Cliente) => void;
  onDeleteCliente: (clienteId: string) => void;
  onNovoOrcamentoParaCliente: (clienteId: string) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

export const ClientesView: React.FC<ClientesViewProps> = ({
  clientes,
  orcamentos,
  onSaveCliente,
  onDeleteCliente,
  onNovoOrcamentoParaCliente,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<Cliente | null>(null);

  // Form State
  const [nome, setNome] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [documento, setDocumento] = useState<string>('');
  const [cidade, setCidade] = useState<string>('');
  const [endereco, setEndereco] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [optInConsent, setOptInConsent] = useState<boolean>(false);

  const openNewModal = () => {
    setEditingCliente(null);
    setNome('');
    setTelefone('');
    setEmail('');
    setDocumento('');
    setCidade('');
    setEndereco('');
    setObservacoes('');
    setOptInConsent(false);
    setIsModalOpen(true);
  };

  const openEditModal = (c: Cliente) => {
    setEditingCliente(c);
    setNome(c.nome);
    setTelefone(c.telefone);
    setEmail(c.email || '');
    setDocumento(c.documento || '');
    setCidade(c.cidade || '');
    setEndereco(c.endereco || '');
    setObservacoes(c.observacoes || '');
    setOptInConsent(c.whatsappOptIn ?? false);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) {
      onShowToast('Campos obrigatórios', 'Nome e Telefone são obrigatórios para cadastrar o cliente.', 'error');
      return;
    }

    if (!editingCliente && !optInConsent) {
      onShowToast(
        'Consentimento obrigatório',
        'Confirme que o cliente autorizou o recebimento deste orçamento e de atualizações via WhatsApp.',
        'error'
      );
      return;
    }

    const cliente: Cliente = {
      id: editingCliente ? editingCliente.id : generateUUID(),
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim() || undefined,
      documento: documento.trim() || undefined,
      cidade: cidade.trim() || undefined,
      endereco: endereco.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
      dataCadastro: editingCliente
        ? editingCliente.dataCadastro
        : new Date().toISOString().split('T')[0],
      totalOrcamentos: editingCliente?.totalOrcamentos || 0,
      valorTotalGasto: editingCliente?.valorTotalGasto || 0,
      whatsappOptIn: optInConsent,
      whatsappOptInAt: optInConsent ? (editingCliente?.whatsappOptInAt || new Date().toISOString()) : undefined,
      whatsappOptInSource: 'cadastro_manual_optin',
      whatsappOptOutAt: !optInConsent ? new Date().toISOString() : undefined,
      lastInboundAt: editingCliente?.lastInboundAt,
    };

    onSaveCliente(cliente);
    setIsModalOpen(false);
    onShowToast(
      editingCliente ? 'Cliente atualizado!' : 'Cliente cadastrado!',
      `${cliente.nome} salvo com sucesso.`,
      'success'
    );
  };

  const filteredClientes = clientes.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.nome.toLowerCase().includes(term) ||
      c.telefone.includes(term) ||
      (c.cidade && c.cidade.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Gestão de Clientes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cadastre seus clientes para gerar orçamentos instantâneos e manter histórico de conversas.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white dark:text-slate-950 shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Cliente</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou cidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-750 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Grid of Client Cards or Empty State */}
      {filteredClientes.length === 0 ? (
        <div className="p-8 sm:p-10 text-center flex flex-col items-center justify-center max-w-md mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 border border-emerald-100 dark:border-emerald-800/40">
            <Users className="w-7 h-7" />
          </div>
          <h4 className="font-bold text-base text-slate-800 dark:text-slate-100">
            {searchTerm ? 'Nenhum cliente encontrado' : 'Sua carteira de clientes está vazia'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 mb-4 leading-relaxed">
            {searchTerm
              ? 'Tente buscar com outro termo ou limpe o campo para ver todos os clientes cadastrados.'
              : 'Cadastre seus clientes para gerenciar histórico de orçamentos, dados de contato e fechar vendas com rapidez.'}
          </p>
          <button
            onClick={searchTerm ? () => setSearchTerm('') : openNewModal}
            className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white dark:text-slate-950 shadow-md shadow-emerald-600/30 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            {searchTerm ? (
              <span>Limpar Busca</span>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Cadastrar Primeiro Cliente</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClientes.map((cliente) => {
            const clientQuotes = orcamentos.filter((o) => o.clienteId === cliente.id);
            const approvedQuotes = clientQuotes.filter((o) => o.status === 'aprovado');
            const totalGasto = approvedQuotes.reduce((acc, o) => acc + o.valorTotal, 0);

            return (
              <div
                key={cliente.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => setSelectedClientDetail(cliente)}
                      className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center font-bold text-sm cursor-pointer hover:scale-105 transition-transform"
                      title="Ver detalhes do CRM"
                    >
                      {cliente.nome.slice(0, 2).toUpperCase()}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(cliente)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Editar Cliente"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir cliente ${cliente.nome}?`)) {
                            onDeleteCliente(cliente.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3
                    onClick={() => setSelectedClientDetail(cliente)}
                    className="font-bold text-slate-900 dark:text-white text-base hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    {cliente.nome}
                  </h3>
                  
                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatPhone(cliente.telefone)}</span>
                    </div>
                    {cliente.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{cliente.email}</span>
                      </div>
                    )}
                    {cliente.cidade && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{cliente.cidade}</span>
                      </div>
                    )}
                  </div>

                  {cliente.observacoes && (
                    <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 p-2 rounded-lg border border-slate-100 dark:border-slate-800 italic line-clamp-2">
                      "{cliente.observacoes}"
                    </p>
                  )}
                </div>

                {/* Stats & Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-3 text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => setSelectedClientDetail(cliente)}
                      className="hover:underline font-medium text-slate-600 dark:text-slate-300"
                    >
                      {clientQuotes.length} orçamentos (Ver Histórico)
                    </button>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(totalGasto)} fechados</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openWhatsAppMessage(cliente.telefone, `Olá ${cliente.nome}, tudo bem?`)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      onClick={() => onNovoOrcamentoParaCliente(cliente.id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white border border-transparent dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Orçamento</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Mini CRM - Detalhes e Histórico Completo do Cliente */}
      {selectedClientDetail && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
            {/* Header */}
            <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                  {selectedClientDetail.nome.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">{selectedClientDetail.nome}</h3>
                  <p className="text-xs text-slate-400">Mini CRM • Histórico Comercial</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClientDetail(null)}
                aria-label="Fechar histórico do cliente"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
              {/* Informações de Contato */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Dados de Contato
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                  <div><strong>Telefone/WhatsApp:</strong> {formatPhone(selectedClientDetail.telefone)}</div>
                  {selectedClientDetail.email && <div><strong>Email:</strong> {selectedClientDetail.email}</div>}
                  {selectedClientDetail.cidade && <div><strong>Cidade:</strong> {selectedClientDetail.cidade}</div>}
                  {selectedClientDetail.documento && <div><strong>Documento:</strong> {selectedClientDetail.documento}</div>}
                </div>
                {selectedClientDetail.observacoes && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 italic">
                    "{selectedClientDetail.observacoes}"
                  </div>
                )}
              </div>

              {/* Histórico de Orçamentos do Cliente */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Histórico de Propostas ({orcamentos.filter((o) => o.clienteId === selectedClientDetail.id).length})
                  </span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Total Aprovado: {formatCurrency(
                      orcamentos
                        .filter((o) => o.clienteId === selectedClientDetail.id && o.status === 'aprovado')
                        .reduce((acc, o) => acc + o.valorTotal, 0)
                    )}
                  </span>
                </div>

                <div className="space-y-2">
                  {orcamentos.filter((o) => o.clienteId === selectedClientDetail.id).length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-slate-500">
                      Nenhum orçamento emitido para este cliente ainda.
                    </div>
                  ) : (
                    orcamentos
                      .filter((o) => o.clienteId === selectedClientDetail.id)
                      .map((orc) => (
                        <div
                          key={orc.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">#{orc.numero}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                orc.status === 'aprovado'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                  : orc.status === 'recusado'
                                  ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                              }`}>
                                {orc.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                              {orc.itens?.map((i) => i.descricao).join(', ') || 'Serviços sob medida'}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white block">
                              {formatCurrency(orc.valorTotal)}
                            </span>
                            <span className="text-[10px] text-slate-400">{orc.dataCriacao}</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const client = selectedClientDetail;
                  setSelectedClientDetail(null);
                  openEditModal(client);
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Editar Cliente
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openWhatsAppMessage(selectedClientDetail.telefone, `Olá ${selectedClientDetail.nome}, tudo bem?`)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cid = selectedClientDetail.id;
                    setSelectedClientDetail(null);
                    onNovoOrcamentoParaCliente(cid);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Orçamento</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cadastrar / Editar Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between border-b border-slate-800">
              <h3 className="font-bold text-base">
                {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Mendes"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">WhatsApp / Celular *</label>
                  <input
                    type="text"
                    required
                    placeholder="11999998888"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">CPF ou CNPJ</label>
                  <input
                    type="text"
                    placeholder="Documento"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Cidade / UF</label>
                  <input
                    type="text"
                    placeholder="Ex: São Paulo - SP"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  placeholder="Rua, número, bairro..."
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Observações do Cliente</label>
                <textarea
                  rows={2}
                  placeholder="Preferências, melhores horários de contato, etc."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Checkbox de Consentimento WhatsApp (Opt-in) Obrigatório */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    required={!editingCliente}
                    checked={optInConsent}
                    onChange={(e) => setOptInConsent(e.target.checked)}
                    className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer h-4 w-4 shrink-0"
                  />
                  <span className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                    Confirmo que o cliente autorizou o recebimento deste orçamento e de atualizações via WhatsApp.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 cursor-pointer"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
