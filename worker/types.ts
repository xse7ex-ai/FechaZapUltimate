// Tipos para o Cloudflare Worker do FechaZap 3.1.6
// Arquitetura Segura: Cloudflare Worker + Supabase Auth/PostgreSQL + Google Gemini + Meta WhatsApp

export interface Env {
  GEMINI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  WHATSAPP_TOKEN?: string;
  PHONE_NUMBER_ID?: string;
  APP_ENV?: string;
  ALLOWED_ORIGINS?: string;
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
  remaining?: number;
  month: string;
}

// Resultado do consumo atômico de quota no PostgreSQL via consume_ai_quota()
// Falha estritamente FECHADA: ok=false gera HTTP 503; allowed=false gera HTTP 429
export interface ConsumeQuotaResult {
  ok: boolean;
  allowed: boolean;
  plano: TipoPlano;
  used: number;
  limit: number;
  remaining?: number;
  month: string;
  error?: string;
}
