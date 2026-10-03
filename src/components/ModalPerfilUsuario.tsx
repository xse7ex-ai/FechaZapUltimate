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
  Clock,
  TrendingUp,
  ShieldAlert,
  CreditCard,
  FileCheck,
  RotateCcw,
} from 'lucide-react';
import { UserProfile, UserQuota } from '../types';
import {
  fetchServerUserProfileAndQuota,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  isSupabaseConfigured,
  attemptClientSidePlanChange,
  createCheckoutSession,
  createPortalSession,
} from '../utils/supabase';

interface ModalPerfilUsuarioProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'error' | 'info') => void;
  onPlanChanged?: () => void;
  modoDemonstracao?: boolean;
  onToggleModoDemonstracao?: () => void;
  onRestaurarExemploOriginal?: () => void;
}

export const ModalPerfilUsuario: React.FC<ModalPerfilUsuarioProps> = ({
  isOpen,
  onClose,
  onShowToast,
  onPlanChanged,
  modoDemonstracao = false,
  onToggleModoDemonstracao,
  onRestaurarExemploOriginal,
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

  // Security test state
  const [testingSecurity, setTestingSecurity] = useState<boolean>(false);
  const [securityReport, setSecurityReport] = useState<{
    status: 'neutral' | 'blocked' | 'error';
    message: string;
  } | null>(null);

  // Stripe Checkout & Portal state
  const [startingCheckout, setStartingCheckout] = useState<'PRO' | 'TURBO' | null>(null);
  const [openingPortal, setOpeningPortal] = useState<boolean>(false);

  const handleStartCheckout = async (plano: 'PRO' | 'TURBO') => {
    if (!isAuthenticated) {
      onShowToast('Autenticação necessária', 'Crie uma conta ou faça login antes de assinar.', 'info');
      setIsRegisterMode(true);
      return;
    }

    setStartingCheckout(plano);
    try {
      const res = await createCheckoutSession(plano);
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        onShowToast('Falha ao iniciar checkout', res.error || 'Não foi possível gerar a sessão de pagamento.', 'error');
      }
    } catch (err: any) {
      onShowToast('Erro de conexão', err?.message || 'Falha ao comunicar com o servidor de pagamentos.', 'error');
    } finally {
      setStartingCheckout(null);
    }
  };

  const handleOpenPortal = async () => {
    if (!isAuthenticated) {
      onShowToast('Autenticação necessária', 'Faça login para gerenciar sua assinatura.', 'info');
      return;
    }

    setOpeningPortal(true);
    try {
      const res = await createPortalSession();
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        onShowToast('Portal indisponível', res.error || 'Não foi possível abrir o portal de assinaturas.', 'error');
      }
    } catch (err: any) {
      onShowToast('Erro de conexão', err?.message || 'Falha ao acessar o portal do Stripe.', 'error');
    } finally {
      setOpeningPortal(false);
    }
  };

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

  const handleTestSecurityAttempt = async () => {
    setTestingSecurity(true);
    setSecurityReport(null);
    try {
      const res = await attemptClientSidePlanChange('TURBO');
      if (!res.success) {
        setSecurityReport({
          status: 'blocked',
          message: res.error || 'Acesso negado: O banco de dados rejeitou a alteração de plano pelo cliente.',
        });
        onShowToast('Proteção Ativa!', 'O backend PostgreSQL impediu a alteração indevida de plano.', 'success');
      } else {
        setSecurityReport({
          status: 'neutral',
          message: `Plano atual: ${res.effectivePlan}.`,
        });
      }
    } catch (err: any) {
      setSecurityReport({
        status: 'error',
        message: err?.message || 'Falha ao executar teste.',
      });
    } finally {
      setTestingSecurity(false);
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

  const currentPlano = modoDemonstracao ? 'GRATUITO' : (profile?.plano || 'GRATUITO');
  const used = modoDemonstracao ? 0 : (quota?.used || 0);
  const limit = modoDemonstracao ? 10 : (quota?.limit || 10);
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
                  modoDemonstracao
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : currentPlano === 'TURBO'
                    ? 'bg-amber-400 text-slate-950'
                    : currentPlano === 'PRO'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  {modoDemonstracao ? 'DEMONSTRAÇÃO' : currentPlano}
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
                {currentPlano === 'TURBO' ? `${used} / ${limit} gerações` : '0 gerações (Exclusivo TURBO)'}
              </span>
            </div>

            {currentPlano === 'TURBO' ? (
              <>
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
              </>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Os planos <strong>GRATUITO</strong> e <strong>PRO</strong> não consomem IA no servidor. Faça upgrade para o <strong>TURBO</strong> para liberar 1.500 gerações mensais e automações comerciais.
              </p>
            )}
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

                <div className="pt-2 text-center text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/80">
                  Ao continuar, você concorda com os{' '}
                  <a
                    href="/termos.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
                  >
                    Termos de Uso
                  </a>
                  {' '}e a{' '}
                  <a
                    href="/privacidade.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
                  >
                    Política de Privacidade
                  </a>.
                </div>
              </form>
            )}
          </div>

          {/* Card Modo Demonstração */}
          <div className={`p-4 rounded-xl border space-y-3 transition-colors ${
            modoDemonstracao
              ? 'bg-amber-500/10 border-amber-400 dark:border-amber-600/80 ring-2 ring-amber-400/20'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className={`w-4 h-4 ${modoDemonstracao ? 'text-amber-500' : 'text-slate-500'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  {modoDemonstracao ? 'Modo Demonstração Ativo' : 'Modo Demonstração'}
                </span>
              </div>
              {modoDemonstracao && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 uppercase tracking-wide">
                  Dados Fictícios
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {modoDemonstracao
                ? 'Você está visualizando orçamentos, clientes e empresa de teste. Entrar ou sair do modo demonstração não afeta os dados reais da sua conta.'
                : 'Deseja testar ou demonstrar o FechaZap sem exibir suas informações e clientes reais? Ative o modo demonstração com dados de exemplo. Entrar e sair não afeta os dados reais da sua conta.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onToggleModoDemonstracao}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  modoDemonstracao
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white'
                }`}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{modoDemonstracao ? 'Voltar para minha conta' : 'Ver modo demonstração'}</span>
              </button>

              {modoDemonstracao && onRestaurarExemploOriginal && (
                <button
                  type="button"
                  onClick={onRestaurarExemploOriginal}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Restaura os orçamentos e clientes de teste originais"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>Restaurar exemplo original</span>
                </button>
              )}
            </div>
          </div>

          {/* Valor Real & Posicionamento */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>Investimento Focado em Retorno Real</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              No FechaZap você investe em <strong>economia de tempo</strong>, <strong>organização</strong> e <strong>inteligência comercial</strong> — sem pegadinhas ou limitações artificiais irritantes.
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-500/20">
                <Clock className="w-3 h-3" /> Economia de 4-6h/semana
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium border border-blue-500/20">
                <FileCheck className="w-3 h-3" /> Propostas Profissionais
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium border border-amber-500/20">
                <Zap className="w-3 h-3" /> Fechamento Acelerado
              </span>
            </div>
          </div>

          {/* Comparativo de Planos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Planos Disponíveis no FechaZap
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Cobrança segura via Stripe
              </span>
            </div>

            {/* Banner de Gerenciamento de Assinatura (exclusivo para PRO e TURBO e quando não em demonstração) */}
            {(currentPlano === 'PRO' || currentPlano === 'TURBO') && !modoDemonstracao && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/40 dark:to-slate-800/80 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Assinatura Ativa: Plano {currentPlano}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Altere dados de pagamento, consulte notas fiscais ou gerencie o plano no Stripe.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenPortal}
                  disabled={openingPortal}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{openingPortal ? 'Abrindo...' : 'Gerenciar assinatura'}</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* GRATUITO */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                currentPlano === 'GRATUITO'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-slate-800/90'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}>
                <div>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs uppercase tracking-wide">GRATUITO</div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300">
                      Experimentar
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
                    R$ 0
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Para quem está começando e quer testar a criação rápida de orçamentos.
                  </p>

                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-750">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>5 orçamentos</strong> por mês</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Gestão básica de clientes</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Envio manual via WhatsApp</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>0 créditos de IA no backend</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-750">
                  {currentPlano === 'GRATUITO' ? (
                    <span className="block w-full text-[11px] font-bold text-emerald-600 dark:text-emerald-400 text-center py-1.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg">
                      {modoDemonstracao ? 'Simulado (Demonstração)' : 'Plano Atual'}
                    </span>
                  ) : (
                    <span className="block w-full text-[11px] text-center text-slate-400 py-1.5">
                      Plano de Entrada
                    </span>
                  )}
                </div>
              </div>

              {/* PRO */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                currentPlano === 'PRO' && !modoDemonstracao
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-slate-800/90'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}>
                <div>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400">PRO</div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Uso Profissional
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
                    R$ 49<span className="text-xs font-normal text-slate-400">/mês</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Para autônomos e prestadores que vivem do seu trabalho e precisam de agilidade.
                  </p>

                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-750">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>Orçamentos Ilimitados</strong></span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>Sincronização Nuvem</strong> (Supabase RLS)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>PDF Profissional</strong> com Logo e PIX</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Sem anúncios / 100% focado</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-750">
                  {currentPlano === 'PRO' && !modoDemonstracao ? (
                    <div className="space-y-1.5">
                      <span className="block w-full text-[11px] font-bold text-emerald-600 dark:text-emerald-400 text-center py-1 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg">
                        Plano Atual
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenPortal}
                        disabled={openingPortal}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{openingPortal ? 'Carregando...' : 'Gerenciar assinatura'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => handleStartCheckout('PRO')}
                        disabled={startingCheckout === 'PRO' || modoDemonstracao}
                        title={modoDemonstracao ? 'Indisponível em modo demonstração' : undefined}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
                          modoDemonstracao
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{modoDemonstracao ? 'Indisponível em Demo' : startingCheckout === 'PRO' ? 'Processando...' : 'Assinar PRO'}</span>
                      </button>
                      {modoDemonstracao && (
                        <p className="text-[10px] text-center text-amber-600 dark:text-amber-400 font-medium">
                          Indisponível em demonstração
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* TURBO */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                currentPlano === 'TURBO' && !modoDemonstracao
                  ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-slate-800/90'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}>
                <div>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs uppercase tracking-wide text-amber-500">TURBO</div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                      Produtividade + IA
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
                    R$ 97<span className="text-xs font-normal text-slate-400">/mês</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Copiloto comercial inteligente para fechar mais propostas e economizar horas.
                  </p>

                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-750">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>Tudo do plano PRO</strong></span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>1.500 IA/mês</strong> (Google Gemini 3.8)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong>Follow-up WhatsApp</strong> inteligente</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Orçamentos por voz e áudio em 10s</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Gatilhos persuasivos de fechamento</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-750">
                  {currentPlano === 'TURBO' && !modoDemonstracao ? (
                    <div className="space-y-1.5">
                      <span className="block w-full text-[11px] font-bold text-amber-600 dark:text-amber-400 text-center py-1 bg-amber-100 dark:bg-amber-950/60 rounded-lg">
                        Plano Atual
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenPortal}
                        disabled={openingPortal}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{openingPortal ? 'Carregando...' : 'Gerenciar assinatura'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => handleStartCheckout('TURBO')}
                        disabled={startingCheckout === 'TURBO' || modoDemonstracao}
                        title={modoDemonstracao ? 'Indisponível em modo demonstração' : undefined}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-xs ${
                          modoDemonstracao
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer disabled:opacity-50'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{modoDemonstracao ? 'Indisponível em Demo' : startingCheckout === 'TURBO' ? 'Processando...' : 'Assinar TURBO'}</span>
                      </button>
                      {modoDemonstracao && (
                        <p className="text-[10px] text-center text-amber-600 dark:text-amber-400 font-medium">
                          Indisponível em demonstração
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Teste de Segurança Anti-Tampering (Backend Enforcement) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Segurança do Servidor: Anti-Tampering
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                PostgreSQL RLS + Webhooks
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              O FechaZap adota o princípio de segurança <em>Zero Trust</em> no frontend. Qualquer tentativa do navegador de falsificar o plano é estritamente bloqueada pelo banco de dados PostgreSQL.
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={testingSecurity || !isAuthenticated}
                onClick={handleTestSecurityAttempt}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>{testingSecurity ? 'Verificando...' : 'Testar Tentativa de Alteração pelo Frontend'}</span>
              </button>

              {!isAuthenticated && (
                <span className="text-[11px] text-slate-400">
                  (Faça login para executar a simulação de segurança no PostgreSQL)
                </span>
              )}
            </div>

            {securityReport && (
              <div className={`p-3 rounded-lg text-xs font-mono border ${
                securityReport.status === 'blocked'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}>
                {securityReport.message}
              </div>
            )}
          </div>


        </div>

      </div>
    </div>
  );
};
