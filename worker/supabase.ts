// Cloudflare Worker - Módulo de Autenticação Supabase, Planos e Quotas de IA
import { Env, UserAuthContext, QuotaCheckResult, TipoPlano } from './types';

const QUOTA_LIMITS: Record<TipoPlano, number> = {
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
  if (!token || !env.SUPABASE_URL) {
    return defaultGuest;
  }

  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '';

    // Valida JWT diretamente no endpoint de autenticação do Supabase
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

    // Se temos SERVICE_ROLE_KEY, consultamos a autoridade do plano no banco
    let plano: TipoPlano = 'GRATUITO';
    let quotaUsed = 0;

    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      // 1. Busca perfil do usuário
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=plano,nome,empresa_nome`,
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
          const rawPlano = profiles[0].plano.toUpperCase();
          if (rawPlano === 'PRO' || rawPlano === 'TURBO') {
            plano = rawPlano;
          }
        }
      }

      // 2. Conta uso no mês corrente
      const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      const usageRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_usage?user_id=eq.${userId}&mes_referencia=eq.${currentMonth}&select=id`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: 'count=exact',
          },
        }
      );

      if (usageRes.ok) {
        const contentRange = usageRes.headers.get('content-range');
        if (contentRange) {
          const totalMatch = contentRange.match(/\/(\d+)/);
          if (totalMatch) {
            quotaUsed = parseInt(totalMatch[1], 10);
          }
        } else {
          const rows: any[] = await usageRes.json();
          quotaUsed = rows.length;
        }
      }
    }

    return {
      id: userId,
      email,
      nome: userData.user_metadata?.nome,
      plano,
      quotaUsed,
      quotaLimit: QUOTA_LIMITS[plano],
      isAuthed: true,
    };
  } catch (err) {
    console.error('Erro ao validar JWT com Supabase:', err);
    return defaultGuest;
  }
}

export function checkQuota(user: UserAuthContext): QuotaCheckResult {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const limit = QUOTA_LIMITS[user.plano];
  const allowed = user.quotaUsed < limit;

  return {
    allowed,
    plano: user.plano,
    used: user.quotaUsed,
    limit,
    month: currentMonth,
  };
}

export async function recordAiUsage(
  env: Env,
  userId: string,
  tipoOperacao: string,
  modelo: string
): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || userId === 'anon') {
    return;
  }

  try {
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const currentMonth = new Date().toISOString().slice(0, 7);

    await fetch(`${supabaseUrl}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        tipo_operacao: tipoOperacao,
        modelo,
        mes_referencia: currentMonth,
      }),
    });
  } catch (err) {
    console.warn('Erro ao registrar log de uso de IA:', err);
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
      `${supabaseUrl}/rest/v1/orcamentos?user_id=eq.${userId}&select=numero,cliente_nome,valor_total,status,data_criacao,itens&order=data_criacao.desc&limit=50`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!res.ok) return null;
    const orcamentos: any[] = await res.json();
    if (orcamentos.length === 0) return null;

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
