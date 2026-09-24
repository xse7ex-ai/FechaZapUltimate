import { Orcamento, ConfiguracaoEmpresa } from '../types';
import { getAuthToken } from './supabase';
import { getApiUrl } from './apiConfig';

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
    if (errData.includes('401') || errData.includes('Não autorizado')) {
      return 'Acesso não autorizado. É necessário fazer login para utilizar a inteligência artificial.';
    }
    if (errData.includes('429') || errData.includes('Limite mensal')) {
      return errData;
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

// Consulta de status segura (sem expor secrets ou chaves de API)
export async function checkGeminiStatus(): Promise<GeminiStatusResult> {
  try {
    const res = await fetch(getApiUrl('/api/ai/status'));
    if (!res.ok) {
      return {
        configured: false,
        model: 'gemini-3.8-flash',
        error: `HTTP ${res.status}: Servidor de IA indisponível`,
      };
    }
    const data = await res.json();
    return {
      configured: Boolean(data.configured && data.ok),
      model: 'gemini-3.8-flash',
      provider: data.provider || 'Google Gemini',
      status: data.configured ? 'active' : 'unconfigured',
    };
  } catch (err: any) {
    return {
      configured: false,
      model: 'gemini-3.8-flash',
      error: err?.message || 'Servidor/Worker indisponível',
    };
  }
}

// Teste de conexão seguro: utiliza o endpoint /api/ai/status sem expor rotas vulneráveis
export async function testarConexaoGemini(): Promise<GeminiStatusResult> {
  return await checkGeminiStatus();
}

export async function gerarFechamentoGemini(
  orcamento: Orcamento,
  gatilho: string,
  tom: string,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch(getApiUrl('/api/ai/fechar-orcamento'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orcamentoId: orcamento.id,
      orcamento,
      gatilho,
      tom,
      empresa,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error('Acesso não autorizado. Faça login com sua conta para utilizar o FechaZap IA.');
  }
  if (res.status === 429) {
    throw new Error(data.error || 'Limite mensal de IA atingido para o seu plano. Faça upgrade para continuar.');
  }
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao gerar proposta com a IA.'));
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

  const res = await fetch(getApiUrl('/api/ai/contornar-objecao'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orcamentoId: orcamento.id,
      orcamento,
      objecao,
      contexto,
      empresa,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error('Acesso não autorizado. Faça login com sua conta para utilizar a IA.');
  }
  if (res.status === 429) {
    throw new Error(data.error || 'Limite mensal de IA atingido para o seu plano.');
  }
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao contornar objeção com a IA.'));
  }

  return data.text;
}

export async function gerarFollowUpGemini(
  orcamento: Orcamento,
  dias: number,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch(getApiUrl('/api/ai/follow-up'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orcamentoId: orcamento.id,
      orcamento,
      dias,
      empresa,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error('Acesso não autorizado. Faça login para utilizar a IA.');
  }
  if (res.status === 429) {
    throw new Error(data.error || 'Limite mensal de IA atingido para o seu plano.');
  }
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao gerar follow-up com a IA.'));
  }

  return data.text;
}

export async function chatComGemini(
  message: string,
  context: any,
  history: Array<{ role: 'user' | 'model'; text: string }>
): Promise<string> {
  const headers = await buildAuthHeaders();

  const res = await fetch(getApiUrl('/api/ai/chat'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      context,
      history,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error('Acesso não autorizado. Faça login para utilizar o chat com a IA.');
  }
  if (res.status === 429) {
    throw new Error(data.error || 'Limite mensal de IA atingido para o seu plano.');
  }
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha na comunicação com a IA.'));
  }

  return data.text;
}

export async function diagnosticoVendasGemini(
  relatorio?: any
): Promise<{ text: string; dataSource?: string }> {
  const headers = await buildAuthHeaders();

  const res = await fetch(getApiUrl('/api/ai/diagnostico-vendas'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      relatorio,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error('Acesso não autorizado. Faça login para acessar o diagnóstico de vendas.');
  }
  if (res.status === 429) {
    throw new Error(data.error || 'Limite mensal de IA atingido para o seu plano.');
  }
  if (!res.ok || !data.success) {
    throw new Error(parseAiError(data.error || 'Falha ao gerar diagnóstico de vendas.'));
  }

  return {
    text: data.text,
    dataSource: data.dataSource,
  };
}
