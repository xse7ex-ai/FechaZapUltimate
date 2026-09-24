import React, { useState } from 'react';
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
} from 'lucide-react';
import { ConfiguracaoEmpresa } from '../types';
import { testarConexaoGemini, GeminiStatusResult } from '../utils/ai';
import { useTheme } from '../context/ThemeContext';

interface ModalConfiguracoesProps {
  isOpen: boolean;
  onClose: () => void;
  empresa: ConfiguracaoEmpresa;
  onSave: (config: ConfiguracaoEmpresa) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  onOpenTutorial?: () => void;
}

export const ModalConfiguracoes: React.FC<ModalConfiguracoesProps> = ({
  isOpen,
  onClose,
  empresa,
  onSave,
  onShowToast,
  onOpenTutorial,
}) => {
  const [formData, setFormData] = useState<ConfiguracaoEmpresa>({ ...empresa });
  const [testingAi, setTestingAi] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<GeminiStatusResult | null>(null);
  const { theme, setTheme, isDark } = useTheme();

  if (!isOpen) return null;

  const handleChange = (field: keyof ConfiguracaoEmpresa, value: any) => {
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
              <h3 className="font-bold text-lg">Configurações do FechaZap</h3>
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
              O FechaZap está integrado diretamente à API do <strong>Google Gemini</strong> usando o modelo <code>gemini-3.8-flash</code> com fallback automático e contingência resiliente.
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
                  <strong>Segurança Máxima:</strong> A chave da Gemini é protegida no servidor/Cloudflare Worker (<code>process.env.GEMINI_API_KEY</code>). O navegador jamais armazena ou manipula credenciais confidenciais.
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
              Chave PIX para Fechamento Rápido
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tipo de Chave
                </label>
                <select
                  value={formData.tipoChavePix}
                  onChange={(e) => handleChange('tipoChavePix', e.target.value)}
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
                <span className="font-bold text-xs text-emerald-950 dark:text-emerald-300 block">Guia & Tutorial FechaZap</span>
                <span className="text-[11px] text-emerald-800 dark:text-slate-400">Revise o passo a passo completo de como vender mais pelo WhatsApp.</span>
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

