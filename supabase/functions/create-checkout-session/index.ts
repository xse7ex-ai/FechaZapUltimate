// Supabase Edge Function: create-checkout-session
// Iniciação segura de Checkout do Stripe (Subscription Mode)
//
// Regras de Segurança e Arquitetura:
//   - Autenticação obrigatória via JWT (auth.getUser(token)). Nunca aceita user_id do body.
//   - Aceita exclusivamente os planos 'PRO' e 'TURBO'.
//   - Reutiliza stripe_customer_id existente ou cria Customer no Stripe de forma atômica.
//   - metadata { plano } configurado na sessão e no subscription_data para garantia no webhook.
//   - Nunca expõe STRIPE_SECRET_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
  const priceIdPro = Deno.env.get('STRIPE_PRICE_ID_PRO') || '';
  const priceIdTurbo = Deno.env.get('STRIPE_PRICE_ID_TURBO') || '';

  if (!stripeSecretKey) {
    console.error('[create-checkout-session] STRIPE_SECRET_KEY não configurada no servidor.');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Serviço de pagamentos temporariamente indisponível (chave Stripe ausente).',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Validação Estrita do JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado. JWT ausente ou inválido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.startsWith('local-')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida. Faça login com sua conta.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expirado ou não autorizado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authData.user;

    // 2. Validação do Plano Solicitado
    const body = await req.json().catch(() => ({}));
    const plano = body?.plano;

    if (plano !== 'PRO' && plano !== 'TURBO') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Plano inválido. Valores aceitos: "PRO" ou "TURBO".',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const priceId = plano === 'TURBO' ? priceIdTurbo : priceIdPro;
    if (!priceId) {
      console.error(`[create-checkout-session] STRIPE_PRICE_ID_${plano} não configurada no servidor.`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Identificador de preço para o plano ${plano} não configurado no servidor.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verificação de Assinatura Ativa (evitar assinatura duplicada)
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, stripe_customer_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'grace_period'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSub) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Você já tem uma assinatura ativa. Use 'Gerenciar assinatura' para trocar de plano.",
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verificação ou Criação do Stripe Customer
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id;

    if (!customerId) {
      // Buscar nome do perfil para enriquecer cadastro no Stripe
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('nome')
        .eq('id', user.id)
        .maybeSingle();

      const customerParams = new URLSearchParams();
      if (user.email) customerParams.append('email', user.email);
      customerParams.append('name', profile?.nome || user.email || 'Usuário FechaZap');
      customerParams.append('metadata[user_id]', user.id);

      const custRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: customerParams.toString(),
      });

      if (!custRes.ok) {
        const custErr = await custRes.json().catch(() => ({}));
        console.error('[create-checkout-session] Falha ao criar Customer no Stripe:', custErr);
        return new Response(
          JSON.stringify({
            success: false,
            error: custErr?.error?.message || 'Falha ao registrar cliente no Stripe.',
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newCustomer = await custRes.json();
      customerId = newCustomer.id;
    }

    // 4. Criação da Checkout Session no Stripe
    const appOrigin = resolveAppOrigin(req);
    const sessionParams = new URLSearchParams();
    sessionParams.append('customer', customerId);
    sessionParams.append('client_reference_id', user.id);
    sessionParams.append('mode', 'subscription');
    sessionParams.append('line_items[0][price]', priceId);
    sessionParams.append('line_items[0][quantity]', '1');
    sessionParams.append('metadata[plano]', plano);
    sessionParams.append('subscription_data[metadata][plano]', plano);
    sessionParams.append('success_url', `${appOrigin}?checkout_status=success&session_id={CHECKOUT_SESSION_ID}`);
    sessionParams.append('cancel_url', `${appOrigin}?checkout_status=cancel`);

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionParams.toString(),
    });

    if (!sessionRes.ok) {
      const sessionErr = await sessionRes.json().catch(() => ({}));
      console.error('[create-checkout-session] Falha ao criar Checkout Session no Stripe:', sessionErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: sessionErr?.error?.message || 'Falha ao gerar sessão de checkout no Stripe.',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sessionData = await sessionRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        url: sessionData.url,
        sessionId: sessionData.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[create-checkout-session] Exceção:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
