import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Copy,
  Check,
  Flame,
  Zap,
  Clock,
  ShieldCheck,
  Award,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Bot,
  User,
  ArrowRight,
} from 'lucide-react';
import { Orcamento, ConfiguracaoEmpresa, GatilhoIA } from '../types';
import { GATILHOS_IA } from '../data/initialData';
import {
  gerarFechamentoGemini,
  contornarObjecaoGemini,
  gerarFollowUpGemini,
  chatComGemini,
} from '../utils/ai';
import { openWhatsAppMessage } from '../utils/whatsapp';
import { formatCurrency } from '../utils/format';

interface ModalIAProps {
  isOpen: boolean;
  onClose: () => void;
  orcamentos: Orcamento[];
  selectedOrcamentoId?: string;
  empresa: ConfiguracaoEmpresa;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

type TabIA = 'gatilhos' | 'objecoes' | 'followup' | 'chat';

const OBJECOES_COMUNS = [
  'Achei o valor um pouco caro, consegue dar desconto?',
  'Vou ver com meu sócio / minha esposa e te aviso.',
  'Achei outro profissional que cobra metade do preço.',
  'Gostei muito da proposta, mas só consigo fazer no mês que vem.',
  'Estou sem orçamento disponível neste momento.',
];

export const ModalIA: React.FC<ModalIAProps> = ({
  isOpen,
  onClose,
  orcamentos,
  selectedOrcamentoId,
  empresa,
  onShowToast,
}) => {
  const [currentOrcamentoId, setCurrentOrcamentoId] = useState<string>(
    selectedOrcamentoId || orcamentos[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<TabIA>('gatilhos');

  // Trigger State
  const [selectedGatilho, setSelectedGatilho] = useState<string>(GATILHOS_IA[0].id);
  const [tomVoz, setTomVoz] = useState<string>('Profissional e caloroso');

  // Objection State
  const [selectedObjecao, setSelectedObjecao] = useState<string>(OBJECOES_COMUNS[0]);
  const [customObjecao, setCustomObjecao] = useState<string>('');

  // Follow-up State
  const [diasFollowUp, setDiasFollowUp] = useState<number>(2);

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([
    {
      role: 'model',
      text: 'Olá! Sou o consultor de fechamento do FechaZap com Google Gemini. Como posso te ajudar a converter este orçamento em venda?',
    },
  ]);
  const [inputChat, setInputChat] = useState<string>('');

  // Output & Loading
  const [generatedText, setGeneratedText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentOrcamento = orcamentos.find((o) => o.id === currentOrcamentoId) || orcamentos[0];

  const handleGenerateFechamento = async () => {
    if (!currentOrcamento) {
      onShowToast('Nenhum orçamento selecionado', 'Selecione um orçamento para gerar a copy.', 'error');
      return;
    }

    setLoading(true);
    try {
      const gatilhoObj = GATILHOS_IA.find((g) => g.id === selectedGatilho);
      const text = await gerarFechamentoGemini(
        currentOrcamento,
        `${gatilhoObj?.titulo || ''} - ${gatilhoObj?.descricao || ''}`,
        tomVoz,
        empresa,
        empresa.geminiKeyCustom
      );
      setGeneratedText(text);
      onShowToast('Copy gerada pelo Gemini!', 'Mensagem pronta para WhatsApp.', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Erro na API Gemini', err?.message || 'Verifique sua conexão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleContornarObjecao = async () => {
    if (!currentOrcamento) return;
    setLoading(true);
    try {
      const objecaoFinal = customObjecao.trim() || selectedObjecao;
      const text = await contornarObjecaoGemini(
        currentOrcamento,
        objecaoFinal,
        'Negociação pelo WhatsApp',
        empresa,
        empresa.geminiKeyCustom
      );
      setGeneratedText(text);
      onShowToast('Solução de objeção gerada!', 'Respostas persuasivas com Gemini.', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Erro na API Gemini', err?.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFollowUp = async () => {
    if (!currentOrcamento) return;
    setLoading(true);
    try {
      const text = await gerarFollowUpGemini(
        currentOrcamento,
        diasFollowUp,
        empresa,
        empresa.geminiKeyCustom
      );
      setGeneratedText(text);
      onShowToast('Follow-up criado com Gemini!', 'Mensagem amigável de acompanhamento.', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Erro no follow-up', err?.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!inputChat.trim() || loading) return;
    const userMsg = inputChat.trim();
    setInputChat('');
    const newHistory = [...chatMessages, { role: 'user' as const, text: userMsg }];
    setChatMessages(newHistory);
    setLoading(true);

    try {
      const reply = await chatComGemini(
        userMsg,
        currentOrcamento
          ? {
              cliente: currentOrcamento.clienteNome,
              valorTotal: currentOrcamento.valorTotal,
              itens: currentOrcamento.itens,
              status: currentOrcamento.status,
            }
          : null,
        newHistory,
        empresa.geminiKeyCustom
      );
      setChatMessages([...newHistory, { role: 'model', text: reply }]);
    } catch (err: any) {
      setChatMessages([
        ...newHistory,
        {
          role: 'model',
          text: `⚠️ Desculpe, tive um problema ao conectar com a API Gemini: ${err?.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    onShowToast('Copiado!', 'Mensagem copiada para a área de transferência.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToWhatsApp = (text: string) => {
    if (!currentOrcamento?.clienteTelefone) {
      onShowToast('Telefone ausente', 'O cliente não possui telefone cadastrado.', 'error');
      return;
    }
    openWhatsAppMessage(currentOrcamento.clienteTelefone, text);
    onShowToast('WhatsApp aberto!', `Enviando para ${currentOrcamento.clienteNome}.`, 'info');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header with Gemini Branding */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">FechaZap IA</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Google Gemini 3.8 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Migrado de Claude para Gemini API • Fechamento persuasivo para WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quote Context Selector */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="font-semibold text-slate-700">Orçamento Contexto:</span>
            <select
              value={currentOrcamentoId}
              onChange={(e) => setCurrentOrcamentoId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 outline-none flex-1 max-w-sm"
            >
              {orcamentos.map((orc) => (
                <option key={orc.id} value={orc.id}>
                  #{orc.numero} - {orc.clienteNome} ({formatCurrency(orc.valorTotal)})
                </option>
              ))}
            </select>
          </div>

          {currentOrcamento && (
            <div className="flex items-center gap-3 text-slate-600">
              <span>
                Status:{' '}
                <strong className="capitalize text-emerald-700">
                  {currentOrcamento.status}
                </strong>
              </span>
              <span>
                WhatsApp:{' '}
                <strong>{currentOrcamento.clienteTelefone || 'Não informado'}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-4 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('gatilhos')}
            className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'gatilhos'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-500" />
            Gatilhos de Fechamento
          </button>
          <button
            onClick={() => setActiveTab('objecoes')}
            className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'objecoes'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            Quebrar Objeções
          </button>
          <button
            onClick={() => setActiveTab('followup')}
            className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'followup'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4 text-purple-500" />
            Follow-up Amigável
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'chat'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-600" />
            Chat com Gemini
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          
          {/* TAB 1: GATILHOS */}
          {activeTab === 'gatilhos' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Selecione o Gatilho Mental para Fechar a Venda:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {GATILHOS_IA.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGatilho(g.id)}
                      className={`text-left p-3 rounded-xl border text-xs transition-all ${
                        selectedGatilho === g.id
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-slate-900 mb-1">{g.titulo}</div>
                      <p className="text-slate-500 text-[11px] leading-relaxed">{g.descricao}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tom de Voz da Mensagem:
                  </label>
                  <select
                    value={tomVoz}
                    onChange={(e) => setTomVoz(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Profissional e caloroso">Profissional, caloroso e seguro</option>
                    <option value="Direto e objetivo">Direto ao ponto, focado em agilidade</option>
                    <option value="Urgente e decidido">Urgência com elegância (vagas esgotando)</option>
                    <option value="Amigável e consultivo">Amigo consultor, focado em ajudar</option>
                  </select>
                </div>

                <div className="pt-5">
                  <button
                    onClick={handleGenerateFechamento}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/30 disabled:opacity-60 transition-all active:scale-95"
                  >
                    <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>{loading ? 'Gerando com Gemini 3.8...' : 'Gerar Mensagem de Fechamento'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OBJEÇÕES */}
          {activeTab === 'objecoes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Qual objeção o cliente apresentou?
                </label>
                <div className="space-y-2">
                  {OBJECOES_COMUNS.map((obj, i) => (
                    <label
                      key={i}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        selectedObjecao === obj && !customObjecao
                          ? 'border-emerald-500 bg-emerald-50/70 font-medium'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="objecao"
                        checked={selectedObjecao === obj && !customObjecao}
                        onChange={() => {
                          setSelectedObjecao(obj);
                          setCustomObjecao('');
                        }}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-800 leading-snug">{obj}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ou digite a mensagem exata que o cliente mandou:
                </label>
                <input
                  type="text"
                  placeholder="Ex: 'O concorrente X me fez por R$ 500 a menos com as mesmas peças...'"
                  value={customObjecao}
                  onChange={(e) => setCustomObjecao(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleContornarObjecao}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/30 disabled:opacity-60 transition-all active:scale-95"
                >
                  <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Consultando Gemini 3.8...' : 'Contornar Objeção com Gemini'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: FOLLOW-UP */}
          {activeTab === 'followup' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Mais de 60% das vendas no WhatsApp fecham no <strong>follow-up</strong>, e não no primeiro contato. O Gemini gera uma abordagem leve que não parece cobrança chata.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Há quanto tempo o orçamento foi enviado?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { dias: 1, label: '24 horas', desc: 'Lembrança rápida do início da semana' },
                    { dias: 2, label: '2 a 3 dias', desc: 'Acompanhamento padrão suave' },
                    { dias: 5, label: '5 dias', desc: 'Aviso sobre agenda e disponibilidade' },
                    { dias: 10, label: '10+ dias', desc: 'Tentativa de reaquecer o contato' },
                  ].map((item) => (
                    <button
                      key={item.dias}
                      onClick={() => setDiasFollowUp(item.dias)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        diasFollowUp === item.dias
                          ? 'border-emerald-500 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">{item.label}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleGenerateFollowUp}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/30 disabled:opacity-60 transition-all active:scale-95"
                >
                  <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Escrevendo Follow-up...' : 'Criar Mensagem de Follow-up'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CHAT LIVRE COM GEMINI */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-[400px] border border-slate-200 rounded-xl bg-white overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/30">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.role === 'model' && (
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 text-xs shadow-sm mt-0.5">
                        ⚡
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-tr-none'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 text-xs shadow-sm mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 italic p-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span>Gemini 3.8 está digitando sugestão de venda...</span>
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Pergunte ao Gemini: 'Como fechar esse cliente sem dar mais desconto?'..."
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                  className="flex-1 bg-slate-100 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  onClick={handleSendChatMessage}
                  disabled={loading || !inputChat.trim()}
                  className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* GENERATED TEXT AREA (FOR GATILHOS, OBJEÇÕES, FOLLOW-UP) */}
          {activeTab !== 'chat' && generatedText && (
            <div className="mt-6 pt-5 border-t border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Mensagem Pronta para WhatsApp (Editável):</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyText(generatedText)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg transition-colors shadow-sm"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleSendToWhatsApp(generatedText)}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-lg shadow-sm transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar no WhatsApp</span>
                  </button>
                </div>
              </div>

              <textarea
                value={generatedText}
                onChange={(e) => setGeneratedText(e.target.value)}
                rows={6}
                className="w-full bg-white border border-slate-300 rounded-xl p-3.5 text-xs text-slate-800 font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 shadow-inner"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                *Dica: Você pode editar o texto acima antes de copiar ou enviar no WhatsApp. Os asteriscos (*texto*) viram negrito no WhatsApp.*
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="bg-slate-100 border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Modelo: <strong>gemini-3.8-flash</strong> (Google Gen AI)</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-semibold"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
