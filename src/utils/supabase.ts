import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserQuota, TipoPlano, MensagemWhatsApp, SubscriptionInfo, DbMensagemWhatsAppRow } from '../types';
import { loadUserMensagens, saveUserMensagens } from './storage';
import { logger } from './logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('Erro ao inicializar Supabase client:', err);
  }
}

export function getCachedUserId(): string | null {
  try {
    const raw = localStorage.getItem('fechazap_auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return typeof parsed.id === 'string' && parsed.id ? parsed.id : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getSupabase(): SupabaseClient | null {
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(client && supabaseUrl);
}

// Retorna o token JWT criptografado emitido pelo Supabase Auth
// Tokens locais ou de modo offline NÃO são considerados tokens de autorização válidos para a API
export async function getAuthToken(): Promise<string | null> {
  if (client) {
    const { data } = await client.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }
  }

  // Fallback: se houver sessão salva
  try {
    const stored = localStorage.getItem('fechazap_auth_token');
    if (stored && !stored.startsWith('local-')) {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

// Obtém perfil e cota real do servidor diretamente pelo Supabase Client
export async function fetchServerUserProfileAndQuota(): Promise<{
  authenticated: boolean;
  user: UserProfile;
  quota: UserQuota;
}> {
  if (client) {
    try {
      const { data: authData } = await client.auth.getUser();
      if (authData?.user) {
        const u = authData.user;
        const { data: profile } = await client
          .from('profiles')
          .select('id, email, nome, plano, empresa_nome')
          .eq('id', u.id)
          .maybeSingle();

        const rawPlano = String(profile?.plano || 'GRATUITO').toUpperCase();
        const plano: TipoPlano = rawPlano === 'TURBO' ? 'TURBO' : rawPlano === 'PRO' ? 'PRO' : 'GRATUITO';
        const mesAtual = new Date().toISOString().slice(0, 7);
        // REGRA DE NEGÓCIO: IA exclusiva do TURBO (GRATUITO: 0, PRO: 0, TURBO: 1500)
        const limit = plano === 'TURBO' ? 1500 : 0;

        let used = 0;
        try {
          const { count } = await client
            .from('ai_usage')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', u.id)
            .eq('mes_referencia', mesAtual);

          if (typeof count === 'number') {
            used = count;
          }
        } catch {
          // ignore
        }

        let subscription: SubscriptionInfo | undefined = undefined;
        try {
          const { data: subData } = await client
            .from('subscriptions')
            .select('*')
            .eq('user_id', u.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subData) {
            subscription = {
              id: subData.id,
              userId: subData.user_id,
              stripeCustomerId: subData.stripe_customer_id,
              stripeSubscriptionId: subData.stripe_subscription_id,
              plano: subData.plano,
              status: subData.status,
              currentPeriodStart: subData.current_period_start,
              currentPeriodEnd: subData.current_period_end,
              trialEnd: subData.trial_end,
              cancelAtPeriodEnd: subData.cancel_at_period_end,
              canceledAt: subData.canceled_at,
              gracePeriodEnd: subData.grace_period_end,
            };
          }
        } catch {
          // ignore
        }

        return {
          authenticated: true,
          user: {
            id: u.id,
            email: u.email || '',
            nome: profile?.nome || u.user_metadata?.nome || '',
            plano,
            empresaNome: profile?.empresa_nome,
            subscription,
          },
          quota: {
            plano,
            used,
            limit,
            allowed: limit > 0 && used < limit,
            month: mesAtual,
          },
        };
      }
    } catch (err) {
      console.warn('Erro ao consultar perfil no Supabase:', err);
    }
  }

  return {
    authenticated: false,
    user: {
      id: 'local-guest',
      email: '',
      plano: 'GRATUITO',
    },
    quota: {
      plano: 'GRATUITO',
      used: 0,
      limit: 0,
      allowed: false,
    },
  };
}

// Invocador seguro de Edge Functions do Supabase com repasse automático de JWT
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body?: Record<string, unknown> | string,
  options?: { method?: 'GET' | 'POST' }
): Promise<{ data: T | null; error: Error | { message?: string } | null }> {
  if (!client) {
    return { data: null, error: new Error('Supabase client não configurado no app.') };
  }

  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await client.functions.invoke(functionName, {
      body,
      headers,
      method: options?.method || (body ? 'POST' : 'GET'),
    });

    if (res.error) {
      logger.webhook('invoke_edge_function_error', res.error.message, { metadata: { functionName } });
      return { data: null, error: res.error };
    }
    return { data: res.data as T, error: null };
  } catch (err: unknown) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    logger.webhook('invoke_edge_function_exception', errorObj.message, { metadata: { functionName } });
    return { data: null, error: errorObj };
  }
}

export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!client) {
    // Modo simulação local/offline demonstrativo
    if (email && password) {
      const mockToken = `local-jwt-${Date.now()}`;
      const mockId = `mock-user-${Date.now()}`;
      localStorage.setItem('fechazap_auth_token', mockToken);
      localStorage.setItem('fechazap_auth_user', JSON.stringify({ id: mockId, email, plano: 'GRATUITO' }));
      return { success: true };
    }
    return { success: false, error: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    if (data.session?.access_token && data.user) {
      localStorage.setItem('fechazap_auth_token', data.session.access_token);
      localStorage.setItem(
        'fechazap_auth_user',
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          nome: data.user.user_metadata?.nome || '',
        })
      );
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha no login' };
  }
}

// Cadastro seguro: Todo novo usuário é cadastrado como GRATUITO
export async function registerWithEmail(email: string, password: string, nome?: string): Promise<{ success: boolean; error?: string }> {
  if (!client) {
    const mockToken = `local-jwt-${Date.now()}`;
    const mockId = `mock-user-${Date.now()}`;
    localStorage.setItem('fechazap_auth_token', mockToken);
    localStorage.setItem('fechazap_auth_user', JSON.stringify({ id: mockId, email, nome, plano: 'GRATUITO' }));
    return { success: true };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          plano: 'GRATUITO',
        },
      },
    });
    if (error) return { success: false, error: error.message };
    if (data.session?.access_token && data.user) {
      localStorage.setItem('fechazap_auth_token', data.session.access_token);
      localStorage.setItem(
        'fechazap_auth_user',
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          nome: data.user.user_metadata?.nome || nome || '',
          plano: 'GRATUITO',
        })
      );
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha no cadastro' };
  }
}

export async function logoutUser(): Promise<void> {
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      // ignore
    }
  }
  localStorage.removeItem('fechazap_auth_token');
  localStorage.removeItem('fechazap_auth_user');
}

/**
 * Busca as mensagens recebidas via WhatsApp na tabela public.mensagens_whatsapp
 * Exclusivo para usuários no plano TURBO. Utiliza namespace estritamente isolado.
 */
export async function fetchMensagensWhatsApp(userId?: string | null): Promise<MensagemWhatsApp[]> {
  const activeId = userId !== undefined ? userId : getCachedUserId();
  if (!client) {
    return loadUserMensagens(activeId);
  }

  try {
    const { data: authData } = await client.auth.getUser();
    if (!authData?.user) {
      return loadUserMensagens(activeId);
    }

    const { data, error } = await client
      .from('mensagens_whatsapp')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Erro ao carregar mensagens do WhatsApp:', error);
      return loadUserMensagens(authData.user.id);
    }

    const mapped: MensagemWhatsApp[] = (data || []).map((row: DbMensagemWhatsAppRow) => ({
      id: String(row.id),
      userId: String(row.user_id),
      phoneNumberId: row.phone_number_id || undefined,
      clienteId: row.cliente_id || undefined,
      clienteTelefone: row.cliente_telefone,
      clienteNome: row.cliente_nome || undefined,
      corpo: row.corpo,
      direcao: row.direcao || 'inbound',
      status: row.status || 'delivered',
      lida: Boolean(row.lida),
      waMessageId: row.wa_message_id || undefined,
      orcamentoId: row.orcamento_id || undefined,
      timestamp: row.timestamp || row.created_at,
      createdAt: row.created_at,
    }));

    saveUserMensagens(authData.user.id, mapped);
    return mapped;
  } catch (err) {
    console.warn('Exceção ao buscar mensagens do WhatsApp:', err);
    return loadUserMensagens(activeId);
  }
}

/**
 * Marca uma mensagem como lida no Supabase e no cache local isolado
 */
export async function markMensagemAsRead(mensagemId: string, userId?: string | null): Promise<boolean> {
  const activeId = userId !== undefined ? userId : getCachedUserId();
  const list = loadUserMensagens(activeId);
  const updated = list.map((m) => (m.id === mensagemId ? { ...m, lida: true } : m));
  saveUserMensagens(activeId, updated);

  if (!client) return true;

  try {
    const { error } = await client
      .from('mensagens_whatsapp')
      .update({ lida: true })
      .eq('id', mensagemId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Consulta a conexão WhatsApp Cloud API ativa do usuário (Multi-Tenant)
 * NOTA DE SEGURANÇA (Regra 9): A consulta RLS nunca retorna ou expõe tokens confidenciais ao cliente.
 */
export async function fetchWhatsAppConnection(userId?: string | null): Promise<import('../types').WhatsAppConnection | null> {
  const activeId = userId !== undefined ? userId : getCachedUserId();
  if (!client) {
    try {
      const stored = localStorage.getItem(`fechazap_wa_conn_${activeId || 'default'}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  try {
    const { data: authData } = await client.auth.getUser();
    if (!authData?.user) return null;

    const { data, error } = await client
      .from('whatsapp_connections')
      .select('id, user_id, waba_id, phone_number_id, display_phone_number, status, created_at, updated_at')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const conn: import('../types').WhatsAppConnection = {
      id: data.id,
      userId: data.user_id,
      wabaId: data.waba_id || undefined,
      phoneNumberId: data.phone_number_id,
      displayPhoneNumber: data.display_phone_number || undefined,
      status: data.status || 'active',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    try {
      localStorage.setItem(`fechazap_wa_conn_${authData.user.id}`, JSON.stringify(conn));
    } catch {
      // ignore
    }

    return conn;
  } catch (err) {
    console.warn('Erro ao consultar conexão WhatsApp:', err);
    return null;
  }
}

/**
 * Salva ou atualiza a conexão comercial WhatsApp do usuário
 */
export async function saveWhatsAppConnection(params: {
  wabaId?: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!client) {
    const activeId = getCachedUserId() || 'guest';
    const mockConn: import('../types').WhatsAppConnection = {
      id: `conn-${Date.now()}`,
      userId: activeId,
      wabaId: params.wabaId,
      phoneNumberId: params.phoneNumberId,
      displayPhoneNumber: params.displayPhoneNumber,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(`fechazap_wa_conn_${activeId}`, JSON.stringify(mockConn));
    } catch {
      // ignore
    }
    return { success: true };
  }

  try {
    const { data: authData } = await client.auth.getUser();
    if (!authData?.user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    // Desativa conexões anteriores se houver
    await client
      .from('whatsapp_connections')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('user_id', authData.user.id);

    // Insere nova conexão ativa
    const { error } = await client.from('whatsapp_connections').insert({
      user_id: authData.user.id,
      waba_id: params.wabaId || null,
      phone_number_id: params.phoneNumberId.trim(),
      display_phone_number: params.displayPhoneNumber?.trim() || null,
      status: 'active',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao salvar conexão WhatsApp.' };
  }
}

/**
 * Desconecta ou revoga a conexão comercial WhatsApp ativa
 */
export async function disconnectWhatsAppConnection(): Promise<{ success: boolean; error?: string }> {
  if (!client) {
    const activeId = getCachedUserId() || 'guest';
    localStorage.removeItem(`fechazap_wa_conn_${activeId}`);
    return { success: true };
  }

  try {
    const { data: authData } = await client.auth.getUser();
    if (!authData?.user) return { success: false, error: 'Não autenticado' };

    const { error } = await client
      .from('whatsapp_connections')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('user_id', authData.user.id)
      .eq('status', 'active');

    localStorage.removeItem(`fechazap_wa_conn_${authData.user.id}`);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao desconectar WhatsApp.' };
  }
}

/**
 * Consulta a assinatura ativa ou mais recente do usuário diretamente do banco
 */
export async function fetchUserSubscription(userId?: string | null): Promise<SubscriptionInfo | null> {
  const activeId = userId !== undefined ? userId : getCachedUserId();
  if (!client) {
    return null;
  }

  try {
    const { data: authData } = await client.auth.getUser();
    const uid = authData?.user?.id || activeId;
    if (!uid) return null;

    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      plano: data.plano,
      status: data.status,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      trialEnd: data.trial_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      canceledAt: data.canceled_at,
      gracePeriodEnd: data.grace_period_end,
    };
  } catch {
    return null;
  }
}

/**
 * Teste de Segurança: Tentativa de alteração de plano diretamente pelo Frontend.
 * O backend PostgreSQL (RLS + Triggers) deve IMPEDIR e REJEITAR ou REVERTER a alteração.
 * Nunca confiar no plano enviado pelo frontend.
 */
export async function attemptClientSidePlanChange(
  forgedPlan: TipoPlano
): Promise<{ success: boolean; error?: string; effectivePlan?: TipoPlano }> {
  if (!client) {
    return {
      success: false,
      error: 'Operação bloqueada: O plano não pode ser alterado localmente sem validação do servidor.',
    };
  }

  try {
    const { data: authData } = await client.auth.getUser();
    if (!authData?.user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    // Tentativa indevida de alterar a coluna plano via Supabase Client
    const { error } = await client
      .from('profiles')
      .update({ plano: forgedPlan })
      .eq('id', authData.user.id);

    // Consulta o plano real persistido no banco de dados para comprovar integridade
    const { data: refreshedProfile } = await client
      .from('profiles')
      .select('plano')
      .eq('id', authData.user.id)
      .single();

    const realPlan = (refreshedProfile?.plano || 'GRATUITO') as TipoPlano;

    if (error) {
      return {
        success: false,
        error: `Bloqueio de segurança do banco ativado: ${error.message}`,
        effectivePlan: realPlan,
      };
    }

    if (realPlan !== forgedPlan) {
      return {
        success: false,
        error: `Tentativa de adulteração neutralizada pelo PostgreSQL: O plano permaneceu ${realPlan}.`,
        effectivePlan: realPlan,
      };
    }

    return {
      success: true,
      effectivePlan: realPlan,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Erro durante teste de segurança.',
    };
  }
}

export interface QuotaConsumeResult {
  success: boolean;
  quotaExceeded?: boolean;
  errorMessage?: string;
}

/**
 * Validação e consumo da quota de 5 orçamentos/mês para o plano GRATUITO.
 * Executada via RPC atômica (check_and_consume_gratuito_quota) no Supabase.
 * - Se exceder quota (P0001 / QUOTA_EXCEEDED), retorna quotaExceeded: true.
 * - Se falhar por conectividade/indisponibilidade (offline, Supabase fora do ar),
 *   retorna success: true permitindo a criação local com log no console.
 */
export async function checkAndConsumeGratuitoQuota(): Promise<QuotaConsumeResult> {
  if (!client) {
    console.warn('[Quota GRATUITO] Cliente Supabase não configurado. Operação offline permitida.');
    return { success: true };
  }

  try {
    const { error } = await client.rpc('check_and_consume_gratuito_quota');

    if (error) {
      const isQuotaExceeded =
        error.code === 'P0001' ||
        (typeof error.message === 'string' && error.message.includes('QUOTA_EXCEEDED')) ||
        (typeof error.details === 'string' && error.details.includes('QUOTA_EXCEEDED'));

      if (isQuotaExceeded) {
        return {
          success: false,
          quotaExceeded: true,
          errorMessage:
            error.message ||
            'O plano GRATUITO permite até 5 orçamentos manuais por mês. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados e sincronizar na nuvem.',
        };
      }

      // Falha por qualquer outro motivo (sem internet, erro de servidor, Supabase indisponível)
      // Conforme especificação: permitir criação local mesmo assim, com console.warn
      console.warn(
        '[Quota GRATUITO] Falha ao consultar RPC no Supabase (criação local permitida):',
        error.message || error
      );
      return { success: true };
    }

    return { success: true };
  } catch (err: any) {
    // Exceção de rede (offline, fetch abort, etc.)
    console.warn(
      '[Quota GRATUITO] Erro de rede ao verificar cota no servidor (criação local permitida):',
      err?.message || err
    );
    return { success: true };
  }
}


