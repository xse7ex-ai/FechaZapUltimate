import { Orcamento, ConfiguracaoEmpresa, ItemOrcamento } from '../types';
import { invokeEdgeFunction } from './supabase';
import { logger } from './logger';

export interface GeminiStatusResult {
  configured: boolean;
  model: string;
  status?: string;
  error?: string;
  provider?: string;
  runtime?: string;
}

export interface AiRawItem {
  descricao?: string;
  quantidade?: number | string;
  valorUnitario?: number | string;
}

export interface AiGenerateBudgetResponse {
  success: boolean;
  data?: {
    clienteNome?: string;
    clienteTelefone?: string;
    servico?: string;
    itens?: AiRawItem[];
    etapas?: string[];
    materiaisSugeridos?: string[];
    itensEsquecidos?: string[];
    perguntasAlinhamento?: string[];
    valorTotal?: number;
    prazoEntrega?: string;
    formaPagamento?: string;
    observacoes?: string;
    avisoPreco?: string;
  };
  error?: string;
}

export function parseAiError(errData: unknown): string {
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
      if (parsed.error?.message) return String(parsed.error.message);
      if (parsed.error && typeof parsed.error === 'string') return parsed.error;
    } catch {
      // not json
    }
    return errData;
  }
  if (typeof errData === 'object' && errData !== null) {
    const obj = errData as Record<string, unknown>;
    if (obj.message) return parseAiError(obj.message);
    if (obj.error) return parseAiError(obj.error);
  }
  return 'Falha inesperada no processamento de IA.';
}

// Checagem de status e conectividade da Edge Function de IA (Contrato de Teste Autenticado)
export async function checkGeminiStatus(): Promise<GeminiStatusResult> {
  try {
    const { data, error } = await invokeEdgeFunction<{ success: boolean; model?: string; provider?: string; error?: string }>('fecha-ia', { action: 'test_connection' });
    if (error) {
      let errMsg = error?.message || 'Edge Function fecha-ia indisponível';
      const errWithContext = error as { context?: { json?: () => Promise<{ error?: string }> } };
      if (errWithContext.context && typeof errWithContext.context.json === 'function') {
        try {
          const body = await errWithContext.context.json();
          if (body?.error) errMsg = body.error;
        } catch {
          // fallback
        }
      }
      return {
        configured: false,
        model: 'gemini-3.8-flash',
        error: errMsg,
      };
    }
    if (!data) {
      return {
        configured: false,
        model: 'gemini-3.8-flash',
        error: 'Edge Function fecha-ia indisponível',
      };
    }
    return {
      configured: Boolean(data.success),
      model: data.model || 'gemini-3.8-flash',
      provider: data.provider || 'Google Gemini',
      runtime: 'Supabase Edge Functions',
      status: data.success ? 'active' : 'error',
      error: data.error,
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

export type TipoCenarioFollowUp =
  | 'primeiro'
  | 'segundo'
  | 'sem_resposta'
  | 'proximo_vencimento'
  | 'pedido_desconto'
  | 'interesse'
  | 'recusa';

// 2. Gerar Mensagem de Follow-up com IA (Exclusivo TURBO)
export async function gerarFollowUpGemini(
  orcamento: Orcamento,
  dias: number,
  empresa: ConfiguracaoEmpresa,
  cenario?: TipoCenarioFollowUp
): Promise<string> {
  const { data, error } = await invokeEdgeFunction<any>('fecha-ia', {
    action: 'follow_up',
    orcamentoId: orcamento.id,
    orcamento,
    dias,
    empresa,
    cenario: cenario || 'primeiro',
  });

  if (error || !data?.success) {
    throw new Error(parseAiError(data?.error || error?.message || 'Falha ao gerar follow-up com IA.'));
  }

  return data.text;
}

export interface ResultadoGeracaoOrcamentoIA {
  clienteNome?: string;
  clienteTelefone?: string;
  servico?: string;
  itens: ItemOrcamento[];
  etapas?: string[];
  materiaisSugeridos?: string[];
  itensEsquecidos?: string[];
  perguntasAlinhamento?: string[];
  subtotal: number;
  valorTotal: number;
  prazoEntrega?: string;
  formaPagamento?: string;
  observacoes?: string;
  avisoPreco?: string;
}

// 3. Gerar Orçamento Completo a partir de Texto ou Áudio (Exclusivo TURBO)
export async function gerarOrcamentoComIA(
  textoOuVoz: string,
  empresa?: ConfiguracaoEmpresa
): Promise<ResultadoGeracaoOrcamentoIA> {
  const startTime = Date.now();
  const { data, error } = await invokeEdgeFunction<AiGenerateBudgetResponse>('fecha-ia', {
    action: 'gerar_orcamento',
    texto: textoOuVoz,
    empresa,
  });

  const durationMs = Date.now() - startTime;

  if (error || !data?.success) {
    const errorMsg = parseAiError(data?.error || error?.message || 'Falha ao gerar orçamento com IA.');
    logger.gemini('gerar_orcamento', errorMsg, { durationMs, level: 'warn' });
    throw new Error(errorMsg);
  }

  logger.gemini('gerar_orcamento', 'Orçamento gerado com sucesso', { durationMs });

  const d = data.data || {};
  const itensFormatados: ItemOrcamento[] = Array.isArray(d.itens)
    ? d.itens.map((it: AiRawItem, idx: number) => {
        const qty = Number(it.quantidade) || 1;
        const unitVal = typeof it.valorUnitario === 'number' && it.valorUnitario > 0
          ? Number(it.valorUnitario)
          : Number(it.valorUnitario) || 0;
        return {
          id: String(Date.now() + idx),
          descricao: String(it.descricao || 'Item'),
          quantidade: qty,
          valorUnitario: unitVal,
          total: qty * unitVal,
        };
      })
    : [{ id: '1', descricao: textoOuVoz.slice(0, 80), quantidade: 1, valorUnitario: 0, total: 0 }];

  const subtotal = itensFormatados.reduce((acc, it) => acc + it.total, 0);

  return {
    clienteNome: d.clienteNome || '',
    clienteTelefone: d.clienteTelefone || '',
    servico: d.servico,
    itens: itensFormatados,
    etapas: Array.isArray(d.etapas) ? d.etapas : [],
    materiaisSugeridos: Array.isArray(d.materiaisSugeridos) ? d.materiaisSugeridos : [],
    itensEsquecidos: Array.isArray(d.itensEsquecidos) ? d.itensEsquecidos : [],
    perguntasAlinhamento: Array.isArray(d.perguntasAlinhamento) ? d.perguntasAlinhamento : [],
    subtotal,
    valorTotal: Number(d.valorTotal) || subtotal,
    prazoEntrega: d.prazoEntrega || '3 a 5 dias úteis',
    formaPagamento: d.formaPagamento || '50% entrada + 50% entrega',
    observacoes: d.observacoes || '',
    avisoPreco: d.avisoPreco || 'Valor sugerido pela IA. Revise antes de enviar.',
  };
}

// 4. Analisar Preços com Base no Histórico do Próprio Usuário (Exclusivo TURBO)
export async function analisarPrecosComIA(
  itemOuServico: string
): Promise<{ text: string; totalAmostras: number; temHistorico?: boolean; avisoPreco?: string }> {
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
    temHistorico: Boolean(data.temHistorico),
    avisoPreco: data.avisoPreco,
  };
}
