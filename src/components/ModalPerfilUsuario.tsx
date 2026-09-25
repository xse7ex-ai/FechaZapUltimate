import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  ShieldCheck,
  Zap,
  Sparkles,
  Lock,
  Mail,
  CheckCircle2,
  Crown,
  LogOut,
  Database,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { UserProfile, UserQuota } from '../types';
import {
  fetchServerUserProfileAndQuota,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  isSupabaseConfigured,
} from '../utils/supabase';

interface ModalPerfilUsuarioProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  onPlanChanged?: () => void;
}

export const ModalPerfilUsuario: React.FC<ModalPerfilUsuarioProps> = ({
  isOpen,
  onClose,
  onShowToast,
  onPlanChanged,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Auth form
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [nome, setNome] = useState<string>('');

  const loadData = async () => {
    try {
      const data = await fetchServerUserProfileAndQuota();
      setProfile(data.user);
      setQuota(data.quota);
      setIsAuthenticated(data.authenticated);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      if (isRegisterMode) {
        const res = await registerWithEmail(email, password, nome);
        if (res.success) {
          onShowToast('Conta criada com sucesso!', 'Você agora está conectado via Supabase Auth.', 'success');
          await loadData();
          onPlanChanged?.();
        } else {
          onShowToast('Erro no cadastro', res.error || 'Não foi possível cadastrar.', 'error');
        }
      } else {
        const res = await loginWithEmail(email, password);
        if (res.success) {
          onShowToast('Login realizado!', 'Sessão iniciada com sucesso.', 'success');
          await loadData();
          onPlanChanged?.();
        } else {
          onShowToast('Falha no login', res.error || 'Verifique suas credenciais.', 'error');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    onShowToast('Sessão encerrada', 'Você está utilizando o FechaZap em modo local.', 'info');
    await loadData();
    onPlanChanged?.();
  };

  const currentPlano = profile?.plano || 'GRATUITO';
  const used = quota?.used || 0;
  const limit = quota?.limit || 10;
  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span>Minha Conta & Plano</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                  currentPlano === 'TURBO'
                    ? 'bg-amber-400 text-slate-950'
                    : currentPlano === 'PRO'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  {currentPlano}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Gerencie sua conta, plano e limite de uso.
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Card de Cota de IA */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-emerald-50/30 dark:from-slate-800/80 dark:to-slate-850 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Uso Mensal de Inteligência Artificial
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                {used} / {limit} gerações
              </span>
            </div>

            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Renovação automática mensal no banco</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {Math.max(0, limit - used)} restantes
              </span>
            </div>
          </div>

          {/* Autenticação Supabase */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Supabase Auth & Sincronização
                </span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isAuthenticated
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                {isAuthenticated ? 'Conectado (JWT Ativo)' : 'Modo Convidado Local'}
              </span>
            </div>

            {isAuthenticated ? (
              <div className="space-y-3">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {profile?.nome || 'Usuário Autenticado'}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {profile?.email}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Seus dados comerciais e orçamentos estão sincronizados com segurança no Supabase com Row Level Security.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Faça login para salvar seus orçamentos no banco de dados Supabase e acessar os dados reais no Copiloto IA.
                </p>

                {isRegisterMode && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Seu Nome
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Carlos Silva"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Senha
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRegisterMode(!isRegisterMode)}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {isRegisterMode ? 'Já tenho uma conta? Fazer login' : 'Não tem conta? Criar agora'}
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-60"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{loading ? 'Aguarde...' : isRegisterMode ? 'Cadastrar' : 'Entrar'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Comparativo de Planos */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Planos Disponíveis no FechaZap
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* GRATUITO */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                currentPlano === 'GRATUITO'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30 dark:bg-slate-800/90'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}>
                 <div>
                   <div className="font-bold text-xs">GRATUITO</div>
                   <div className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">R$ 0</div>
                   <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5 mt-3">
                     <li className="flex items-center gap-1.5">
                       <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                       <span>5 orçamentos / mês</span>
                     </li>
                     <li className="flex items-center gap-1.5">
                       <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                       <span>PDF e WhatsApp</span>
                     </li>
                     <li className="flex items-center gap-1.5">
                       <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                       <span>Dados salvos no seu celular</span>
                     </li>
                   </ul>
                 </div>
                {currentPlano === 'GRATUITO' && (
                  <span className="mt-3 text-[10px] font-bold text-emerald-600 text-center py-1 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
                    Plano Atual
                  </span>
                )}
              </div>

              {/* PRO */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                currentPlano === 'PRO'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30 dark:bg-slate-800/90'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}>
                <div>
                  <div className="font-bold text-xs text-emerald-600 dark:text-emerald-400">PRO</div>
                  <div className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">R$ 49<span className="text-xs font-normal text-slate-400">/mês</span></div>
                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5 mt-3">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span><strong>250 IA</strong> / mês</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>Sincronização Segura na Nuvem</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>Processamento de Alta Velocidade</span>
                    </li>
                  </ul>
                </div>
                {currentPlano === 'PRO' && (
                  <span className="mt-3 text-[10px] font-bold text-emerald-600 text-center py-1 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
                    Plano Atual
                  </span>
                )}
              </div>

              {/* TURBO */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                currentPlano === 'TURBO'
                  ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30 dark:bg-slate-800/90'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}>
                <div>
                  <div className="font-bold text-xs text-amber-500">TURBO</div>
                  <div className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">R$ 97<span className="text-xs font-normal text-slate-400">/mês</span></div>
                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1.5 mt-3">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span><strong>1500 IA</strong> / mês</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>Automação Total de WhatsApp</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>Multi-dispositivos</span>
                    </li>
                  </ul>
                </div>
                {currentPlano === 'TURBO' && (
                  <span className="mt-3 text-[10px] font-bold text-amber-600 text-center py-1 bg-amber-100 dark:bg-amber-950 rounded-lg">
                    Plano Atual
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
