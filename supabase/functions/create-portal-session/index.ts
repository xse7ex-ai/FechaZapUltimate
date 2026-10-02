// Supabase Edge Function: create-portal-session
// Acesso seguro ao Stripe Customer Portal (gerenciamento e cancelamento de assinaturas)
//
// Regras de Segurança e Arquitetura:
//   - Autenticação obrigatória via JWT (auth.getUser(token)).
//   - Busca do stripe_customer_id na tabela subscriptions do usuário autenticado.
//   - Erro claro se não houver cliente Stripe registrado.
//   - Nunca expõe STRIPE_SECRET_KEY.

import { getCorsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function resolveAppOrigin(req: Request): string {
  const reqOrigin = req.headers.get('origin') || req.headers.get('Origin');
  if (reqOrigin) return reqOrigin;
  const envOrigin = Deno.env.get('FRONTEND_ORIGIN')?.trim();
  if (envOrigin) {
    return envOrigin.split(',')[0].trim();
  }
  return 'http://localhost:3000';
}

Deno.serve(async (req) => {
  const currentCorsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: currentCorsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido.' }),
      { status: 405, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';

  if (!stripeSecretKey) {
    console.error('[create-portal-session] STRIPE_SECRET_KEY não configurada no servidor.');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Serviço de gerenciamento temporariamente indisponível.',
      }),
      { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Validação Estrita do JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado. JWT ausente ou inválido.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.startsWith('local-')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida. Faça login com sua conta.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expirado ou não autorizado.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authData.user;

    // 2. Localiza stripe_customer_id na tabela subscriptions
    const { data: subData, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      console.error('[create-portal-session] Erro ao buscar assinaturas:', subError);
    }

    const customerId = subData?.stripe_customer_id;
    if (!customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhuma assinatura ou cliente Stripe encontrado para esta conta. Assine um plano antes de acessar o portal de gerenciamento.',
        }),
        { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Cria a sessão do Stripe Billing Portal
    const appOrigin = resolveAppOrigin(req);
    const portalParams = new URLSearchParams();
    portalParams.append('customer', customerId);
    portalParams.append('return_url', appOrigin);

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: portalParams.toString(),
    });

    if (!portalRes.ok) {
      const portalErr = await portalRes.json().catch(() => ({}));
      console.error('[create-portal-session] Falha ao criar sessão do portal Stripe:', portalErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: portalErr?.error?.message || 'Falha ao abrir portal de assinaturas do Stripe.',
        }),
        { status: 502, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const portalData = await portalRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        url: portalData.url,
      }),
      { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[create-portal-session] Exceção:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
