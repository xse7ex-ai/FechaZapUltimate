// ==============================================================================
// FechaZap • Módulo de Observabilidade e Logs Estruturados (Fase 7/9)
// ==============================================================================
// Categorias Suportadas:
//   - auth, gemini, quota, whatsapp, webhook, sync, billing
// Regra de Segurança Máxima:
//   - Sanitização e Redação Automática de Segredos:
//     NUNCA registra senhas, tokens JWT, Meta tokens, Stripe secrets ou dados sensíveis.
// ==============================================================================

export type LogCategory =
  | 'auth'
  | 'gemini'
  | 'quota'
  | 'whatsapp'
  | 'webhook'
  | 'sync'
  | 'billing';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  timestamp: string;
  category: LogCategory;
  level: LogLevel;
  action: string;
  message?: string;
  userId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /senha/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /jwt/i,
  /access_token/i,
  /refresh_token/i,
  /stripe_signature/i,
  /app_secret/i,
  /cvv/i,
  /card_number/i,
];

/**
 * Sanitiza recursivamente objetos e valores para eliminar credenciais e segredos
 */
export function sanitizeLogValue(val: unknown, depth = 0): unknown {
  if (depth > 6) return '[MAX_DEPTH]';
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    // Redação preventiva de Bearer tokens ou chaves longas suspeitas
    if (val.startsWith('Bearer ') || val.startsWith('eyJh') || val.startsWith('whsec_')) {
      return '[REDACTED_SECRET]';
    }
    return val;
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeLogValue(item, depth + 1));
  }

  if (typeof val === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, propVal] of Object.entries(val as Record<string, unknown>)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeLogValue(propVal, depth + 1);
      }
    }
    return sanitized;
  }

  return String(val);
}

/**
 * Registra um evento estruturado de forma segura
 */
function logEvent(
  category: LogCategory,
  level: LogLevel,
  action: string,
  message?: string,
  extra?: {
    userId?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    category,
    level,
    action,
    message,
    userId: extra?.userId,
    durationMs: extra?.durationMs,
    metadata: extra?.metadata
      ? (sanitizeLogValue(extra.metadata) as Record<string, unknown>)
      : undefined,
  };

  const formattedPrefix = `[${entry.timestamp}] [${entry.category.toUpperCase()}] [${entry.action}]`;
  const consoleMsg = entry.message ? `${formattedPrefix} ${entry.message}` : formattedPrefix;

  switch (level) {
    case 'error':
      console.error(consoleMsg, entry.metadata || '');
      break;
    case 'warn':
      console.warn(consoleMsg, entry.metadata || '');
      break;
    case 'debug':
      console.debug(consoleMsg, entry.metadata || '');
      break;
    case 'info':
    default:
      console.info(consoleMsg, entry.metadata || '');
      break;
  }

  return entry;
}

export const logger = {
  auth: (
    action: string,
    message?: string,
    extra?: { userId?: string; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('auth', extra?.level || 'info', action, message, extra),

  gemini: (
    action: string,
    message?: string,
    extra?: { userId?: string; durationMs?: number; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('gemini', extra?.level || 'info', action, message, extra),

  quota: (
    action: string,
    message?: string,
    extra?: { userId?: string; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('quota', extra?.level || 'info', action, message, extra),

  whatsapp: (
    action: string,
    message?: string,
    extra?: { userId?: string; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('whatsapp', extra?.level || 'info', action, message, extra),

  webhook: (
    action: string,
    message?: string,
    extra?: { userId?: string; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('webhook', extra?.level || 'info', action, message, extra),

  sync: (
    action: string,
    message?: string,
    extra?: { userId?: string; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('sync', extra?.level || 'info', action, message, extra),

  billing: (
    action: string,
    message?: string,
    extra?: { userId?: string; metadata?: Record<string, unknown>; level?: LogLevel }
  ) => logEvent('billing', extra?.level || 'info', action, message, extra),
};
