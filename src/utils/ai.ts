import { Orcamento, ConfiguracaoEmpresa, ItemOrcamento } from '../types';
import { invokeEdgeFunction } from './supabase';

export interface GeminiStatusResult {
  configured: boolean;
  model: string;
  status?: string;
  error?: string;
  provider?: string;
  runtime?: string;
}

export function parseAiError(errData: any): string {
  if (!errData) return 'Erro ao comunicar com o serviço de IA.';
  if (typeof errData === 'string') {
    if (errData.includes('PLAN_TURBO_REQUIRED') || errData.includes('exclusiva para assinantes do plano TURBO')) {
      return 'A Inteligência Artificial é exclusiva para assinantes do plano TURBO. Faça upgrade para desbloquear.';
    }
    if (errData.includes('Serviço de quota temporariamente indisponível')) {
      return 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.';
    }
    if (errData.includes('503') || errData.includes('high demand') || errData.includes('UNAVAILABLE')) {
      return 'Os servidores do Google Gemini estão com alta demanda temporária. Tente novamente em instantes.';
    }
    if (errData.includes('401') || errData.includes('Não autorizado') || errData.includes('JWT ausente')) {
      return 'Acesso não autorizado. É necessário fazer login com sua conta para utilizar a IA.';
    }
    if (errData.includes('429') || errData.includes('Limite mensal')) {
      return 'Limite mensal de IA atingido para o plano TURBO (1500 gerações).';
    }
    try {
      const parsed = JSON.parse(errData);
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.error && typeof parsed.error === 'string') return parsed.error;
    } catch {
      // not json
    }
    return errData;
  }
  if (errData.message) return parseAiError(errData.message);
  if (errData.error) return parseAiError(errData.error);
  return 'Erro ao processar com a IA.';
}

// Checagem de status da Edge Function de IA
export async function checkGeminiStatus(): Promise<GeminiStatusResult> {
  try {
    const { data, error } = await invokeEdgeFunction<any>('fecha-ia', undefined, { method: 'GET' });
    if (error || !data) {
      return {
        configured: false,
        model: 'gemini-3.8-flash',
        error: error?.message || 'Edge Function fecha-ia indisponível',
      };
    }
    return {
      configured: Boolean(data.configured && data.ok),
      model: data.model || 'gemini-3.8-flash',
      provider: 'Google Gemini',
      runtime: data.runtime || 'Supabase Edge Functions',
      status: data.configured ? 'active' : 'unconfigured',
    };
  } catch (err: any) {
    return {
      configured: false,
      model: 'gemini-3.8-flash',
      error: err?.message || 'Servidor indisponível',
    };
  }
}

export async function testarConexaoGemini(): Promise<GeminiStatusResult> {
  return await checkGeminiStatus();
}

// 1. Gerar Proposta / Copy de Fechamento Persuasiva com IA (Exclusivo TURBO)
export async function gerarFechamentoGemini(
  orcamento: Orcamento,
  gatilho: string,
  tom: string,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const { data, error } = await invokeEdgeFunction<any>('fecha-ia', {
    action: 'gerar_fechamento',
    orcamentoId: orcamento.id,
    orcamento,
    gatilho,
    tom,
    empresa,
  });

  if (error || !data?.success) {
    throw new Error(parseAiError(data?.error || error?.message || 'Falha ao gerar proposta com IA.'));
  }

  return data.text;
}

// 2. Gerar Mensagem de Follow-up com IA (Exclusivo TURBO)
export async function gerarFollowUpGemini(
  orcamento: Orcamento,
  dias: number,
  empresa: ConfiguracaoEmpresa
): Promise<string> {
  const { data, error } = await invokeEdgeFunction<any>('fecha-ia', {
    action: 'follow_up',
    orcamentoId: orcamento.id,
    orcamento,
    dias,
    empresa,
  });

  if (error || !data?.success) {
    throw new Error(parseAiError(data?.error || error?.message || 'Falha ao gerar follow-up com IA.'));
  }

  return data.text;
}

// 3. Gerar Orçamento Completo a partir de Texto ou Áudio (Exclusivo TURBO)
export async function gerarOrcamentoComIA(
  textoOuVoz: string,
  empresa?: ConfiguracaoEmpresa
): Promise<{
  clienteNome?: string;
  clienteTelefone?: string;
  itens: ItemOrcamento[];
  subtotal: number;
  valorTotal: number;
  prazoEntrega?: string;
  formaPagamento?: string;
  observacoes?: string;
}> {
  const { data, error } = await invokeEdgeFunction<any>('fecha-ia', {
    action: 'gerar_orcamento',
    texto: textoOuVoz,
    empresa,
  });

  if (error || !data?.success) {
    throw new Error(parseAiError(data?.error || error?.message || 'Falha ao gerar orçamento com IA.'));
  }

  const d = data.data || {};
  const itensFormatados: ItemOrcamento[] = Array.isArray(d.itens)
    ? d.itens.map((it: any, idx: number) => ({
        id: String(Date.now() + idx),
        descricao: String(it.descricao || 'Item'),
        quantidade: Number(it.quantidade) || 1,
        valorUnitario: Number(it.valorUnitario) || 0,
        total: (Number(it.quantidade) || 1) * (Number(it.valorUnitario) || 0),
      }))
    : [{ id: '1', descricao: textoOuVoz.slice(0, 80), quantidade: 1, valorUnitario: 100, total: 100 }];

  const subtotal = itensFormatados.reduce((acc, it) => acc + it.total, 0);

  return {
    clienteNome: d.clienteNome || '',
    clienteTelefone: d.clienteTelefone || '',
    itens: itensFormatados,
    subtotal,
    valorTotal: Number(d.valorTotal) || subtotal,
    prazoEntrega: d.prazoEntrega || '3 a 5 dias úteis',
    formaPagamento: d.formaPagamento || '50% entrada + 50% entrega',
    observacoes: d.observacoes || '',
  };
}

// 4. Analisar Preços com Base no Histórico do Próprio Usuário (Exclusivo TURBO)
export async function analisarPrecosComIA(
  itemOuServico: string
): Promise<{ text: string; totalAmostras: number }> {
  const { data, error } = await invokeEdgeFunction<any>('fecha-ia', {
    action: 'analisar_precos',
    servico: itemOuServico,
  });

  if (error || !data?.success) {
    throw new Error(parseAiError(data?.error || error?.message || 'Falha na análise de preços com IA.'));
  }

  return {
    text: data.text,
    totalAmostras: data.totalAmostras || 0,
  };
}
