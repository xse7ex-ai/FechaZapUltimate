// ==============================================================================
// Supabase Edge Functions - Política de CORS para Produção e Desenvolvimento
// ==============================================================================

/**
 * Origens configuradas para produção via variável de ambiente FRONTEND_ORIGIN.
 * Suporta uma origem única (ex: "https://fechazap.netlify.app") ou
 * múltiplas origens separadas por vírgula.
 */
const rawFrontendOrigin = Deno.env.get('FRONTEND_ORIGIN')?.trim() || '';
const configuredOrigins = rawFrontendOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Determina a origem autorizada para a requisição:
 * 1. Em Produção (FRONTEND_ORIGIN definida):
 *    - Valida estritamente se o header 'Origin' corresponde à origem configurada.
 *    - Se for válida, retorna a origem exata.
 *    - Se não houver correspondência, bloqueia retornando vazio (sem wildcard).
 * 2. Em Desenvolvimento / Homologação (FRONTEND_ORIGIN não definida):
 *    - Permite explicitamente localhost e 127.0.0.1 em qualquer porta.
 *    - Permite o ambiente de preview Cloud Run (*.run.app) do AI Studio.
 *    - Qualquer outra origem não reconhecida é bloqueada.
 */
function resolveAllowedOrigin(req?: Request): string {
  const requestOrigin = req?.headers.get('Origin') || req?.headers.get('origin') || '';

  // 1. Cenário de Produção com FRONTEND_ORIGIN definida
  if (configuredOrigins.length > 0) {
    if (requestOrigin && configuredOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    // Se a requisição não enviou Origin mas há exatamente uma origem configurada (ex: invocação server-side)
    if (!requestOrigin && configuredOrigins.length === 1) {
      return configuredOrigins[0];
    }
    // Origem não autorizada em produção
    return '';
  }

  // 2. Cenário de Desenvolvimento / Preview (quando FRONTEND_ORIGIN não está definida)
  if (requestOrigin) {
    const isLocalhost =
      requestOrigin.startsWith('http://localhost:') ||
      requestOrigin.startsWith('http://127.0.0.1:') ||
      requestOrigin === 'http://localhost' ||
      requestOrigin === 'http://127.0.0.1';

    const isDevPreview = requestOrigin.endsWith('.run.app');

    if (isLocalhost || isDevPreview) {
      return requestOrigin;
    }
  }

  return '';
}

/**
 * Gera cabeçalhos CORS restritivos e contextualizados por requisição.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}

/**
 * Objeto CORS estático para compatibilidade retroativa.
 * Nunca utiliza wildcard (*).
 */
export const corsHeaders: Record<string, string> = {
  ...(configuredOrigins.length > 0
    ? { 'Access-Control-Allow-Origin': configuredOrigins[0] }
    : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Vary': 'Origin',
};
