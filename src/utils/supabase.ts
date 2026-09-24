import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserQuota, TipoPlano } from '../types';
import { getApiUrl } from './apiConfig';

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

// Obtém perfil e cota real do servidor
export async function fetchServerUserProfileAndQuota(): Promise<{
  authenticated: boolean;
  user: UserProfile;
  quota: UserQuota;
}> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(getApiUrl('/api/auth/me'), { headers });
    if (res.ok) {
      const data = await res.json();
      return {
        authenticated: Boolean(data.authenticated),
        user: {
          id: data.user.id,
          email: data.user.email,
          nome: data.user.nome,
          plano: (data.user.plano as TipoPlano) || 'GRATUITO',
        },
        quota: {
          plano: (data.quota.plano as TipoPlano) || 'GRATUITO',
          used: data.quota.used || 0,
          limit: data.quota.limit || 10,
          allowed: data.quota.allowed ?? false,
        },
      };
    }
  } catch (err) {
    console.warn('Erro ao consultar /api/auth/me:', err);
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
      limit: 10,
      allowed: false,
    },
  };
}

export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!client) {
    // Modo simulação local/offline demonstrativo
    if (email && password) {
      const mockToken = `local-jwt-${Date.now()}`;
      localStorage.setItem('fechazap_auth_token', mockToken);
      localStorage.setItem('fechazap_auth_user', JSON.stringify({ email, plano: 'GRATUITO' }));
      return { success: true };
    }
    return { success: false, error: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    if (data.session?.access_token) {
      localStorage.setItem('fechazap_auth_token', data.session.access_token);
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
    localStorage.setItem('fechazap_auth_token', mockToken);
    localStorage.setItem('fechazap_auth_user', JSON.stringify({ email, nome, plano: 'GRATUITO' }));
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
    if (data.session?.access_token) {
      localStorage.setItem('fechazap_auth_token', data.session.access_token);
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
