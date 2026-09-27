import { Orcamento, Cliente, TipoPlano, ItemOrcamento, StatusOrcamento } from '../types';
import { getSupabase } from './supabase';

const SYNC_QUEUE_KEY = 'fechazap_pending_sync_queue_v1';

export interface PendingSyncItem {
  id: string;
  type: 'save_orcamento' | 'delete_orcamento' | 'save_cliente' | 'delete_cliente';
  payload: any;
  timestamp: number;
}

export function isCloudSyncEnabled(plano: TipoPlano): boolean {
  return plano === 'PRO' || plano === 'TURBO';
}

function getSyncQueue(): PendingSyncItem[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSyncQueue(queue: PendingSyncItem[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

function enqueueSync(item: Omit<PendingSyncItem, 'timestamp'>): void {
  const queue = getSyncQueue();
  // Se já existir operação pendente com mesmo ID e tipo, substitui
  const filtered = queue.filter((q) => !(q.id === item.id && q.type === item.type));
  filtered.push({ ...item, timestamp: Date.now() });
  saveSyncQueue(filtered);
}

function dequeueSync(id: string, type: PendingSyncItem['type']): void {
  const queue = getSyncQueue();
  const filtered = queue.filter((q) => !(q.id === id && q.type === type));
  saveSyncQueue(filtered);
}

// ==========================================
// Mapeadores DB <-> Frontend
// ==========================================

export function mapDbToOrcamento(row: any): Orcamento {
  const validStatus: StatusOrcamento = ['pendente', 'enviado', 'aprovado', 'recusado'].includes(row.status)
    ? row.status
    : 'pendente';

  return {
    id: String(row.id),
    numero: String(row.numero || '101'),
    clienteId: row.cliente_id ? String(row.cliente_id) : '',
    clienteNome: row.cliente_nome || 'Cliente',
    clienteTelefone: row.cliente_telefone || '',
    itens: Array.isArray(row.itens) ? (row.itens as ItemOrcamento[]) : [],
    subtotal: Number(row.subtotal) || 0,
    descontoTipo: row.desconto_tipo === 'porcentagem' ? 'porcentagem' : 'valor',
    descontoValor: Number(row.desconto_valor) || 0,
    valorTotal: Number(row.valor_total) || 0,
    status: validStatus,
    dataCriacao: row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    dataValidade: row.data_validade ? String(row.data_validade).slice(0, 10) : '',
    formaPagamento: row.forma_pagamento || '',
    prazoEntrega: row.prazo_entrega || '',
    observacoes: row.observacoes || undefined,
    termosGarantia: row.termos_garantia || undefined,
  };
}

export function mapOrcamentoToDb(orc: Orcamento, userId: string): Record<string, any> {
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

export function mapDbToCliente(row: any): Cliente {
  return {
    id: String(row.id),
    nome: row.nome || 'Cliente',
    telefone: row.telefone || '',
    email: row.email || undefined,
    documento: row.documento || undefined,
    cidade: row.cidade || undefined,
    endereco: row.endereco || undefined,
    observacoes: row.observacoes || undefined,
    dataCadastro: row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    totalOrcamentos: 0,
    valorTotalGasto: 0,
  };
}

export function mapClienteToDb(cli: Cliente, userId: string): Record<string, any> {
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

export async function syncSaveOrcamento(
  orcamento: Orcamento,
  plano: TipoPlano
): Promise<{ success: boolean; synced: boolean }> {
  // Se for GRATUITO, mantém 100% local sem tocar o Supabase
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    enqueueSync({ id: orcamento.id, type: 'save_orcamento', payload: orcamento });
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      enqueueSync({ id: orcamento.id, type: 'save_orcamento', payload: orcamento });
      return { success: true, synced: false };
    }

    const payload = mapOrcamentoToDb(orcamento, authData.user.id);
    const { error } = await supabase.from('orcamentos').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Erro ao sincronizar orçamento no Supabase, adicionado à fila:', error);
      enqueueSync({ id: orcamento.id, type: 'save_orcamento', payload: orcamento });
      return { success: true, synced: false };
    }

    dequeueSync(orcamento.id, 'save_orcamento');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao gravar orçamento no Supabase:', err);
    enqueueSync({ id: orcamento.id, type: 'save_orcamento', payload: orcamento });
    return { success: true, synced: false };
  }
}

export async function syncDeleteOrcamento(
  orcamentoId: string,
  plano: TipoPlano
): Promise<{ success: boolean; synced: boolean }> {
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    enqueueSync({ id: orcamentoId, type: 'delete_orcamento', payload: { id: orcamentoId } });
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      enqueueSync({ id: orcamentoId, type: 'delete_orcamento', payload: { id: orcamentoId } });
      return { success: true, synced: false };
    }

    const { error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('id', orcamentoId)
      .eq('user_id', authData.user.id);

    if (error) {
      console.warn('Erro ao deletar orçamento no Supabase, enfileirado:', error);
      enqueueSync({ id: orcamentoId, type: 'delete_orcamento', payload: { id: orcamentoId } });
      return { success: true, synced: false };
    }

    dequeueSync(orcamentoId, 'delete_orcamento');
    dequeueSync(orcamentoId, 'save_orcamento');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao deletar orçamento no Supabase:', err);
    enqueueSync({ id: orcamentoId, type: 'delete_orcamento', payload: { id: orcamentoId } });
    return { success: true, synced: false };
  }
}

export async function syncSaveCliente(
  cliente: Cliente,
  plano: TipoPlano
): Promise<{ success: boolean; synced: boolean }> {
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    enqueueSync({ id: cliente.id, type: 'save_cliente', payload: cliente });
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      enqueueSync({ id: cliente.id, type: 'save_cliente', payload: cliente });
      return { success: true, synced: false };
    }

    const payload = mapClienteToDb(cliente, authData.user.id);
    const { error } = await supabase.from('clientes').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Erro ao sincronizar cliente no Supabase, enfileirado:', error);
      enqueueSync({ id: cliente.id, type: 'save_cliente', payload: cliente });
      return { success: true, synced: false };
    }

    dequeueSync(cliente.id, 'save_cliente');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao salvar cliente no Supabase:', err);
    enqueueSync({ id: cliente.id, type: 'save_cliente', payload: cliente });
    return { success: true, synced: false };
  }
}

export async function syncDeleteCliente(
  clienteId: string,
  plano: TipoPlano
): Promise<{ success: boolean; synced: boolean }> {
  if (!isCloudSyncEnabled(plano)) {
    return { success: true, synced: false };
  }

  const supabase = getSupabase();
  if (!supabase) {
    enqueueSync({ id: clienteId, type: 'delete_cliente', payload: { id: clienteId } });
    return { success: true, synced: false };
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      enqueueSync({ id: clienteId, type: 'delete_cliente', payload: { id: clienteId } });
      return { success: true, synced: false };
    }

    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', clienteId)
      .eq('user_id', authData.user.id);

    if (error) {
      console.warn('Erro ao deletar cliente no Supabase, enfileirado:', error);
      enqueueSync({ id: clienteId, type: 'delete_cliente', payload: { id: clienteId } });
      return { success: true, synced: false };
    }

    dequeueSync(clienteId, 'delete_cliente');
    dequeueSync(clienteId, 'save_cliente');
    return { success: true, synced: true };
  } catch (err) {
    console.warn('Exceção ao deletar cliente no Supabase:', err);
    enqueueSync({ id: clienteId, type: 'delete_cliente', payload: { id: clienteId } });
    return { success: true, synced: false };
  }
}

// Processa fila offline quando houver conexão e plano PRO/TURBO
export async function flushPendingSyncQueue(plano: TipoPlano): Promise<void> {
  if (!isCloudSyncEnabled(plano)) return;
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return;

  const remainingQueue: PendingSyncItem[] = [];

  for (const item of queue) {
    try {
      if (item.type === 'save_orcamento') {
        const payload = mapOrcamentoToDb(item.payload, authData.user.id);
        const { error } = await supabase.from('orcamentos').upsert(payload, { onConflict: 'id' });
        if (error) remainingQueue.push(item);
      } else if (item.type === 'delete_orcamento') {
        const { error } = await supabase
          .from('orcamentos')
          .delete()
          .eq('id', item.id)
          .eq('user_id', authData.user.id);
        if (error) remainingQueue.push(item);
      } else if (item.type === 'save_cliente') {
        const payload = mapClienteToDb(item.payload, authData.user.id);
        const { error } = await supabase.from('clientes').upsert(payload, { onConflict: 'id' });
        if (error) remainingQueue.push(item);
      } else if (item.type === 'delete_cliente') {
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('id', item.id)
          .eq('user_id', authData.user.id);
        if (error) remainingQueue.push(item);
      }
    } catch {
      remainingQueue.push(item);
    }
  }

  saveSyncQueue(remainingQueue);
}
