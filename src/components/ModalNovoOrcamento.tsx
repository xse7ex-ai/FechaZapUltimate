import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calculator, UserCheck, Sparkles, Mic, MicOff, Crown } from 'lucide-react';
import { Orcamento, Cliente, ItemOrcamento, TipoPlano } from '../types';
import { formatCurrency } from '../utils/format';
import { gerarOrcamentoComIA } from '../utils/ai';
import { generateUUID } from '../utils/uuid';

interface ModalNovoOrcamentoProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (orcamento: Orcamento, newCliente?: Cliente) => void;
  clientes: Cliente[];
  orcamentoToEdit?: Orcamento | null;
  nextNumero: string;
  userPlano?: TipoPlano;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenPerfil?: () => void;
}

export const ModalNovoOrcamento: React.FC<ModalNovoOrcamentoProps> = ({
  isOpen,
  onClose,
  onSave,
  clientes,
  orcamentoToEdit,
  nextNumero,
  userPlano = 'GRATUITO',
  onShowToast,
  onOpenPerfil,
}) => {
  const [clienteMode, setClienteMode] = useState<'existente' | 'novo'>('existente');
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  
  // AI Voice/Text Generator State
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    etapas?: string[];
    materiais?: string[];
    itensEsquecidos?: string[];
    perguntas?: string[];
    avisoPreco?: string;
  } | null>(null);
  
  // Novo cliente inline
  const [novoNome, setNovoNome] = useState<string>('');
  const [novoTelefone, setNovoTelefone] = useState<string>('');
  const [novoEmail, setNovoEmail] = useState<string>('');
  const [novaCidade, setNovaCidade] = useState<string>('');

  // Itens
  const [itens, setItens] = useState<ItemOrcamento[]>([
    { id: '1', descricao: '', quantidade: 1, valorUnitario: 0, total: 0 },
  ]);

  // Valores e Condições
  const [descontoTipo, setDescontoTipo] = useState<'porcentagem' | 'valor'>('valor');
  const [descontoValor, setDescontoValor] = useState<number>(0);
  const [formaPagamento, setFormaPagamento] = useState<string>('50% de entrada + 50% na conclusão (ou Pix com desconto)');
  const [prazoEntrega, setPrazoEntrega] = useState<string>('3 a 5 dias úteis');
  const [dataValidade, setDataValidade] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [termosGarantia, setTermosGarantia] = useState<string>('Garantia de 90 dias conforme código de defesa do consumidor.');

  // Autosave Draft Key
  const DRAFT_KEY = 'fechazap_draft_orcamento_v1';
  const [hasDraftRestored, setHasDraftRestored] = useState<boolean>(false);

  useEffect(() => {
    if (orcamentoToEdit) {
      setSelectedClienteId(orcamentoToEdit.clienteId);
      setClienteMode('existente');
      setItens(orcamentoToEdit.itens.length > 0 ? orcamentoToEdit.itens : [{ id: '1', descricao: '', quantidade: 1, valorUnitario: 0, total: 0 }]);
      setDescontoTipo(orcamentoToEdit.descontoTipo || 'valor');
      setDescontoValor(orcamentoToEdit.descontoValor || 0);
      setFormaPagamento(orcamentoToEdit.formaPagamento || '');
      setPrazoEntrega(orcamentoToEdit.prazoEntrega || '');
      setDataValidade(orcamentoToEdit.dataValidade || '');
      setObservacoes(orcamentoToEdit.observacoes || '');
      setTermosGarantia(orcamentoToEdit.termosGarantia || '');
      setHasDraftRestored(false);
    } else if (isOpen) {
      // Verifica se há rascunho salvo anteriormente
      try {
        const rawDraft = localStorage.getItem(DRAFT_KEY);
        if (rawDraft) {
          const draft = JSON.parse(rawDraft);
          if (
            (Array.isArray(draft.itens) && draft.itens.some((i: Partial<ItemOrcamento>) => i.descricao?.trim())) ||
            draft.novoNome?.trim() ||
            draft.observacoes?.trim()
          ) {
            setClienteMode(draft.clienteMode || 'existente');
            if (draft.selectedClienteId) setSelectedClienteId(draft.selectedClienteId);
            if (draft.novoNome) setNovoNome(draft.novoNome);
            if (draft.novoTelefone) setNovoTelefone(draft.novoTelefone);
            if (draft.novoEmail) setNovoEmail(draft.novoEmail);
            if (draft.novaCidade) setNovaCidade(draft.novaCidade);
            if (Array.isArray(draft.itens) && draft.itens.length > 0) setItens(draft.itens);
            if (draft.descontoTipo) setDescontoTipo(draft.descontoTipo);
            if (typeof draft.descontoValor === 'number') setDescontoValor(draft.descontoValor);
            if (draft.formaPagamento) setFormaPagamento(draft.formaPagamento);
            if (draft.prazoEntrega) setPrazoEntrega(draft.prazoEntrega);
            if (draft.dataValidade) setDataValidade(draft.dataValidade);
            if (draft.observacoes) setObservacoes(draft.observacoes);
            if (draft.termosGarantia) setTermosGarantia(draft.termosGarantia);
            setHasDraftRestored(true);
            return;
          }
        }
      } catch {
        // ignore draft parse error
      }

      // Default new quote
      if (clientes.length > 0) {
        setSelectedClienteId(clientes[0].id);
      }
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setDataValidade(d.toISOString().split('T')[0]);
      setItens([{ id: '1', descricao: '', quantidade: 1, valorUnitario: 0, total: 0 }]);
      setDescontoValor(0);
      setObservacoes('');
      setHasDraftRestored(false);
    }
  }, [orcamentoToEdit, isOpen, clientes]);

  // Autosave contínuo para propostas novas
  useEffect(() => {
    if (!isOpen || orcamentoToEdit) return;
    const timer = setTimeout(() => {
      try {
        const hasContent =
          itens.some((i) => i.descricao.trim().length > 0) ||
          novoNome.trim().length > 0 ||
          observacoes.trim().length > 0;

        if (hasContent) {
          const draftPayload = {
            clienteMode,
            selectedClienteId,
            novoNome,
            novoTelefone,
            novoEmail,
            novaCidade,
            itens,
            descontoTipo,
            descontoValor,
            formaPagamento,
            prazoEntrega,
            dataValidade,
            observacoes,
            termosGarantia,
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload));
        }
      } catch {
        // ignore
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    orcamentoToEdit,
    clienteMode,
    selectedClienteId,
    novoNome,
    novoTelefone,
    novoEmail,
    novaCidade,
    itens,
    descontoTipo,
    descontoValor,
    formaPagamento,
    prazoEntrega,
    dataValidade,
    observacoes,
    termosGarantia,
  ]);

  const handleClearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setHasDraftRestored(false);
    if (clientes.length > 0) {
      setSelectedClienteId(clientes[0].id);
    }
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setDataValidade(d.toISOString().split('T')[0]);
    setItens([{ id: '1', descricao: '', quantidade: 1, valorUnitario: 0, total: 0 }]);
    setDescontoValor(0);
    setObservacoes('');
    setNovoNome('');
    setNovoTelefone('');
    setNovoEmail('');
    setNovaCidade('');
    onShowToast?.('Rascunho descartado', 'O formulário foi reiniciado com valores padrão.', 'info');
  };

  if (!isOpen) return null;

  // Cálculos
  const subtotal = itens.reduce((acc, item) => acc + (item.total || 0), 0);
  const descontoCalculado =
    descontoTipo === 'porcentagem'
      ? (subtotal * (descontoValor || 0)) / 100
      : (descontoValor || 0);
  const valorTotal = Math.max(0, subtotal - descontoCalculado);

  const handleItemChange = (index: number, field: keyof ItemOrcamento, value: string | number) => {
    const updated = [...itens];
    const item = { ...updated[index] };
    if (field === 'quantidade') {
      item.quantidade = Number(value) || 0;
      item.total = item.quantidade * item.valorUnitario;
    } else if (field === 'valorUnitario') {
      item.valorUnitario = Number(value) || 0;
      item.total = item.quantidade * item.valorUnitario;
    } else if (field === 'descricao') {
      item.descricao = String(value);
    }
    updated[index] = item;
    setItens(updated);
  };

  const handleAddItem = () => {
    setItens([
      ...itens,
      {
        id: String(Date.now()),
        descricao: '',
        quantidade: 1,
        valorUnitario: 0,
        total: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (itens.length === 1) return;
    setItens(itens.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let clienteFinalId = selectedClienteId;
    let clienteFinalNome = '';
    let clienteFinalTelefone = '';
    let novoClienteCriado: Cliente | undefined = undefined;

    if (clienteMode === 'novo') {
      if (!novoNome.trim()) {
        onShowToast?.('Nome obrigatório', 'Informe o nome do novo cliente para gerar a proposta.', 'error');
        return;
      }
      const newId = generateUUID();
      novoClienteCriado = {
        id: newId,
        nome: novoNome.trim(),
        telefone: novoTelefone.trim(),
        email: novoEmail.trim() || undefined,
        cidade: novaCidade.trim() || undefined,
        dataCadastro: new Date().toISOString().split('T')[0],
        totalOrcamentos: 1,
        valorTotalGasto: 0,
      };
      clienteFinalId = newId;
      clienteFinalNome = novoClienteCriado.nome;
      clienteFinalTelefone = novoClienteCriado.telefone;
    } else {
      const selected = clientes.find((c) => c.id === selectedClienteId);
      if (!selected) {
        onShowToast?.('Cliente não selecionado', 'Selecione um cliente cadastrado ou clique em "Novo Cliente".', 'error');
        return;
      }
      clienteFinalNome = selected.nome;
      clienteFinalTelefone = selected.telefone;
    }

    const orcamentoSalvo: Orcamento = {
      id: orcamentoToEdit ? orcamentoToEdit.id : generateUUID(),
      numero: orcamentoToEdit ? orcamentoToEdit.numero : nextNumero,
      clienteId: clienteFinalId,
      clienteNome: clienteFinalNome,
      clienteTelefone: clienteFinalTelefone,
      itens: itens.filter((i) => i.descricao.trim().length > 0),
      subtotal,
      descontoTipo,
      descontoValor,
      valorTotal,
      status: orcamentoToEdit ? orcamentoToEdit.status : 'pendente',
      dataCriacao: orcamentoToEdit
        ? orcamentoToEdit.dataCriacao
        : new Date().toISOString().split('T')[0],
      dataValidade,
      formaPagamento,
      prazoEntrega,
      observacoes,
      termosGarantia,
    };

    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setHasDraftRestored(false);

    onSave(orcamentoSalvo, novoClienteCriado);
    onClose();
  };

  const handleToggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onShowToast?.('Microfone', 'Reconhecimento de voz não suportado pelo navegador. Digite sua descrição no campo.', 'info');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        onShowToast?.('Ouvindo...', 'Fale os serviços e valores para o orçamento.', 'info');
      };

      recognition.onresult = (event: any) => {
        const speechResult = event.results[0][0].transcript;
        setAiPrompt((prev) => (prev ? `${prev} ${speechResult}` : speechResult));
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleGerarOrcamentoIA = async () => {
    if (userPlano !== 'TURBO') {
      onShowToast?.('Recurso TURBO', 'A criação de orçamentos com IA é exclusiva para o plano TURBO.', 'error');
      onOpenPerfil?.();
      return;
    }

    if (!aiPrompt.trim()) {
      onShowToast?.('Texto obrigatório', 'Descreva o serviço para a IA gerar os itens.', 'error');
      return;
    }

    setLoadingAi(true);
    try {
      const res = await gerarOrcamentoComIA(aiPrompt);
      if (res.itens && res.itens.length > 0) {
        setItens(res.itens);
      }
      if (res.prazoEntrega) setPrazoEntrega(res.prazoEntrega);
      if (res.formaPagamento) setFormaPagamento(res.formaPagamento);
      if (res.observacoes) setObservacoes(res.observacoes);

      if (res.clienteNome && clienteMode === 'novo') {
        setNovoNome(res.clienteNome);
        if (res.clienteTelefone) setNovoTelefone(res.clienteTelefone);
      }

      if (res.etapas?.length || res.materiaisSugeridos?.length || res.itensEsquecidos?.length || res.perguntasAlinhamento?.length) {
        setAiSuggestions({
          etapas: res.etapas,
          materiais: res.materiaisSugeridos,
          itensEsquecidos: res.itensEsquecidos,
          perguntas: res.perguntasAlinhamento,
          avisoPreco: res.avisoPreco,
        });
      }

      onShowToast?.('Orçamento Criado com IA!', 'Itens e sugestões comerciais gerados com sucesso.', 'success');
      setAiPrompt('');
    } catch (err: any) {
      onShowToast?.('Aviso de IA', err?.message || 'Falha ao processar orçamento.', 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-novo-orcamento-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div>
            <h3 id="modal-novo-orcamento-title" className="font-bold text-lg">
              {orcamentoToEdit ? `Editar Orçamento #${orcamentoToEdit.numero}` : `Novo Orçamento #${nextNumero}`}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Preencha os itens ou utilize o assistente de voz/texto com IA Gemini (TURBO).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar formulário de orçamento"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner de Rascunho Recuperado Automaticamente */}
        {hasDraftRestored && !orcamentoToEdit && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800/50 px-4 py-2.5 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span><strong>Rascunho recuperado:</strong> seus dados não salvos foram restaurados automaticamente.</span>
            </div>
            <button
              type="button"
              onClick={handleClearDraft}
              className="text-emerald-700 dark:text-emerald-400 underline font-semibold hover:text-emerald-900 dark:hover:text-emerald-200 cursor-pointer ml-3 shrink-0"
            >
              Descartar rascunho
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* ASSISTENTE IA PARA CRIAR ORÇAMENTO (TEXTO OU VOZ) */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-emerald-50/40 dark:from-emerald-950/30 dark:via-slate-850 dark:to-slate-850 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 dark:text-emerald-300">
                  Preenchimento Automático por IA (Texto ou Áudio)
                </span>
              </div>
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                userPlano === 'TURBO'
                  ? 'bg-amber-400 text-slate-950 border border-amber-300'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                {userPlano === 'TURBO' ? 'TURBO Ativo' : 'Exclusivo TURBO'}
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ex: Reforma de piso 15m2 a 75 reais, troca de pia 250, cliente Carlos..."
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
              />

              <button
                type="button"
                onClick={handleToggleVoice}
                title={isRecording ? 'Parar gravação' : 'Gravar por voz'}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleGerarOrcamentoIA}
                disabled={loadingAi}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{loadingAi ? 'Criando...' : 'Gerar com IA'}</span>
              </button>
            </div>

            {/* Sugestões do Copiloto (Etapas, Materiais, Perguntas, Itens Esquecidos) */}
            {aiSuggestions && (
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 text-xs space-y-2.5 animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Sugestões Estratégicas do Copiloto</span>
                  </span>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded font-semibold border border-amber-200 dark:border-amber-800">
                    {aiSuggestions.avisoPreco || 'Valor sugerido pela IA. Revise antes de enviar.'}
                  </span>
                </div>

                {aiSuggestions.etapas && aiSuggestions.etapas.length > 0 && (
                  <div>
                    <strong className="text-slate-700 dark:text-slate-300 text-[11px] block">Etapas e execução recomendadas:</strong>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {aiSuggestions.etapas.map((etapa, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-750 text-slate-700 dark:text-slate-300 text-[11px]">
                          {etapa}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {aiSuggestions.itensEsquecidos && aiSuggestions.itensEsquecidos.length > 0 && (
                  <div className="text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800/50">
                    <strong className="text-[11px] block mb-0.5">Pontos de atenção / Itens comumente esquecidos:</strong>
                    <ul className="list-disc list-inside text-[11px] space-y-0.5">
                      {aiSuggestions.itensEsquecidos.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiSuggestions.perguntas && aiSuggestions.perguntas.length > 0 && (
                  <div>
                    <strong className="text-slate-700 dark:text-slate-300 text-[11px] block mb-0.5">Perguntas úteis para alinhar com o cliente:</strong>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 text-[11px] space-y-0.5">
                      {aiSuggestions.perguntas.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* CLIENTE SECTION */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                1. Cliente Destinatário
              </span>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setClienteMode('existente')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    clienteMode === 'existente'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Cliente Cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => setClienteMode('novo')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    clienteMode === 'novo'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  + Novo Cliente
                </button>
              </div>
            </div>

            {clienteMode === 'existente' ? (
              <div>
                <select
                  value={selectedClienteId}
                  onChange={(e) => setSelectedClienteId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id} className="dark:bg-slate-800">
                      {c.nome} - WhatsApp: {c.telefone} {c.cidade ? `(${c.cidade})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    WhatsApp (com DDD) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 11999998888"
                    value={novoTelefone}
                    onChange={(e) => setNovoTelefone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    E-mail (opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="joao@email.com"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Cidade / Região (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="São Paulo - SP"
                    value={novaCidade}
                    onChange={(e) => setNovaCidade(e.target.value)}
                    className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ITENS SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                2. Serviços / Itens do Orçamento
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Item
              </button>
            </div>

            <div className="space-y-2.5">
              {itens.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700/80 rounded-xl grid grid-cols-12 gap-2.5 items-center shadow-xs"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Descrição do Serviço / Produto #{index + 1}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Instalação de Ar Condicionado 12.000 BTUs..."
                      value={item.descricao}
                      onChange={(e) => handleItemChange(index, 'descricao', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-750 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Qtd
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) => handleItemChange(index, 'quantidade', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 text-center focus:bg-white dark:focus:bg-slate-750 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Unitário (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.valorUnitario}
                      onChange={(e) => handleItemChange(index, 'valorUnitario', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 text-right focus:bg-white dark:focus:bg-slate-750 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="col-span-3 sm:col-span-1 text-right">
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Total
                    </label>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      {formatCurrency(item.total)}
                    </span>
                  </div>

                  <div className="col-span-1 sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      disabled={itens.length === 1}
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors cursor-pointer"
                      title="Remover item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VALORES E DESCONTOS */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              3. Descontos e Condições Comerciais
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Desconto
                </label>
                <div className="flex">
                  <select
                    value={descontoTipo}
                    onChange={(e) => setDescontoTipo(e.target.value as 'porcentagem' | 'valor')}
                    className="bg-white dark:bg-slate-850 border border-r-0 border-slate-300 dark:border-slate-700 rounded-l-lg px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <option value="valor">R$ Fixo</option>
                    <option value="porcentagem">% Porcento</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={descontoValor}
                    onChange={(e) => setDescontoValor(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-r-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 text-right focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Validade da Proposta
                </label>
                <input
                  type="date"
                  value={dataValidade}
                  onChange={(e) => setDataValidade(e.target.value)}
                  className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Prazo de Entrega / Início
                </label>
                <input
                  type="text"
                  placeholder="Ex: 5 dias úteis"
                  value={prazoEntrega}
                  onChange={(e) => setPrazoEntrega(e.target.value)}
                  className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Condições de Pagamento
              </label>
              <input
                type="text"
                placeholder="Ex: 50% entrada + 50% entrega, ou à vista no Pix com desconto"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Observações ou Escopo do Serviço (opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Inclui material básico e limpeza após a execução."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Total Box */}
            <div className="bg-white dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Subtotal: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(subtotal)}</strong>
                {descontoCalculado > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 ml-2">
                    - Desconto: {formatCurrency(descontoCalculado)}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Valor Total:</span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(valorTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white dark:text-slate-950 shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              Salvar Orçamento
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
