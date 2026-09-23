import { Orcamento, ConfiguracaoEmpresa } from '../types';

export interface GeminiStatusResult {
  configured: boolean;
  model: string;
  status?: string;
  sample?: string;
  error?: string;
  provider?: string;
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
    } catch {
      // not json
    }
    return errData;
  }
  if (errData.message) return parseAiError(errData.message);
  if (errData.error) return parseAiError(errData.error);
  return 'Erro ao processar com a IA.';
}

export async function checkGeminiStatus(customKey?: string): Promise<GeminiStatusResult> {
  try {
    const headers: Record<string, string> = {};
    if (customKey) {
      headers['x-gemini-key'] = customKey;
    }
    const res = await fetch('/api/ai/status', { headers });
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
      error: err?.message || 'Servidor indisponível',
    };
  }
}

export async function testarConexaoGemini(customKey?: string): Promise<GeminiStatusResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (customKey) {
      headers['x-gemini-key'] = customKey;
    }
    const res = await fetch('/api/ai/test', { method: 'POST', headers });
    if (!res.ok) {
      return await checkGeminiStatus(customKey);
    }
    return await res.json();
  } catch {
    return await checkGeminiStatus(customKey);
  }
}

export async function gerarFechamentoGemini(
  orcamento: Orcamento,
  gatilho: string,
  tom: string,
  empresa: ConfiguracaoEmpresa,
  customKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customKey) {
    headers['x-gemini-key'] = customKey;
  }

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
  empresa: ConfiguracaoEmpresa,
  customKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customKey) {
    headers['x-gemini-key'] = customKey;
  }

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
  empresa: ConfiguracaoEmpresa,
  customKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customKey) {
    headers['x-gemini-key'] = customKey;
  }

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
  history: Array<{ role: 'user' | 'model'; text: string }>,
  customKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customKey) {
    headers['x-gemini-key'] = customKey;
  }

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
  relatorio: any,
  customKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customKey) {
    headers['x-gemini-key'] = customKey;
  }

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

  return data.text;
}
