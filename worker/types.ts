// Tipos para o Cloudflare Worker do FechaZap 3.1.4

export interface Env {
  GEMINI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  WHATSAPP_TOKEN?: string;
  PHONE_NUMBER_ID?: string;
  APP_ENV?: string;
}

export type TipoPlano = 'GRATUITO' | 'PRO' | 'TURBO';

export interface UserAuthContext {
  id: string;
  email: string;
  nome?: string;
  plano: TipoPlano;
  quotaUsed: number;
  quotaLimit: number;
  isAuthed: boolean;
}

export interface QuotaCheckResult {
  allowed: boolean;
  plano: TipoPlano;
  used: number;
  limit: number;
  month: string;
}
