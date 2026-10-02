import { Orcamento, Cliente, TipoPlano, ItemOrcamento, StatusOrcamento, DbOrcamentoRow, DbClienteRow } from '../types';
import { getSupabase } from './supabase';
import { loadUserSyncQueue, saveUserSyncQueue } from './storage';
import { logger } from './logger';

export type PendingSyncItem =
  | {
      id: string;
      userId: string;
      type: 'save_orcamento';
      payload: Orcamento;
      timestamp: number;
    }
  | {
      id: string;
      userId: string;
      type: 'delete_orcamento';
      payload?: { id: string } | Record<string, unknown>;
      timestamp: number;
    }
  | {
      id: string;
      userId: string;
      type: 'save_cliente';
      payload: Cliente;
      timestamp: number;
    }
  | {
      id: string;
      userId: string;
      type: 'delete_cliente';
      payload?: { id: string } | Record<string, unknown>;
      timestamp: number;
    };

export function isCloudSyncEnabled(plano: TipoPlano): boolean {
  return plano === 'PRO' || plano === 'TURBO';
}

function getSyncQueue(userId: string | null | undefined): PendingSyncItem[] {
  return loadUserSyncQueue<PendingSyncItem>(userId);
}

function saveSyncQueue(userId: string | null | undefined, queue: PendingSyncItem[]): void {
  saveUserSyncQueue(userId, queue);
}

export function enqueueSync(item: Omit<PendingSyncItem, 'timestamp'>): void {
  const queue = getSyncQueue(item.userId);
  const filtered = queue.filter((q) => !(q.id === item.id && q.type === item.type));
  filtered.push({ ...item, timestamp: Date.now() } as PendingSyncItem);
  saveSyncQueue(item.userId, filtered);
}

export function dequeueSync(userId: string | null | undefined, id: string, type: PendingSyncItem['type']): void {
  const queue = getSyncQueue(userId);
  const filtered = queue.filter((q) => !(q.id === id && q.type === type));
  saveSyncQueue(userId, filtered);
}

// ==========================================
// Mapeadores DB <-> Frontend
// ==========================================

export function mapDbToOrcamento(row: Partial<DbOrcamentoRow> | Record<string, unknown>): Orcamento {
  const statusStr = typeof row.status === 'string' ? row.status : 'pendente';
  const validStatus: StatusOrcamento = ['pendente', 'enviado', 'aprovado', 'recusado'].includes(statusStr)
    ? (statusStr as StatusOrcamento)
    : 'pendente';

  return {
    id: String(row.id || ''),
    numero: String(row.numero || '101'),
    clienteId: row.cliente_id ? String(row.cliente_id) : '',
    clienteNome: typeof row.cliente_nome === 'string' ? row.cliente_nome : 'Cliente',
    clienteTelefone: typeof row.cliente_telefone === 'string' ? row.cliente_telefone : '',
    itens: Array.isArray(row.itens) ? (row.itens as ItemOrcamento[]) : [],
    subtotal: Number(row.subtotal) || 0,
    descontoTipo: row.desconto_tipo === 'porcentagem' ? 'porcentagem' : 'valor',
    descontoValor: Number(row.desconto_valor) || 0,
    valorTotal: Number(row.valor_total) || 0,
    status: validStatus,
    dataCriacao: row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    dataValidade: row.data_validade ? String(row.data_validade).slice(0, 10) : '',
    formaPagamento: typeof row.forma_pagamento === 'string' ? row.forma_pagamento : '',
    prazoEntrega: typeof row.prazo_entrega === 'string' ? row.prazo_entrega : '',
    observacoes: typeof row.observacoes === 'string' ? row.observacoes : undefined,
    termosGarantia: typeof row.termos_garantia === 'string' ? row.termos_garantia : undefined,
  };
}

export function mapOrcamentoToDb(orc: Orcamento, userId: string): DbOrcamentoRow {
  return {
    id: orc.id,
    user_id: userId,
    numero: orc.numero,
    cliente_id: orc.clienteId || null,
    cliente_nome: orc.clienteNome,
    cliente_telefone: orc.clienteTelefone,
    itens: orc.itens || [],
    subtotal: orc.subtotal || 0,
    desconto_tipo: orc.descontoTipo || 'valor',
    desconto_valor: orc.descontoValor || 0,
    valor_total: orc.valorTotal || 0,
    status: orc.status || 'pendente',
    data_validade: orc.dataValidade ? orc.dataValidade : null,
    forma_pagamento: orc.formaPagamento || null,
    prazo_entrega: orc.prazoEntrega || null,
    observacoes: orc.observacoes || null,
    termos_garantia: orc.termosGarantia || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapDbToCliente(row: Partial<DbClienteRow> | Record<string, unknown>): Cliente {
  return {
    id: String(row.id || ''),
    nome: typeof row.nome === 'string' ? row.nome : 'Cliente',
    telefone: typeof row.telefone === 'string' ? row.telefone : '',
    email: typeof row.email === 'string' ? row.email : undefined,
    documento: typeof row.documento === 'string' ? row.documento : undefined,
    cidade: typeof row.cidade === 'string' ? row.cidade : undefined,
    endereco: typeof row.endereco === 'string' ? row.endereco : undefined,
    observacoes: typeof row.observacoes === 'string' ? row.observacoes : undefined,
    dataCadastro: row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    totalOrcamentos: 0,
    valorTotalGasto: 0,
    whatsappOptIn: row.whatsapp_opt_in !== undefined ? Boolean(row.whatsapp_opt_in) : true,
    whatsappOptInAt: typeof row.whatsapp_opt_in_at === 'string' ? row.whatsapp_opt_in_at : undefined,
    whatsappOptInSource: typeof row.whatsapp_opt_in_source === 'string' ? row.whatsapp_opt_in_source : undefined,
    whatsappOptOutAt: typeof row.whatsapp_opt_out_at === 'string' ? row.whatsapp_opt_out_at : undefined,
    lastInboundAt: typeof row.last_inbound_at === 'string' ? row.last_inbound_at : undefined,
  };
}

export function mapClienteToDb(cli: Cliente, userId: string): DbClienteRow {
  return {
    id: cli.id,
    user_id: userId,
    nome: cli.nome,
    telefone: cli.telefone,
    email: cli.email || null,
    documento: cli.documento || null,
    cidade: cli.cidade || null,
    endereco: cli.endereco || null,
    observacoes: cli.observacoes || null,
    whatsapp_opt_in: cli.whatsappOptIn ?? true,
    whatsapp_opt_in_at: cli.whatsappOptInAt || null,
    whatsapp_opt_in_source: cli.whatsappOptInSource || 'cadastro',
    whatsapp_opt_out_at: cli.whatsappOptOutAt || null,
    last_inbound_at: cli.lastInboundAt || null,
    updated_at: new Date().toISOString(),
  };
}

// ==========================================
// Busca de Dados da Nuvem (PRO e TURBO)
// ==========================================

export async function fetchCloudData(plano: TipoPlano): Promise<{
  orcamentos: Orcamento[];
  clientes: Cliente[];
} | null> {
  // GRATUITO opera 100% local, nunca toca o Supabase
  if (!isCloudSyncEnabled(plano)) {
    return null;
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return null;

    const [clientesRes, orcamentosRes] = await Promise.all([
      supabase.from('clientes').select('*').order('created_at', { ascending: false }),
      supabase.from('orcamentos').select('*').order('created_at', { ascending: false }),
    ]);

    if (clientesRes.error) {
      console.warn('Erro ao carregar clientes do Supabase:', clientesRes.error);
    }
    if (orcamentosRes.error) {
      console.warn('Erro ao carregar orçamentos do Supabase:', orcamentosRes.error);
    }

    const clientes = (clientesRes.data || []).map(mapDbToCliente);
    const orcamentos = (orcamentosRes.data || []).map(mapDbToOrcamento);

    return { orcamentos, clientes };
  } catch (err) {
    console.warn('Falha na sincronização inicial com a nuvem:', err);
    return null;
  }
}

// ==========================================
// Gravação Otimista com Fallback e Fila Offline
// ==========================================

export interface SyncOrcamentoResult {
  success: boolean;
  synced: boolean;
  errorCode?: 'QUOTA_EXCEEDED' | 'NETWORK_ERROR' | 'UNKNOWN';
  errorMessage?: string;
}

export async function syncSaveOrcamento(
  orcamento: Orcamento,
  plano: TipoPlano,
  currentUserId?: string | null
): Promise<SyncOrcamentoResult> {
  // Se for GRATUITO, mantém 100% local sem tocar o Supabase
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (currentUserId) {
      enqueueSync({ id: orcamento.id, userId: currentUserId, type: 'save_orcamento', payload: orcamento });
    }
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      if (currentUserId) {
        enqueueSync({ id: orcamento.id, userId: currentUserId, type: 'save_orcamento', payload: orcamento });
      }
      return { success: true, synced: false };
    }

    const activeUserId = authData.user.id;
    // Isolamento multi-tenant: rejeita upload se o usuário em tela diferir da sessão autenticada
    if (currentUserId && currentUserId !== activeUserId) {
      console.warn('Conflito de sessão ao sincronizar orçamento: IDs divergentes.');
      return { success: false, synced: false, errorCode: 'UNKNOWN', errorMessage: 'Sessão divergente.' };
    }

    const payload = mapOrcamentoToDb(orcamento, activeUserId);
    const { error } = await supabase.from('orcamentos').upsert(payload, { onConflict: 'id' });

    if (error) {
      // Identifica com precisão erro de quota excedida do PostgreSQL (código P0001 ou mensagem de quota)
      const isQuotaExceeded =
        error.code === 'P0001' ||
        error.message?.includes('QUOTA_EXCEEDED') ||
        error.message?.includes('Limite mensal');

      if (isQuotaExceeded) {
        console.warn('Bloqueio estrito de quota no PostgreSQL:', error.message);
        return {
          success: false,
          synced: false,
          errorCode: 'QUOTA_EXCEEDED',
          errorMessage: 'Você atingiu o limite de 5 orçamentos deste mês. Faça upgrade para continuar criando novos orçamentos.',
        };
      }

      console.warn('Erro ao sincronizar orçamento no Supabase, adicionado à fila:', error);
      enqueueSync({ id: orcamento.id, userId: activeUserId, type: 'save_orcamento', payload: orcamento });
      return { success: true, synced: false, errorCode: 'NETWORK_ERROR', errorMessage: error.message };
    }

    dequeueSync(activeUserId, orcamento.id, 'save_orcamento');
    return { success: true, synced: true };
  } catch (err: any) {
    console.warn('Exceção ao gravar orçamento no Supabase:', err);
    if (currentUserId) {
      enqueueSync({ id: orcamento.id, userId: currentUserId, type: 'save_orcamento', payload: orcamento });
    }
    return { success: true, synced: false, errorCode: 'UNKNOWN', errorMessage: err?.message };
  }
}

export async function syncDeleteOrcamento(
  orcamentoId: string,
  plano: TipoPlano,
  currentUserId?: string | null
): Promise<{ success: boolean; synced: boolean }> {
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (currentUserId) {
      enqueueSync({ id: orcamentoId, userId: currentUserId, type: 'delete_orcamento', payload: { id: orcamentoId } });
    }
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      if (currentUserId) {
        enqueueSync({ id: orcamentoId, userId: currentUserId, type: 'delete_orcamento', payload: { id: orcamentoId } });
      }
      return { success: true, synced: false };
    }

    const activeUserId = authData.user.id;
    if (currentUserId && currentUserId !== activeUserId) {
      return { success: false, synced: false };
    }

    const { error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('id', orcamentoId)
      .eq('user_id', activeUserId);

    if (error) {
      console.warn('Erro ao deletar orçamento no Supabase, enfileirado:', error);
      enqueueSync({ id: orcamentoId, userId: activeUserId, type: 'delete_orcamento', payload: { id: orcamentoId } });
      return { success: true, synced: false };
    }

    dequeueSync(activeUserId, orcamentoId, 'delete_orcamento');
    dequeueSync(activeUserId, orcamentoId, 'save_orcamento');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao deletar orçamento no Supabase:', err);
    if (currentUserId) {
      enqueueSync({ id: orcamentoId, userId: currentUserId, type: 'delete_orcamento', payload: { id: orcamentoId } });
    }
    return { success: true, synced: false };
  }
}

export async function syncSaveCliente(
  cliente: Cliente,
  plano: TipoPlano,
  currentUserId?: string | null
): Promise<{ success: boolean; synced: boolean }> {
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (currentUserId) {
      enqueueSync({ id: cliente.id, userId: currentUserId, type: 'save_cliente', payload: cliente });
    }
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      if (currentUserId) {
        enqueueSync({ id: cliente.id, userId: currentUserId, type: 'save_cliente', payload: cliente });
      }
      return { success: true, synced: false };
    }

    const activeUserId = authData.user.id;
    if (currentUserId && currentUserId !== activeUserId) {
      return { success: false, synced: false };
    }

    const payload = mapClienteToDb(cliente, activeUserId);
    const { error } = await supabase.from('clientes').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Erro ao sincronizar cliente no Supabase, enfileirado:', error);
      enqueueSync({ id: cliente.id, userId: activeUserId, type: 'save_cliente', payload: cliente });
      return { success: true, synced: false };
    }

    dequeueSync(activeUserId, cliente.id, 'save_cliente');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao salvar cliente no Supabase:', err);
    if (currentUserId) {
      enqueueSync({ id: cliente.id, userId: currentUserId, type: 'save_cliente', payload: cliente });
    }
    return { success: true, synced: false };
  }
}

export async function syncDeleteCliente(
  clienteId: string,
  plano: TipoPlano,
  currentUserId?: string | null
): Promise<{ success: boolean; synced: boolean }> {
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (currentUserId) {
      enqueueSync({ id: clienteId, userId: currentUserId, type: 'delete_cliente', payload: { id: clienteId } });
    }
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      if (currentUserId) {
        enqueueSync({ id: clienteId, userId: currentUserId, type: 'delete_cliente', payload: { id: clienteId } });
      }
      return { success: true, synced: false };
    }

    const activeUserId = authData.user.id;
    if (currentUserId && currentUserId !== activeUserId) {
      return { success: false, synced: false };
    }

    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', clienteId)
      .eq('user_id', activeUserId);

    if (error) {
      console.warn('Erro ao deletar cliente no Supabase, enfileirado:', error);
      enqueueSync({ id: clienteId, userId: activeUserId, type: 'delete_cliente', payload: { id: clienteId } });
      return { success: true, synced: false };
    }

    dequeueSync(activeUserId, clienteId, 'delete_cliente');
    dequeueSync(activeUserId, clienteId, 'save_cliente');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao deletar cliente no Supabase:', err);
    if (currentUserId) {
      enqueueSync({ id: clienteId, userId: currentUserId, type: 'delete_cliente', payload: { id: clienteId } });
    }
    return { success: true, synced: false };
  }
}

// Processa fila offline quando houver conexão e plano PRO/TURBO garantindo isolamento por usuário
export async function flushPendingSyncQueue(
  plano: TipoPlano,
  currentUserId?: string | null
): Promise<void> {
  if (!isCloudSyncEnabled(plano)) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return;

  const activeUserId = authData.user.id;
  if (currentUserId && currentUserId !== activeUserId) {
    console.warn('flushPendingSyncQueue abortado: currentUserId difere do usuário logado no Supabase.');
    return;
  }

  const queue = getSyncQueue(activeUserId);
  if (queue.length === 0) return;

  const remainingQueue: PendingSyncItem[] = [];

  for (const item of queue) {
    // REGRA DE ISOLAMENTO: Descarta qualquer item que não pertença a este usuário
    if (item.userId !== activeUserId) {
      console.warn('Item offline ignorado por violar isolamento multi-tenant:', item.id);
      continue;
    }

    try {
      if (item.type === 'save_orcamento') {
        const payload = mapOrcamentoToDb(item.payload, activeUserId);
        const { error } = await supabase.from('orcamentos').upsert(payload, { onConflict: 'id' });
        if (error) {
          const isQuota =
            error.code === 'P0001' ||
            error.message?.includes('QUOTA_EXCEEDED') ||
            error.message?.includes('Limite mensal');
          if (!isQuota) {
            remainingQueue.push(item);
          }
        }
      } else if (item.type === 'delete_orcamento') {
        const { error } = await supabase
          .from('orcamentos')
          .delete()
          .eq('id', item.id)
          .eq('user_id', activeUserId);
        if (error) remainingQueue.push(item);
      } else if (item.type === 'save_cliente') {
        const payload = mapClienteToDb(item.payload, activeUserId);
        const { error } = await supabase.from('clientes').upsert(payload, { onConflict: 'id' });
        if (error) remainingQueue.push(item);
      } else if (item.type === 'delete_cliente') {
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('id', item.id)
          .eq('user_id', activeUserId);
        if (error) remainingQueue.push(item);
      }
    } catch {
      remainingQueue.push(item);
    }
  }

  saveSyncQueue(activeUserId, remainingQueue);
}
