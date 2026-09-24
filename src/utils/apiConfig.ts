// Centralização de Configuração de URL da API (FechaZap 3.1.5)
// Suporta execução local, Cloudflare Pages e Cloudflare Worker dedicado via VITE_API_URL

export const API_BASE_URL: string = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}
