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

  // Form State
  const [nome, setNome] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [documento, setDocumento] = useState<string>('');
  const [cidade, setCidade] = useState<string>('');
  const [endereco, setEndereco] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');

  const openNewModal = () => {
    setEditingCliente(null);
    setNome('');
    setTelefone('');
    setEmail('');
    setDocumento('');
    setCidade('');
    setEndereco('');
    setObservacoes('');
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
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) {
      alert('Nome e Telefone são obrigatórios.');
      return;
    }

    const cliente: Cliente = {
      id: editingCliente ? editingCliente.id : `cli-${Date.now()}`,
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
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestão de Clientes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre seus clientes para gerar orçamentos instantâneos e manter histórico de conversas.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Cliente</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou cidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Grid of Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClientes.map((cliente) => {
          const clientQuotes = orcamentos.filter((o) => o.clienteId === cliente.id);
          const approvedQuotes = clientQuotes.filter((o) => o.status === 'aprovado');
          const totalGasto = approvedQuotes.reduce((acc, o) => acc + o.valorTotal, 0);

          return (
            <div
              key={cliente.id}
              className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    {cliente.nome.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(cliente)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
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
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Excluir Cliente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-slate-900 text-base">{cliente.nome}</h3>
                
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
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
                  <p className="mt-3 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 italic line-clamp-2">
                    "{cliente.observacoes}"
                  </p>
                )}
              </div>

              {/* Stats & Actions */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs mb-3 text-slate-500">
                  <span>{clientQuotes.length} orçamentos</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(totalGasto)} fechados</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openWhatsAppMessage(cliente.telefone, `Olá ${cliente.nome}, tudo bem?`)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    onClick={() => onNovoOrcamentoParaCliente(cliente.id)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
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

      {/* Modal Cadastrar / Editar Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
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
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Mendes"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Celular *</label>
                  <input
                    type="text"
                    required
                    placeholder="11999998888"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CPF ou CNPJ</label>
                  <input
                    type="text"
                    placeholder="Documento"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cidade / UF</label>
                  <input
                    type="text"
                    placeholder="Ex: São Paulo - SP"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  placeholder="Rua, número, bairro..."
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações do Cliente</label>
                <textarea
                  rows={2}
                  placeholder="Preferências, melhores horários de contato, etc."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30"
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
