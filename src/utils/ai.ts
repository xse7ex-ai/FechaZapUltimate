import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { getAuthToken } from './supabase';

export interface GeminiStatusResult {
  configured: boolean;
  model: string;
  status?: string;
  sample?: string;
  error?: string;
  provider?: string;
  runtime?: string;
  contingency?: boolean;
}

export function parseAiError(errData: any): string {
  if (!errData) return 'Erro ao comunicar com o serviço de IA.';
  if (typeof errData === 'string') {
    if (errData.includes('503') || errData.includes('high demand') || errData.includes('UNAVAILABLE')) {
      return 'Os servidores do Google Gemini estão com alta demanda temporária. O FechaZap ativou o modo de contingência.';
    }
    try {
      const parsed = JSON.parse(errData);
      if (parsed.error?.message) {
        return parsed.error.message;
      }
      if (parsed.error && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // not json
    }
    return errData;
  }
  if (errData.message) return parseAiError(errData.message);
  if (errData.error) return parseAiError(errData.error);
  return 'Erro ao processar com a IA.';
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function checkGeminiStatus(): Promise<GeminiStatusResult> {
  try {
    const res = await fetch('/api/ai/status');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        configured: false,
        model: 'gemini-3.8-flash',
        error: err.error || `HTTP ${res.status}: Erro ao conectar com Gemini API`,
      };
    }
    return await res.json();
  } catch (err: any) {
    return {
      configured: false,
      model: 'gemini-3.8-flash',
      error: err?.message || 'Servidor/Worker indisponível',
    };
  }
}

export async function testarConexaoGemini(): Promise<GeminiStatusResult> {
  try {
    const headers = await buildAuthHeaders();
    const res = await fetch('/api/ai/test', { method: 'POST', headers });
    if (!res.ok) {
      return await checkGeminiStatus();
    }
    return await res.json();
  } catch {
    return await checkGeminiStatus();
  }
}

export async function gerarFechamentoGemini(
  orcamento: Orcamento,
  gatilho: string,
  tom: string,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch('/api/ai/fechar-orcamento', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orcamento,
      gatilho,
      tom,
      empresa,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao gerar copy com a API Gemini.'));
  }

  return data.text;
}

export async function contornarObjecaoGemini(
  orcamento: Orcamento,
  objecao: string,
  contexto: string,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch('/api/ai/contornar-objecao', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orcamento,
      objecao,
      contexto,
      empresa,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao contornar objeção com a API Gemini.'));
  }

  return data.text;
}

export async function gerarFollowUpGemini(
  orcamento: Orcamento,
  dias: number,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch('/api/ai/follow-up', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orcamento,
      dias,
      empresa,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao gerar follow-up com a API Gemini.'));
  }

  return data.text;
}

export async function chatComGemini(
  message: string,
  context: any,
  history: Array<{ role: 'user' | 'model'; text: string }>
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      context,
      history,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha na comunicação com a API Gemini.'));
  }

  return data.text;
}

export async function diagnosticoVendasGemini(
  relatorio: any
): Promise<{ text: string; dataSource?: string }> {
  const headers = await buildAuthHeaders();

  const res = await fetch('/api/ai/diagnostico-vendas', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      relatorio,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao gerar diagnóstico com a API Gemini.'));
  }

  return {
    text: data.text,
    dataSource: data.dataSource,
  };
}
