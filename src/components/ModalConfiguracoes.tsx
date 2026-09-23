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
} from 'lucide-react';
import { ConfiguracaoEmpresa } from '../types';
import { testarConexaoGemini, GeminiStatusResult } from '../utils/ai';

interface ModalConfiguracoesProps {
  isOpen: boolean;
  onClose: () => void;
  empresa: ConfiguracaoEmpresa;
  onSave: (config: ConfiguracaoEmpresa) => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
}

export const ModalConfiguracoes: React.FC<ModalConfiguracoesProps> = ({
  isOpen,
  onClose,
  empresa,
  onSave,
  onShowToast,
}) => {
  const [formData, setFormData] = useState<ConfiguracaoEmpresa>({ ...empresa });
  const [testingAi, setTestingAi] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<GeminiStatusResult | null>(null);

  if (!isOpen) return null;

  const handleChange = (field: keyof ConfiguracaoEmpresa, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestGemini = async () => {
    setTestingAi(true);
    setTestResult(null);
    try {
      const res = await testarConexaoGemini(formData.geminiKeyCustom);
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
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Configurações do FechaZap</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dados da empresa, dados bancários/PIX e motor de Inteligência Artificial Google Gemini.
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
          
          {/* SEÇÃO IA GEMINI */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                  Inteligência Artificial (Google Gemini API)
                </span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                Migrado de Claude
              </span>
            </div>

            <p className="text-xs text-emerald-900 leading-relaxed">
              O FechaZap agora está integrado diretamente à API do <strong>Google Gemini</strong> usando o modelo <code>gemini-3.8-flash</code>. As chamadas são processadas de forma segura e veloz no servidor.
            </p>

            <div className="bg-white p-3 rounded-lg border border-emerald-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Modelo Ativo:</span>
                <span className="font-mono font-bold text-emerald-700">gemini-3.8-flash</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Provedor:</span>
                <span className="font-medium text-slate-700">Google Gen AI SDK v2.4</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Chave de API Gemini Personalizada (Opcional):
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="password"
                    placeholder="Deixe em branco para usar a chave padrão do ambiente AI Studio"
                    value={formData.geminiKeyCustom || ''}
                    onChange={(e) => handleChange('geminiKeyCustom', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Se você tiver sua própria chave do Google AI Studio, pode inseri-la aqui. Caso contrário, a chave do ambiente de execução é usada automaticamente.
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
                      testResult.configured ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {testResult.configured ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Dados Cadastrais da Empresa / Prestador
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nome Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nomeFantasia}
                  onChange={(e) => handleChange('nomeFantasia', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Razão Social (opcional)
                </label>
                <input
                  type="text"
                  value={formData.razaoSocial}
                  onChange={(e) => handleChange('razaoSocial', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  CNPJ ou CPF
                </label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => handleChange('cnpj', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  WhatsApp de Contato *
                </label>
                <input
                  type="text"
                  required
                  value={formData.telefone}
                  onChange={(e) => handleChange('telefone', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  E-mail Comercial
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cidade / UF
                </label>
                <input
                  type="text"
                  value={formData.cidadeEstado}
                  onChange={(e) => handleChange('cidadeEstado', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* DADOS PIX */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Chave PIX para Fechamento Rápido
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tipo de Chave
                </label>
                <select
                  value={formData.tipoChavePix}
                  onChange={(e) => handleChange('tipoChavePix', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="cnpj">CNPJ</option>
                  <option value="cpf">CPF</option>
                  <option value="telefone">Telefone</option>
                  <option value="email">E-mail</option>
                  <option value="aleatoria">Chave Aleatória</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Chave PIX
                </label>
                <input
                  type="text"
                  placeholder="Ex: 38192847000192 ou chave@email.com"
                  value={formData.chavePix}
                  onChange={(e) => handleChange('chavePix', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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
