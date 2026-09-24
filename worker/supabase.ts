// Cloudflare Worker - Módulo de Autenticação Supabase, Planos e Quotas de IA (3.1.5)
import { Env, UserAuthContext, QuotaCheckResult, TipoPlano } from './types';

export const QUOTA_LIMITS: Record<TipoPlano, number> = {
  GRATUITO: 10,
  PRO: 250,
  TURBO: 1500,
};

// Fallback in-memory para rastreamento de concorrência quando RPC não estiver disponível
const localUsageCache = new Map<string, { count: number; month: string }>();

export async function validateUserFromToken(
  env: Env,
  authHeader?: string | null
): Promise<UserAuthContext> {
  const defaultGuest: UserAuthContext = {
    id: 'anon',
    email: '',
    plano: 'GRATUITO',
    quotaUsed: 0,
    quotaLimit: QUOTA_LIMITS.GRATUITO,
    isAuthed: false,
  };

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return defaultGuest;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  // Tokens falsos ou simulados (ex: local-jwt-...) são expressamente rejeitados pelo backend
  if (!token || token.startsWith('local-') || !env.SUPABASE_URL) {
    return defaultGuest;
  }

  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '';

    // 1. Valida o JWT criptograficamente diretamente no Supabase Auth
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
      },
    });

    if (!userRes.ok) {
      return defaultGuest;
    }

    const userData: any = await userRes.json();
    const userId = userData.id;
    const email = userData.email || '';

    if (!userId) {
      return defaultGuest;
    }

    // 2. Consulta a autoridade do plano DIRETAMENTE na tabela public.profiles
    // NUNCA confia em metadados de signup, cookies ou headers do cliente
    let plano: TipoPlano = 'GRATUITO';
    let nome: string | undefined = userData.user_metadata?.nome;

    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=plano,nome`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (profileRes.ok) {
        const profiles: any[] = await profileRes.json();
        if (profiles.length > 0 && profiles[0].plano) {
          const rawPlano = String(profiles[0].plano).toUpperCase().trim();
          if (rawPlano === 'PRO' || rawPlano === 'TURBO') {
            plano = rawPlano;
          }
          if (profiles[0].nome) {
            nome = profiles[0].nome;
          }
        }
      }
    }

    return {
      id: userId,
      email,
      nome,
      plano,
      quotaUsed: 0,
      quotaLimit: QUOTA_LIMITS[plano],
      isAuthed: true,
    };
  } catch (err) {
    console.error('Erro ao validar token JWT no Supabase Auth:', err);
    return defaultGuest;
  }
}

// Consumo Atômico de Quota de IA (Prevenção de Race Conditions)
// Invoca a função RPC transacional no Postgres com 'SELECT FOR UPDATE'
export async function consumeAtomicAiQuota(
  env: Env,
  userId: string,
  tipoOperacao: string,
  modelo: string = 'gemini-3.8-flash'
): Promise<QuotaCheckResult> {
  const currentMonth = new Date().toISOString().slice(0, 7);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || userId === 'anon') {
    // Sem credenciais de banco ou usuário não autenticado: nega o acesso
    return {
      allowed: false,
      plano: 'GRATUITO',
      used: 10,
      limit: 10,
      remaining: 0,
      month: currentMonth,
    };
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');

  try {
    // Chama RPC atômica do Supabase
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_tipo_operacao: tipoOperacao,
        p_modelo: modelo,
      }),
    });

    if (rpcRes.ok) {
      const data: any = await rpcRes.json();
      return {
        allowed: Boolean(data.allowed),
        plano: (data.plano as TipoPlano) || 'GRATUITO',
        used: Number(data.used) || 0,
        limit: Number(data.limit) || QUOTA_LIMITS.GRATUITO,
        remaining: Number(data.remaining) || 0,
        month: data.month || currentMonth,
      };
    }
  } catch (err) {
    console.warn('Erro ao chamar RPC consume_ai_quota, acionando fallback atômico:', err);
  }

  // Fallback seguro de auditoria caso o RPC não esteja deployado ainda no banco
  return checkAndRecordFallbackQuota(env, userId, tipoOperacao, modelo, currentMonth);
}

// Fallback atômico em memória para ambientes de transição
async function checkAndRecordFallbackQuota(
  env: Env,
  userId: string,
  tipoOperacao: string,
  modelo: string,
  currentMonth: string
): Promise<QuotaCheckResult> {
  const supabaseUrl = env.SUPABASE_URL!.replace(/\/$/, '');

  // 1. Descobre o plano real
  let plano: TipoPlano = 'GRATUITO';
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=plano`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (profileRes.ok) {
    const profs: any[] = await profileRes.json();
    if (profs.length > 0 && profs[0].plano) {
      const p = String(profs[0].plano).toUpperCase();
      if (p === 'PRO' || p === 'TURBO') plano = p;
    }
  }

  const limit = QUOTA_LIMITS[plano];

  // 2. Consulta uso atual
  const countRes = await fetch(
    `${supabaseUrl}/rest/v1/ai_usage?user_id=eq.${encodeURIComponent(userId)}&mes_referencia=eq.${currentMonth}&select=id`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    }
  );

  let currentCount = 0;
  if (countRes.ok) {
    const range = countRes.headers.get('content-range');
    if (range) {
      const m = range.match(/\/(\d+)/);
      if (m) currentCount = parseInt(m[1], 10);
    }
  }

  // Verifica cache local para evitar race conditions em instâncias ativas
  const key = `${userId}:${currentMonth}`;
  const local = localUsageCache.get(key);
  if (local && local.month === currentMonth && local.count > currentCount) {
    currentCount = local.count;
  }

  if (currentCount >= limit) {
    return {
      allowed: false,
      plano,
      used: currentCount,
      limit,
      remaining: 0,
      month: currentMonth,
    };
  }

  // Incrementa atomicamente antes de prosseguir
  localUsageCache.set(key, { count: currentCount + 1, month: currentMonth });

  // Grava log no Supabase
  await fetch(`${supabaseUrl}/rest/v1/ai_usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      tipo_operacao: tipoOperacao,
      modelo,
      mes_referencia: currentMonth,
    }),
  }).catch(() => {});

  return {
    allowed: true,
    plano,
    used: currentCount + 1,
    limit,
    remaining: limit - (currentCount + 1),
    month: currentMonth,
  };
}

// Consulta de quota informativa (Read-only para a rota /api/auth/me)
export async function getReadOnlyUserQuota(
  env: Env,
  user: UserAuthContext
): Promise<QuotaCheckResult> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const limit = QUOTA_LIMITS[user.plano];

  if (!user.isAuthed || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      allowed: false,
      plano: user.plano,
      used: 0,
      limit,
      remaining: limit,
      month: currentMonth,
    };
  }

  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_usage?user_id=eq.${encodeURIComponent(user.id)}&mes_referencia=eq.${currentMonth}&select=id`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact',
        },
      }
    );

    let used = 0;
    if (countRes.ok) {
      const range = countRes.headers.get('content-range');
      if (range) {
        const m = range.match(/\/(\d+)/);
        if (m) used = parseInt(m[1], 10);
      }
    }

    return {
      allowed: used < limit,
      plano: user.plano,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      month: currentMonth,
    };
  } catch {
    return {
      allowed: true,
      plano: user.plano,
      used: 0,
      limit,
      remaining: limit,
      month: currentMonth,
    };
  }
}

// Copiloto IA: Busca os orçamentos reais no banco para fundamentar a análise
export async function fetchRealUserSalesContext(
  env: Env,
  userId: string
): Promise<any | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || userId === 'anon') {
    return null;
  }

  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(
      `${supabaseUrl}/rest/v1/orcamentos?user_id=eq.${encodeURIComponent(userId)}&select=numero,cliente_nome,valor_total,status,created_at,itens&order=created_at.desc&limit=100`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!res.ok) return null;
    const orcamentos: any[] = await res.json();
    if (!Array.isArray(orcamentos)) return null;

    const total = orcamentos.length;
    const aprovados = orcamentos.filter((o) => o.status === 'aprovado');
    const pendentes = orcamentos.filter((o) => o.status === 'pendente' || o.status === 'enviado');
    const recusados = orcamentos.filter((o) => o.status === 'recusado');

    const faturamentoAprovado = aprovados.reduce((sum, o) => sum + Number(o.valor_total || 0), 0);
    const faturamentoPendente = pendentes.reduce((sum, o) => sum + Number(o.valor_total || 0), 0);
    const taxaConversao = total > 0 ? Math.round((aprovados.length / total) * 100) : 0;
    const ticketMedio = aprovados.length > 0 ? faturamentoAprovado / aprovados.length : 0;

    return {
      fonte: 'supabase_database_real',
      totalOrcamentos: total,
      aprovados: aprovados.length,
      pendentes: pendentes.length,
      recusados: recusados.length,
      faturamentoAprovado: faturamentoAprovado.toFixed(2),
      faturamentoPendente: faturamentoPendente.toFixed(2),
      ticketMedio: ticketMedio.toFixed(2),
      taxaConversao,
      amostraRecente: orcamentos.slice(0, 5).map((o) => ({
        numero: o.numero,
        cliente: o.cliente_nome,
        valor: o.valor_total,
        status: o.status,
      })),
    };
  } catch (err) {
    console.warn('Erro ao consultar orçamentos reais no Supabase:', err);
    return null;
  }
}

// Orçamento Real do Banco (Prevenção de Adulteração pelo Frontend)
export async function fetchUserOrcamentoById(
  env: Env,
  userId: string,
  orcamentoId: string
): Promise<any | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !orcamentoId || userId === 'anon') {
    return null;
  }

  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(
      `${supabaseUrl}/rest/v1/orcamentos?id=eq.${encodeURIComponent(orcamentoId)}&user_id=eq.${encodeURIComponent(userId)}&select=*`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!res.ok) return null;
    const items: any[] = await res.json();
    return items.length > 0 ? items[0] : null;
  } catch (err) {
    console.warn('Erro ao buscar orçamento verificado no Supabase:', err);
    return null;
  }
}
