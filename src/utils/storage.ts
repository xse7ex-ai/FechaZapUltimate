import { Orcamento, Cliente, ConfiguracaoEmpresa, MensagemWhatsApp } from '../types';
import { INITIAL_ORCAMENTOS, INITIAL_CLIENTES, INITIAL_EMPRESA_CONFIG } from '../data/initialData';

// Prefixos de namespace para isolamento rigoroso
const PREFIX_USER = 'fechazap_user_';
const PREFIX_ANON = 'fechazap_anon_';

// Chaves legadas globais (para verificação de migração controlada)
export const LEGACY_STORAGE_KEYS = {
  ORCAMENTOS: 'fechazap_orcamentos_v3',
  CLIENTES: 'fechazap_clientes_v3',
  EMPRESA: 'fechazap_empresa_v3',
  MENSAGENS: 'fechazap_mensagens_whatsapp',
  SYNC_QUEUE: 'fechazap_pending_sync_queue_v1',
  MIGRATED_FLAG: 'fechazap_legacy_migrated_v1',
} as const;

export type StorageResource = 'orcamentos' | 'clientes' | 'empresa' | 'mensagens' | 'sync_queue';

/**
 * Retorna a chave com namespace isolado para o usuário especificado.
 * Exemplo autenticado: 'fechazap_user_123e4567-e89b-12d3-a456-426614174000_orcamentos'
 * Exemplo visitante:   'fechazap_anon_orcamentos'
 */
export function getUserStorageKey(userId: string | null | undefined, resource: StorageResource): string {
  const cleanId = typeof userId === 'string' ? userId.trim() : '';
  if (cleanId) {
    return `${PREFIX_USER}${cleanId}_${resource}`;
  }
  return `${PREFIX_ANON}${resource}`;
}

/**
 * Leitura genérica segura do LocalStorage com fallback
 */
export function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Gravação genérica segura no LocalStorage
 */
export function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[CLOSI Storage] Falha ao gravar chave "${key}":`, err);
  }
}

/**
 * Remoção de chave
 */
export function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ==========================================
// Orçamentos
// ==========================================
export function loadUserOrcamentos(userId: string | null | undefined): Orcamento[] {
  const key = getUserStorageKey(userId, 'orcamentos');
  const stored = getStorageItem<Orcamento[] | null>(key, null);
  if (stored !== null && Array.isArray(stored)) {
    return stored;
  }
  // Se for visitante anônimo pela primeira vez, carrega exemplos iniciais
  if (!userId) {
    return INITIAL_ORCAMENTOS;
  }
  // Usuário autenticado começa com lista vazia (a sincronização na nuvem trará seus dados)
  return [];
}

export function saveUserOrcamentos(userId: string | null | undefined, orcamentos: Orcamento[]): void {
  const key = getUserStorageKey(userId, 'orcamentos');
  setStorageItem(key, orcamentos);
}

// ==========================================
// Clientes
// ==========================================
export function loadUserClientes(userId: string | null | undefined): Cliente[] {
  const key = getUserStorageKey(userId, 'clientes');
  const stored = getStorageItem<Cliente[] | null>(key, null);
  if (stored !== null && Array.isArray(stored)) {
    return stored;
  }
  if (!userId) {
    return INITIAL_CLIENTES;
  }
  return [];
}

export function saveUserClientes(userId: string | null | undefined, clientes: Cliente[]): void {
  const key = getUserStorageKey(userId, 'clientes');
  setStorageItem(key, clientes);
}

// ==========================================
// Empresa / Configurações
// ==========================================
export function loadUserEmpresa(userId: string | null | undefined): ConfiguracaoEmpresa {
  const key = getUserStorageKey(userId, 'empresa');
  const stored = getStorageItem<ConfiguracaoEmpresa | null>(key, null);
  if (stored !== null && typeof stored === 'object') {
    return stored;
  }
  // Se for visitante anônimo pela primeira vez, carrega dados de exemplo
  if (!userId) {
    return INITIAL_EMPRESA_CONFIG;
  }
  // Usuário autenticado sem configuração salva começa com campos vazios
  return {
    nomeFantasia: '',
    razaoSocial: '',
    cnpj: '',
    telefone: '',
    email: '',
    chavePix: '',
    tipoChavePix: 'cnpj',
    endereco: '',
    cidadeEstado: '',
    logoUrl: '',
    mensagemPadraoWhatsapp: INITIAL_EMPRESA_CONFIG.mensagemPadraoWhatsapp,
    modeloIA: INITIAL_EMPRESA_CONFIG.modeloIA || 'gemini-3.8-flash',
  };
}

export function saveUserEmpresa(userId: string | null | undefined, empresa: ConfiguracaoEmpresa): void {
  const key = getUserStorageKey(userId, 'empresa');
  setStorageItem(key, empresa);
}

// ==========================================
// Mensagens WhatsApp
// ==========================================
export function loadUserMensagens(userId: string | null | undefined): MensagemWhatsApp[] {
  const key = getUserStorageKey(userId, 'mensagens');
  return getStorageItem<MensagemWhatsApp[]>(key, []);
}

export function saveUserMensagens(userId: string | null | undefined, mensagens: MensagemWhatsApp[]): void {
  const key = getUserStorageKey(userId, 'mensagens');
  setStorageItem(key, mensagens);
}

// ==========================================
// Fila Offline (PendingSyncItem)
// ==========================================
export function loadUserSyncQueue<T>(userId: string | null | undefined): T[] {
  const key = getUserStorageKey(userId, 'sync_queue');
  return getStorageItem<T[]>(key, []);
}

export function saveUserSyncQueue<T>(userId: string | null | undefined, queue: T[]): void {
  const key = getUserStorageKey(userId, 'sync_queue');
  setStorageItem(key, queue);
}

// ==========================================
// Migração Explícita de Dados Legados
// ==========================================
export interface LegacyDataSummary {
  hasLegacy: boolean;
  orcamentosCount: number;
  clientesCount: number;
  hasEmpresa: boolean;
}

export function checkLegacyData(): LegacyDataSummary {
  try {
    const alreadyMigrated = localStorage.getItem(LEGACY_STORAGE_KEYS.MIGRATED_FLAG);
    if (alreadyMigrated === 'true') {
      return { hasLegacy: false, orcamentosCount: 0, clientesCount: 0, hasEmpresa: false };
    }

    const rawOrc = localStorage.getItem(LEGACY_STORAGE_KEYS.ORCAMENTOS);
    const rawCli = localStorage.getItem(LEGACY_STORAGE_KEYS.CLIENTES);
    const rawEmp = localStorage.getItem(LEGACY_STORAGE_KEYS.EMPRESA);

    const orcs: Orcamento[] = rawOrc ? JSON.parse(rawOrc) : [];
    const clis: Cliente[] = rawCli ? JSON.parse(rawCli) : [];

    const hasLegacy = Boolean(
      (Array.isArray(orcs) && orcs.length > 0) ||
      (Array.isArray(clis) && clis.length > 0) ||
      Boolean(rawEmp)
    );

    return {
      hasLegacy,
      orcamentosCount: Array.isArray(orcs) ? orcs.length : 0,
      clientesCount: Array.isArray(clis) ? clis.length : 0,
      hasEmpresa: Boolean(rawEmp),
    };
  } catch {
    return { hasLegacy: false, orcamentosCount: 0, clientesCount: 0, hasEmpresa: false };
  }
}

/**
 * Migra dados legados globais exclusivamente após confirmação explícita do usuário
 */
export function migrateLegacyDataToUser(targetUserId: string | null | undefined): {
  success: boolean;
  migratedOrcamentos: number;
  migratedClientes: number;
} {
  try {
    const rawOrc = localStorage.getItem(LEGACY_STORAGE_KEYS.ORCAMENTOS);
    const rawCli = localStorage.getItem(LEGACY_STORAGE_KEYS.CLIENTES);
    const rawEmp = localStorage.getItem(LEGACY_STORAGE_KEYS.EMPRESA);
    const rawMsg = localStorage.getItem(LEGACY_STORAGE_KEYS.MENSAGENS);

    let orcCount = 0;
    let cliCount = 0;

    if (rawOrc) {
      const orcs: Orcamento[] = JSON.parse(rawOrc);
      if (Array.isArray(orcs) && orcs.length > 0) {
        const current = loadUserOrcamentos(targetUserId);
        const existingIds = new Set(current.map((c) => c.id));
        const toAdd = orcs.filter((o) => !existingIds.has(o.id));
        saveUserOrcamentos(targetUserId, [...current, ...toAdd]);
        orcCount = toAdd.length;
      }
    }

    if (rawCli) {
      const clis: Cliente[] = JSON.parse(rawCli);
      if (Array.isArray(clis) && clis.length > 0) {
        const current = loadUserClientes(targetUserId);
        const existingIds = new Set(current.map((c) => c.id));
        const toAdd = clis.filter((c) => !existingIds.has(c.id));
        saveUserClientes(targetUserId, [...current, ...toAdd]);
        cliCount = toAdd.length;
      }
    }

    if (rawEmp) {
      const emp = JSON.parse(rawEmp);
      saveUserEmpresa(targetUserId, emp);
    }

    if (rawMsg) {
      const msgs = JSON.parse(rawMsg);
      if (Array.isArray(msgs)) {
        saveUserMensagens(targetUserId, msgs);
      }
    }

    dismissLegacyData();
    return { success: true, migratedOrcamentos: orcCount, migratedClientes: cliCount };
  } catch (err) {
    console.warn('Erro ao migrar dados legados:', err);
    return { success: false, migratedOrcamentos: 0, migratedClientes: 0 };
  }
}

/**
 * Remove com segurança as chaves legadas globais
 */
export function dismissLegacyData(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEYS.ORCAMENTOS);
    localStorage.removeItem(LEGACY_STORAGE_KEYS.CLIENTES);
    localStorage.removeItem(LEGACY_STORAGE_KEYS.EMPRESA);
    localStorage.removeItem(LEGACY_STORAGE_KEYS.MENSAGENS);
    localStorage.removeItem(LEGACY_STORAGE_KEYS.SYNC_QUEUE);
    localStorage.setItem(LEGACY_STORAGE_KEYS.MIGRATED_FLAG, 'true');
  } catch {
    // ignore
  }
}

/**
 * Apaga as chaves de armazenamento do namespace anônimo/demonstração.
 * Ao recarregar com userId = null, os dados originais (INITIAL_ORCAMENTOS, INITIAL_CLIENTES, INITIAL_EMPRESA_CONFIG)
 * voltam a ser carregados puros.
 */
export function resetDemoData(): void {
  try {
    removeStorageItem(getUserStorageKey(null, 'orcamentos'));
    removeStorageItem(getUserStorageKey(null, 'clientes'));
    removeStorageItem(getUserStorageKey(null, 'empresa'));
    removeStorageItem(getUserStorageKey(null, 'mensagens'));
    removeStorageItem(getUserStorageKey(null, 'sync_queue'));
  } catch (err) {
    console.warn('[CLOSI Storage] Falha ao resetar dados de demonstração:', err);
  }
}
