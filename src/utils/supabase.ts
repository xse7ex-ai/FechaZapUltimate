import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserQuota, TipoPlano, MensagemWhatsApp } from '../types';
import { loadUserMensagens, saveUserMensagens } from './storage';

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

        return {
          authenticated: true,
          user: {
            id: u.id,
            email: u.email || '',
            nome: profile?.nome || u.user_metadata?.nome || '',
            plano,
            empresaNome: profile?.empresa_nome,
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
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body?: any,
  options?: { method?: 'GET' | 'POST' }
): Promise<{ data: T | null; error: any }> {
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
      return { data: null, error: res.error };
    }
    return { data: res.data as T, error: null };
  } catch (err: any) {
    return { data: null, error: err };
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

    const mapped: MensagemWhatsApp[] = (data || []).map((row: any) => ({
      id: String(row.id),
      userId: String(row.user_id),
      phoneNumberId: row.phone_number_id || undefined,
      clienteTelefone: row.cliente_telefone,
      clienteNome: row.cliente_nome || undefined,
      corpo: row.corpo,
      direcao: row.direcao || 'inbound',
      status: row.status || 'delivered',
      lida: Boolean(row.lida),
      waMessageId: row.wa_message_id || undefined,
      orcamentoId: row.orcamento_id || undefined,
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

