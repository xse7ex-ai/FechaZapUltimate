import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Key,
  ShieldCheck,
  HelpCircle,
  Sun,
  Moon,
  Palette,
  MessageSquare,
  Eye,
  EyeOff,
  Info,
  User,
  Smartphone,
  Unlink,
  Link2,
  ExternalLink,
  Mail,
  LifeBuoy,
} from 'lucide-react';
import { ConfiguracaoEmpresa, WhatsAppConnection } from '../types';
import { testarConexaoGemini, GeminiStatusResult } from '../utils/ai';
import { useTheme } from '../context/ThemeContext';
import {
  fetchWhatsAppConnection,
  saveWhatsAppConnection,
  disconnectWhatsAppConnection,
} from '../utils/supabase';

interface ModalConfiguracoesProps {
  isOpen: boolean;
  onClose: () => void;
  empresa: ConfiguracaoEmpresa;
  onSave: (config: ConfiguracaoEmpresa) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenTutorial?: () => void;
  onOpenPerfil?: () => void;
  userPlano?: string;
}

export const ModalConfiguracoes: React.FC<ModalConfiguracoesProps> = ({
  isOpen,
  onClose,
  empresa,
  onSave,
  onShowToast,
  onOpenTutorial,
  onOpenPerfil,
  userPlano = 'GRATUITO',
}) => {
  const [formData, setFormData] = useState<ConfiguracaoEmpresa>({ ...empresa });
  const [testingAi, setTestingAi] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<GeminiStatusResult | null>(null);
  const { theme, setTheme, isDark } = useTheme();

  // Estados de Conexão WhatsApp Multi-Tenant (Fase 5)
  const [waConn, setWaConn] = useState<WhatsAppConnection | null>(null);
  const [loadingConn, setLoadingConn] = useState<boolean>(false);
  const [savingConn, setSavingConn] = useState<boolean>(false);
  const [phoneIdInput, setPhoneIdInput] = useState<string>('');
  const [wabaIdInput, setWabaIdInput] = useState<string>('');
  const [displayPhoneInput, setDisplayPhoneInput] = useState<string>('');
  const [showConnForm, setShowConnForm] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setLoadingConn(true);
      fetchWhatsAppConnection()
        .then((conn) => {
          setWaConn(conn);
          if (conn) {
            setPhoneIdInput(conn.phoneNumberId || '');
            setWabaIdInput(conn.wabaId || '');
            setDisplayPhoneInput(conn.displayPhoneNumber || '');
          }
        })
        .finally(() => setLoadingConn(false));
    }
  }, [isOpen]);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneIdInput.trim()) {
      onShowToast('Campo obrigatório', 'Informe o Phone Number ID da Meta.', 'error');
      return;
    }
    setSavingConn(true);
    try {
      const res = await saveWhatsAppConnection({
        phoneNumberId: phoneIdInput.trim(),
        wabaId: wabaIdInput.trim() || undefined,
        displayPhoneNumber: displayPhoneInput.trim() || undefined,
      });
      if (res.success) {
        onShowToast('Conexão Salva!', 'Número comercial conectado com sucesso.', 'success');
        const updated = await fetchWhatsAppConnection();
        setWaConn(updated);
        setShowConnForm(false);
      } else {
        onShowToast('Erro ao salvar conexão', res.error, 'error');
      }
    } finally {
      setSavingConn(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar seu número comercial do WhatsApp? O envio automático será desativado.')) {
      return;
    }
    setSavingConn(true);
    try {
      const res = await disconnectWhatsAppConnection();
      if (res.success) {
        onShowToast('WhatsApp Desconectado', 'O envio de mensagens foi desativado.', 'info');
        setWaConn(null);
        setPhoneIdInput('');
        setWabaIdInput('');
        setDisplayPhoneInput('');
      } else {
        onShowToast('Erro ao desconectar', res.error, 'error');
      }
    } finally {
      setSavingConn(false);
    }
  };

  if (!isOpen) return null;

  const handleChange = <K extends keyof ConfiguracaoEmpresa>(field: K, value: ConfiguracaoEmpresa[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestGemini = async () => {
    setTestingAi(true);
    setTestResult(null);
    try {
      const res = await testarConexaoGemini();
      setTestResult(res);
      if (res.configured) {
        onShowToast('Gemini API Conectada!', `Modelo ${res.model} respondendo com sucesso.`, 'success');
      } else {
        onShowToast('Gemini API Offline', res.error || 'Verifique as configurações.', 'error');
      }
    } catch (err: any) {
      setTestResult({
        configured: false,
        model: 'gemini-3.8-flash',
        error: err?.message || 'Falha de comunicação',
      });
      onShowToast('Falha no teste', err?.message, 'error');
    } finally {
      setTestingAi(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onShowToast('Configurações salvas!', 'Seus dados foram atualizados com sucesso.', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Configurações do CLOSI</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dados da empresa, aparência/tema e motor de IA Google Gemini.
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

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* SEÇÃO TEMA E APARÊNCIA */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Aparência & Tema (Dark Mode)
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {isDark ? '🌙 Modo Escuro Ativo' : '☀️ Modo Claro Ativo'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Alterne a interface visual entre o tema claro e o tema escuro de alto contraste para maior conforto aos seus olhos.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTheme('light');
                  onShowToast('☀️ Modo Claro ativado', undefined, 'info');
                }}
                className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                  !isDark
                    ? 'bg-white text-slate-900 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'bg-slate-100/60 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${!isDark ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                  <Sun className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-xs">Modo Claro</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Branco & clean</div>
                </div>
                {!isDark && <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTheme('dark');
                  onShowToast('🌙 Modo Escuro ativado', undefined, 'info');
                }}
                className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 text-white border-emerald-500 ring-2 ring-emerald-500/30 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60' : 'bg-slate-100 text-slate-600'}`}>
                  <Moon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-xs">Modo Escuro</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Descanso visual</div>
                </div>
                {isDark && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
              </button>
            </div>
          </div>

          {/* SEÇÃO IA GEMINI */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/30 dark:to-slate-850 dark:to-slate-800/80 border border-emerald-200 dark:border-emerald-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 dark:text-emerald-300">
                  Inteligência Artificial (Google Gemini API)
                </span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                Google GenAI SDK v2.4
              </span>
            </div>

            <p className="text-xs text-emerald-900 dark:text-slate-300 leading-relaxed">
              O CLOSI está integrado diretamente à API do <strong>Google Gemini</strong> usando o modelo <code>gemini-3.8-flash</code> com fallback automático e contingência resiliente.
            </p>

            <div className="bg-white dark:bg-slate-900/90 p-3 rounded-lg border border-emerald-200/80 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Modelo Ativo:</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">gemini-3.8-flash</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Provedor:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">Google Gen AI</span>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-850 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-950 dark:text-emerald-200 leading-relaxed">
                  <strong>Segurança Máxima:</strong> A chave da Gemini é protegida no servidor/Supabase Edge Functions (<code>GEMINI_API_KEY</code>). O navegador jamais armazena ou manipula credenciais confidenciais.
                </p>
              </div>

              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={testingAi}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-60 transition-colors"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${testingAi ? 'animate-spin' : ''}`} />
                  <span>{testingAi ? 'Testando Conexão...' : 'Testar Conexão Gemini'}</span>
                </button>

                {testResult && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      testResult.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {testResult.configured ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        API Conectada!
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        {testResult.error || 'Erro'}
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SEÇÃO INTEGRAÇÃO WHATSAPP CLOUD API MULTI-TENANT (FASE 5) */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/70 via-slate-50 to-teal-50/50 dark:from-slate-900 dark:via-slate-850 dark:to-emerald-950/30 border border-emerald-300/80 dark:border-emerald-500/30 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-emerald-300">
                    WhatsApp Cloud API Multi-Tenant
                  </span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    Roteamento seguro por Phone Number ID (Meta Graph API)
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                waConn?.status === 'active'
                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  : waConn?.status === 'revoked'
                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
              }`}>
                {loadingConn
                  ? 'Verificando...'
                  : waConn?.status === 'active'
                  ? '🟢 Conexão Ativa'
                  : waConn?.status === 'revoked'
                  ? '🔴 Conexão Revogada'
                  : '⚪ Desconectado'}
              </span>
            </div>

            {/* Status e Detalhes da Conexão */}
            {waConn && waConn.status === 'active' ? (
              <div className="bg-white dark:bg-slate-900/90 p-3 rounded-lg border border-emerald-200/80 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Número Comercial:</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {waConn.displayPhoneNumber || 'Número Oficial Meta'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Phone Number ID:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {waConn.phoneNumberId}
                  </span>
                </div>
                {waConn.wabaId && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600 dark:text-slate-400">WABA ID:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {waConn.wabaId}
                    </span>
                  </div>
                )}
                <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowConnForm(!showConnForm)}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {showConnForm ? 'Fechar Edição' : 'Editar Identificadores'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={savingConn}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 cursor-pointer disabled:opacity-50"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Desconectar</span>
                  </button>
                </div>
              </div>
            ) : waConn && waConn.status === 'revoked' ? (
              <div className="p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-rose-900 dark:text-rose-200">
                    <strong>Atenção:</strong> Sua conexão anterior foi revogada ou expirou na Meta. Por favor, reconfigure seus identificadores para restabelecer os envios de mensagens.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConnForm(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                >
                  Reconectar Número
                </button>
              </div>
            ) : (
              <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  Conecte seu <strong>Phone Number ID</strong> da Meta para habilitar recebimento em tempo real e follow-up oficial via Cloud API.
                </p>
                {!showConnForm && (
                  <button
                    type="button"
                    onClick={() => setShowConnForm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Conectar Número Comercial</span>
                  </button>
                )}
              </div>
            )}

            {/* Formulário de Configuração de Tenant */}
            {showConnForm && (
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Configurar Identificadores Meta Cloud API
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                      Phone Number ID *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 104592039281723"
                      value={phoneIdInput}
                      onChange={(e) => setPhoneIdInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                      Número de Exibição
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: +55 (11) 98765-4321"
                      value={displayPhoneInput}
                      onChange={(e) => setDisplayPhoneInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    WhatsApp Business Account ID (WABA ID - Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 928374610293847"
                    value={wabaIdInput}
                    onChange={(e) => setWabaIdInput(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Link de Apoio: Criar Conta Meta Business */}
                <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium text-blue-950 dark:text-blue-200">
                    <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Ainda não tem uma conta comercial da Meta?</span>
                    <a
                      href="https://business.facebook.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2"
                    >
                      Criar conta
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Depois de criar sua conta no gerenciador da Meta, volte aqui e preencha os campos acima com as informações geradas lá.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowConnForm(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConnection}
                    disabled={savingConn}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                  >
                    {savingConn ? 'Salvando...' : 'Salvar Conexão'}
                  </button>
                </div>
              </div>
            )}

            {/* Aviso de Arquitetura e Segurança */}
            <div className="p-2.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-850 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-emerald-950 dark:text-emerald-200 leading-relaxed">
                <strong>Segurança & Isolamento (RLS):</strong> Roteamento estrito por <code>phone_number_id</code>. Tokens da Meta nunca são expostos ao navegador. Fallback universal via link direto (<code>wa.me</code>) disponível para todos os orçamentos e mensagens manuais.
              </div>
            </div>
          </div>

          {/* DADOS DA EMPRESA */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Dados Cadastrais da Empresa / Prestador
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nome Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nomeFantasia}
                  onChange={(e) => handleChange('nomeFantasia', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Razão Social (opcional)
                </label>
                <input
                  type="text"
                  value={formData.razaoSocial}
                  onChange={(e) => handleChange('razaoSocial', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  CNPJ ou CPF
                </label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => handleChange('cnpj', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  WhatsApp de Contato *
                </label>
                <input
                  type="text"
                  required
                  value={formData.telefone}
                  onChange={(e) => handleChange('telefone', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  E-mail Comercial
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Cidade / UF
                </label>
                <input
                  type="text"
                  value={formData.cidadeEstado}
                  onChange={(e) => handleChange('cidadeEstado', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* DADOS PIX */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Chave PIX para Propostas e Pagamentos
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tipo de Chave
                </label>
                <select
                  value={formData.tipoChavePix}
                  onChange={(e) => handleChange('tipoChavePix', e.target.value as ConfiguracaoEmpresa['tipoChavePix'])}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="cnpj">CNPJ</option>
                  <option value="cpf">CPF</option>
                  <option value="telefone">Telefone</option>
                  <option value="email">E-mail</option>
                  <option value="aleatoria">Chave Aleatória</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Chave PIX
                </label>
                <input
                  type="text"
                  placeholder="Ex: 38192847000192 ou chave@email.com"
                  value={formData.chavePix}
                  onChange={(e) => handleChange('chavePix', e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Reabrir Tutorial / Guia */}
          {onOpenTutorial && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-emerald-950 dark:text-emerald-300 block">Guia & Tutorial CLOSI</span>
                <span className="text-[11px] text-emerald-800 dark:text-slate-400">Revise o passo a passo completo de atendimento e propostas pelo WhatsApp.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTutorial();
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Abrir Tutorial</span>
              </button>
            </div>
          )}

          {/* SEÇÃO INFORMAÇÕES DO APLICATIVO / SOBRE */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Sobre o Aplicativo
                </span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                v3.1.6
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-850 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Versão:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">3.1.6</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-850 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Plano Atual:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{userPlano}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-850 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Motor de IA:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Google Gemini 3.8 Flash</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-850 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Arquitetura:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Supabase Edge Functions + PostgreSQL</span>
              </div>
            </div>

            {onOpenPerfil && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPerfil();
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Gerenciar Conta, Planos & Cotas de IA</span>
                </button>
              </div>
            )}
          </div>

          {/* Suporte & Atendimento Fecha CRM */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LifeBuoy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Suporte & Atendimento
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50 dark:border-emerald-700/50">
                Canal Oficial
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Dúvidas, sugestões ou problemas técnicos? Nossa equipe de suporte está à disposição para ajudar.
            </p>

            <a
              href="mailto:fechazap.suporte@gmail.com"
              className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 hover:border-emerald-400 dark:hover:border-emerald-600 text-slate-800 dark:text-slate-100 shadow-xs hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
                  <Mail className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </div>
                <div className="truncate">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">E-mail de Suporte</p>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">fechazap.suporte@gmail.com</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 shrink-0 ml-2" />
            </a>
          </div>

          {/* Links: Termos de Uso e Política de Privacidade */}
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
            <a
              href="/termos.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors hover:underline"
            >
              <span>Termos de Uso</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a
              href="/privacidade.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors hover:underline"
            >
              <span>Política de Privacidade</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 transition-all active:scale-95"
            >
              Salvar Alterações
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

