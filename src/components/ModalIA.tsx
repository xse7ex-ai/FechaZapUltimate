import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Copy,
  Check,
  Flame,
  Clock,
  ArrowRight,
  TrendingUp,
  Crown,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { Orcamento, ConfiguracaoEmpresa, TipoPlano } from '../types';
import { GATILHOS_IA } from '../data/initialData';
import {
  gerarFechamentoGemini,
  gerarFollowUpGemini,
  analisarPrecosComIA,
  TipoCenarioFollowUp,
} from '../utils/ai';
import { openWhatsAppMessage, dispararFollowUpTurbo } from '../utils/whatsapp';
import { formatCurrency } from '../utils/format';

interface ModalIAProps {
  isOpen: boolean;
  onClose: () => void;
  orcamentos: Orcamento[];
  selectedOrcamentoId?: string;
  empresa: ConfiguracaoEmpresa;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  userPlano?: TipoPlano;
  onOpenPerfil?: () => void;
}

type TabIA = 'gatilhos' | 'followup' | 'precificacao';

export const ModalIA: React.FC<ModalIAProps> = ({
  isOpen,
  onClose,
  orcamentos,
  selectedOrcamentoId,
  empresa,
  onShowToast,
  userPlano = 'GRATUITO',
  onOpenPerfil,
}) => {
  const [currentOrcamentoId, setCurrentOrcamentoId] = useState<string>(
    selectedOrcamentoId || orcamentos[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<TabIA>('gatilhos');

  // Trigger State
  const [selectedGatilho, setSelectedGatilho] = useState<string>(GATILHOS_IA[0].id);
  const [tomVoz, setTomVoz] = useState<string>('Profissional e caloroso');

  // Follow-up State
  const [diasFollowUp, setDiasFollowUp] = useState<number>(2);
  const [cenarioFollowUp, setCenarioFollowUp] = useState<TipoCenarioFollowUp>('primeiro');
  const [followUpDispatching, setFollowUpDispatching] = useState<boolean>(false);
  const [lastFallbackUrl, setLastFallbackUrl] = useState<string | null>(null);

  // Pricing State
  const [servicoAnalise, setServicoAnalise] = useState<string>('');

  // Output & Loading
  const [generatedText, setGeneratedText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const isTurbo = userPlano === 'TURBO';
  const currentOrcamento = orcamentos.find((o) => o.id === currentOrcamentoId) || orcamentos[0];

  const handleGenerateFechamento = async () => {
    if (!currentOrcamento) {
      onShowToast('Nenhum orçamento selecionado', 'Selecione um orçamento para gerar a copy.', 'error');
      return;
    }

    setLoading(true);
    setLastFallbackUrl(null);
    try {
      const gatilhoObj = GATILHOS_IA.find((g) => g.id === selectedGatilho);
      const text = await gerarFechamentoGemini(
        currentOrcamento,
        `${gatilhoObj?.titulo || ''} - ${gatilhoObj?.descricao || ''}`,
        tomVoz,
        empresa
      );
      setGeneratedText(text);
      onShowToast('Copy gerada pelo Gemini!', 'Mensagem de alta conversão pronta.', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Aviso de IA', err?.message || 'Verifique sua conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFollowUp = async () => {
    if (!currentOrcamento) return;
    setLoading(true);
    setLastFallbackUrl(null);
    try {
      const text = await gerarFollowUpGemini(
        currentOrcamento,
        diasFollowUp,
        empresa,
        cenarioFollowUp
      );
      setGeneratedText(text);
      onShowToast('Follow-up criado com Gemini!', 'Mensagem de acompanhamento pronta para revisão.', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Aviso de IA', err?.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDispararWhatsAppAutomatico = async () => {
    if (!currentOrcamento) return;
    setFollowUpDispatching(true);
    try {
      const res = await dispararFollowUpTurbo(currentOrcamento.id, currentOrcamento.clienteTelefone);
      if (res.fallbackUrl) {
        setLastFallbackUrl(res.fallbackUrl);
      }
      if (res.text) {
        setGeneratedText(res.text);
      }

      if (res.provider === 'meta-cloud-api') {
        onShowToast('WhatsApp Enviado!', 'Follow-up despachado via Meta Cloud API.', 'success');
      } else {
        onShowToast('Link Gerado!', 'Mensagem pronta no link direto do WhatsApp (wa.me).', 'info');
        if (res.fallbackUrl) {
          window.open(res.fallbackUrl, '_blank');
        }
      }
    } catch (err: any) {
      onShowToast('Erro no envio', err?.message, 'error');
    } finally {
      setFollowUpDispatching(false);
    }
  };

  const handleAnalisarPrecos = async () => {
    setLoading(true);
    setLastFallbackUrl(null);
    try {
      const itemNome = servicoAnalise.trim() || currentOrcamento?.itens?.[0]?.descricao || 'Serviço';
      const res = await analisarPrecosComIA(itemNome);
      setGeneratedText(res.text);
      onShowToast('Análise de Preços Concluída!', `Baseada em ${res.totalAmostras} orçamentos seus.`, 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Aviso de IA', err?.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedText) return;
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    onShowToast('Copiado!', 'Mensagem copiada para a área de transferência.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsAppManual = (text: string) => {
    if (!currentOrcamento?.clienteTelefone) {
      onShowToast('Telefone ausente', 'O cliente não possui telefone cadastrado.', 'error');
      return;
    }
    openWhatsAppMessage(currentOrcamento.clienteTelefone, text);
    onShowToast('WhatsApp aberto!', `Enviando para ${currentOrcamento.clienteNome}.`, 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header with Gemini Branding */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">Fecha CRM IA Copiloto</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 border border-amber-300">
                  Exclusivo TURBO
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Google Gemini • Propostas personalizadas, análise histórica e atendimento no WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lock Screen if not TURBO */}
        {!isTurbo ? (
          <div className="p-8 sm:p-12 text-center space-y-6 max-w-lg mx-auto my-auto">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
              <Crown className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h4 className="text-xl font-black text-slate-900 dark:text-white">
                Recurso Exclusivo do Plano TURBO
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Os planos <strong>Gratuito</strong> e <strong>PRO</strong> operam com foco em gestão manual sem consumo de IA no servidor.
                O plano <strong>TURBO</strong> inclui 1.500 gerações de IA por mês, criação de propostas por voz/texto, análise histórica de preços e acompanhamento autorizado via WhatsApp.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-left space-y-2">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>O que o TURBO desbloqueia:</span>
              </div>
              <ul className="text-slate-600 dark:text-slate-400 space-y-1 pl-5 list-disc">
                <li>1.500 requisições de Google Gemini por mês</li>
                <li>Comunicação e acompanhamento de clientes pelo WhatsApp</li>
                <li>Análise de preços baseada no histórico real dos seus orçamentos</li>
                <li>Criação ultrarrápida de orçamentos por comando de voz/áudio</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  onClose();
                  onOpenPerfil?.();
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4 text-amber-300" />
                <span>Fazer Upgrade para TURBO</span>
              </button>
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Quote Context Selector */}
            <div className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Orçamento:</span>
                <select
                  value={currentOrcamentoId}
                  onChange={(e) => setCurrentOrcamentoId(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium focus:ring-2 focus:ring-emerald-500 outline-none flex-1 max-w-sm"
                >
                  {orcamentos.map((orc) => (
                    <option key={orc.id} value={orc.id} className="dark:bg-slate-800">
                      #{orc.numero} - {orc.clienteNome} ({formatCurrency(orc.valorTotal)})
                    </option>
                  ))}
                </select>
              </div>

              {currentOrcamento && (
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                  <span>
                    Status:{' '}
                    <strong className="capitalize text-emerald-700 dark:text-emerald-400">
                      {currentOrcamento.status}
                    </strong>
                  </span>
                  <span>
                    WhatsApp:{' '}
                    <strong className="dark:text-slate-200">{currentOrcamento.clienteTelefone || 'Não informado'}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 shrink-0 overflow-x-auto">
              <button
                onClick={() => setActiveTab('gatilhos')}
                className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'gatilhos'
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Flame className="w-4 h-4 text-amber-500" />
                Modelos de Proposta
              </button>
              <button
                onClick={() => setActiveTab('followup')}
                className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'followup'
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Clock className="w-4 h-4 text-purple-500" />
                Follow-up WhatsApp
              </button>
              <button
                onClick={() => setActiveTab('precificacao')}
                className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'precificacao'
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Análise de Preços
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900/60">
              
              {/* TAB 1: GATILHOS */}
              {activeTab === 'gatilhos' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Gatilho de Conversão:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {GATILHOS_IA.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setSelectedGatilho(g.id)}
                          className={`text-left p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                            selectedGatilho === g.id
                              ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-sm ring-1 ring-emerald-500'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-slate-900 dark:text-white mb-1">{g.titulo}</div>
                          <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">{g.descricao}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Tom de Voz:
                      </label>
                      <select
                        value={tomVoz}
                        onChange={(e) => setTomVoz(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                      >
                        <option>Profissional e caloroso</option>
                        <option>Direto e urgente</option>
                        <option>Consultivo e amigável</option>
                        <option>Premium e exclusivo</option>
                      </select>
                    </div>

                    <button
                      onClick={handleGenerateFechamento}
                      disabled={loading}
                      className="mt-5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{loading ? 'Gerando com Gemini...' : 'Gerar Mensagem de Atendimento'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: FOLLOW-UP AUTOMÁTICO WHATSAPP */}
              {activeTab === 'followup' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-xs text-purple-900 dark:text-purple-300">
                    <p className="font-semibold mb-1">Assistente de Acompanhamento Fecha CRM (TURBO)</p>
                    <p className="leading-relaxed">
                      Envie uma mensagem educada perguntando se o cliente tem alguma dúvida sobre a proposta de serviço.
                      O envio utiliza a conta comercial integrada com fallback garantido para o link direto do WhatsApp (wa.me).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Cenário Comercial:
                      </label>
                      <select
                        value={cenarioFollowUp}
                        onChange={(e) => setCenarioFollowUp(e.target.value as TipoCenarioFollowUp)}
                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                      >
                        <option value="primeiro">1º Contato (Acompanhamento inicial)</option>
                        <option value="segundo">2º Contato (Disponibilidade e agenda)</option>
                        <option value="sem_resposta">Cliente sem retorno (Reconectar com simpatia)</option>
                        <option value="proximo_vencimento">Vencimento próximo (Garantir condições)</option>
                        <option value="pedido_desconto">Pedido de desconto (Negociação ética)</option>
                        <option value="interesse">Interesse demonstrado (Avançar para início)</option>
                        <option value="recusa">Cliente recusou (Manter porta aberta)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Dias desde a proposta:
                      </label>
                      <select
                        value={diasFollowUp}
                        onChange={(e) => setDiasFollowUp(Number(e.target.value))}
                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                      >
                        <option value={1}>1 dia (Lembrete rápido)</option>
                        <option value={2}>2 dias (Recomendado)</option>
                        <option value={4}>4 dias (Recuperação)</option>
                        <option value={7}>7 dias (Última chance)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleGenerateFollowUp}
                      disabled={loading}
                      className="mt-5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{loading ? 'Criando...' : 'Gerar Mensagem de Follow-up'}</span>
                    </button>

                    <button
                      onClick={handleDispararWhatsAppAutomatico}
                      disabled={followUpDispatching}
                      className="mt-5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 cursor-pointer ml-auto"
                    >
                      <Send className="w-4 h-4" />
                      <span>{followUpDispatching ? 'Enviando...' : 'Enviar via WhatsApp'}</span>
                    </button>
                  </div>

                  {lastFallbackUrl && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                      <span className="text-emerald-800 dark:text-emerald-300">
                        Link de contingência pronto para WhatsApp Web/App:
                      </span>
                      <a
                        href={lastFallbackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                      >
                        <span>Abrir WhatsApp</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ANÁLISE DE PREÇOS NO HISTÓRICO */}
              {activeTab === 'precificacao' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-300">
                    <p className="font-semibold mb-1">Precificação Inteligente Baseada nos Seus Dados Reais</p>
                    <p className="leading-relaxed">
                      O Gemini consulta o histórico de orçamentos anteriores aprovados e pendentes da sua conta no Supabase,
                      calculando suas médias reais de mercado para você nunca cobrar abaixo nem perder serviço por preço fora da curva.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Serviço ou Item a Analisar:
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Instalação Elétrica, Pintura, Consultoria..."
                        value={servicoAnalise}
                        onChange={(e) => setServicoAnalise(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <button
                      onClick={handleAnalisarPrecos}
                      disabled={loading}
                      className="mt-5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                    >
                      <TrendingUp className="w-4 h-4" />
                      <span>{loading ? 'Analisando...' : 'Analisar Histórico de Preços'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Generated Text Box */}
              {generatedText && (
                <div className="mt-6 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Resultado Gerado pela IA:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      <button
                        onClick={() => handleSendWhatsAppManual(generatedText)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar no WhatsApp</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      rows={6}
                      value={generatedText}
                      onChange={(e) => setGeneratedText(e.target.value)}
                      className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-100 font-sans leading-relaxed focus:ring-2 focus:ring-emerald-500 outline-none resize-y shadow-xs"
                      placeholder="Texto gerado pela IA..."
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 italic">
                      Dica: você pode editar livremente o texto acima para personalizar antes de copiar ou enviar no WhatsApp.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </>
        )}

      </div>
    </div>
  );
};
