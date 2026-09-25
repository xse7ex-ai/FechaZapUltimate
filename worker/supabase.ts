// Cloudflare Worker - Módulo de Autenticação Supabase, Planos e Quotas de IA (3.1.6)
// HARDENING 3.1.6: Remoção total de fallbacks de quota. Falha estritamente FECHADA (Fail-Closed).
import { Env, UserAuthContext, QuotaCheckResult, ConsumeQuotaResult, TipoPlano } from './types';

export const QUOTA_LIMITS: Record<TipoPlano, number> = {
  GRATUITO: 10,
  PRO: 250,
  TURBO: 1500,
};

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

// Consumo Atômico de Quota de IA (Prevenção Absoluta de Race Conditions)
// Invoca exclusivamente a função RPC transacional no Postgres com 'SELECT FOR UPDATE'
// REGRA 3.1.6: FALHA FECHADA. Se a RPC falhar, não estiver disponível ou der erro de rede,
// retorna ok=false (HTTP 503). NÃO há fallback em memória, KV ou permissão silenciosa.
export async function consumeAtomicAiQuota(
  env: Env,
  userId: string,
  tipoOperacao: string,
  modelo: string = 'gemini-3.8-flash'
): Promise<ConsumeQuotaResult> {
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Sem credenciais do banco Supabase ou ID inválido -> FALHA FECHADA IMEDIATA
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !userId || userId === 'anon') {
    return {
      ok: false,
      allowed: false,
      plano: 'GRATUITO',
      used: 0,
      limit: 10,
      remaining: 0,
      month: currentMonth,
      error: 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
    };
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');

  try {
    // Chama RPC atômica do Supabase protegida para service_role
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
        ok: true,
        allowed: Boolean(data.allowed),
        plano: (data.plano as TipoPlano) || 'GRATUITO',
        used: Number(data.used) || 0,
        limit: Number(data.limit) || QUOTA_LIMITS.GRATUITO,
        remaining: Number(data.remaining) || 0,
        month: data.month || currentMonth,
      };
    } else {
      const errText = await rpcRes.text().catch(() => '');
      console.error(`[Supabase RPC Error] consume_ai_quota falhou com HTTP ${rpcRes.status}:`, errText);
      // FALHA FECHADA: Bloqueia consumo e retorna 503
      return {
        ok: false,
        allowed: false,
        plano: 'GRATUITO',
        used: 0,
        limit: 10,
        remaining: 0,
        month: currentMonth,
        error: 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
      };
    }
  } catch (err: any) {
    console.error('[Supabase RPC Exception] Falha de comunicação com consume_ai_quota:', err?.message || err);
    // FALHA FECHADA: Erro de rede ou indisponibilidade bloqueia consumo com 503
    return {
      ok: false,
      allowed: false,
      plano: 'GRATUITO',
      used: 0,
      limit: 10,
      remaining: 0,
      month: currentMonth,
      error: 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
    };
  }
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
    
    // Tenta primeiro via RPC check_ai_quota autorizada para service_role
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/check_ai_quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_uuid: user.id,
      }),
    });

    if (rpcRes.ok) {
      const data: any = await rpcRes.json();
      return {
        allowed: Boolean(data.allowed),
        plano: (data.plano as TipoPlano) || user.plano,
        used: Number(data.used) || 0,
        limit: Number(data.limit) || limit,
        remaining: Number(data.remaining) || 0,
        month: data.month || currentMonth,
      };
    }

    // Consulta de leitura de fallback apenas para display no GET /api/auth/me
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
