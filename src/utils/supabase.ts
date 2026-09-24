import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, UserQuota, TipoPlano } from '../types';

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

// Retorna o token JWT atual para autenticar requisições seguras ao Worker/Servidor
export async function getAuthToken(): Promise<string | null> {
  if (client) {
    const { data } = await client.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }
  }

  // Fallback: se houver token salvo localmente em modo offline/demo
  try {
    return localStorage.getItem('fechazap_auth_token');
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
    const res = await fetch('/api/auth/me', { headers });
    if (res.ok) {
      const data = await res.json();
      return {
        authenticated: data.authenticated,
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
          allowed: data.quota.allowed ?? true,
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
      allowed: true,
    },
  };
}

export async function loginWithEmail(email: string, password: string):Promise<{ success: boolean; error?: string }> {
  if (!client) {
    // Modo simulação local com persistência
    if (email && password) {
      const mockToken = `local-jwt-${Date.now()}`;
      localStorage.setItem('fechazap_auth_token', mockToken);
      localStorage.setItem('fechazap_auth_user', JSON.stringify({ email, plano: 'GRATUITO' }));
      return { success: true };
    }
    return { success: false, error: 'Supabase não configurado no frontend. Configure VITE_SUPABASE_URL.' };
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
        data: { nome, plano: 'GRATUITO' },
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
