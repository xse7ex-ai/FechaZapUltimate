// Supabase Edge Function: stripe-webhook
// Arquitetura Profissional de Monetização e Assinaturas (Fase 6/9)
//
// Fluxo Arquitetural Estrito:
//   Stripe -> Webhook HMAC -> Banco (subscriptions/stripe_events) -> Status da Assinatura -> Plano Efetivo
//
// NUNCA o frontend decide o plano ou altera status de assinatura.
// Tratamento de ciclo de vida completo:
//   - checkout.session.completed (ativação inicial)
//   - customer.subscription.created / updated (trial, upgrade, downgrade, past_due, cancel_at_period_end)
//   - customer.subscription.deleted (cancelamento definitivo -> recai para GRATUITO)
//   - invoice.payment_succeeded (renovação de período)
//   - invoice.payment_failed (grace period de tolerância)
//   - Idempotência rigorosa e proteção contra replay via stripe_events
//   - Fail-closed: se secret não existir ou assinatura falhar, rejeita imediatamente

import { getCorsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/**
 * Validação nativa de assinatura HMAC-SHA256 do Stripe (Web Crypto API)
 * Header formato: t=1710000000,v1=abcdef0123...
 */
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300
): Promise<{ valid: boolean; error?: string }> {
  if (!sigHeader || !secret) {
    return { valid: false, error: 'Assinatura Stripe ou secret ausente.' };
  }

  const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, item) => {
    const [k, v] = item.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parseInt(parts['t'] || '0', 10);
  const signature = parts['v1'];

  if (!timestamp || !signature) {
    return { valid: false, error: 'Formato inválido do cabeçalho stripe-signature.' };
  }

  // Verificação contra Replay Attack (tolerância padrão de 5 minutos)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, error: 'Carimbo temporal do webhook expirado (replay attack detectado).' };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const hexComputed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (hexComputed.toLowerCase() !== signature.toLowerCase()) {
    return { valid: false, error: 'Assinatura criptográfica HMAC do Stripe inválida.' };
  }

  return { valid: true };
}

/**
 * Mapeia identificador de produto/preço ou metadata do Stripe para o plano do FechaZap
 */
function resolvePlanFromStripeObject(obj: any): 'PRO' | 'TURBO' | 'GRATUITO' {
  // 1. Metadata explícita
  const metaPlan = obj?.metadata?.plano || obj?.metadata?.plan;
  if (metaPlan) {
    const upper = String(metaPlan).toUpperCase();
    if (upper === 'TURBO') return 'TURBO';
    if (upper === 'PRO') return 'PRO';
  }

  // 2. Análise de line_items / plan name / price nickname
  const planName = (
    obj?.plan?.nickname ||
    obj?.plan?.id ||
    obj?.items?.data?.[0]?.price?.nickname ||
    obj?.items?.data?.[0]?.price?.id ||
    ''
  ).toUpperCase();

  if (planName.includes('TURBO')) return 'TURBO';
  if (planName.includes('PRO')) return 'PRO';

  // Fallback padrão para upgrade pago sem especificação: PRO
  return 'PRO';
}

Deno.serve(async (req) => {
  const currentCorsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: currentCorsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

  // REGRA DE SEGURANÇA: Fail-closed se secret não estiver configurado
  if (!stripeWebhookSecret) {
    console.error('FATAL: STRIPE_WEBHOOK_SECRET não configurado no servidor.');
    return new Response(
      JSON.stringify({
        error: 'Configuração de webhook incompleta no servidor (fail-closed).',
      }),
      { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const sigHeader = req.headers.get('stripe-signature') || '';
  const rawBody = await req.text();

  // Validação criptográfica da assinatura HMAC
  const verification = await verifyStripeSignature(rawBody, sigHeader, stripeWebhookSecret);
  if (!verification.valid) {
    console.warn('Rejeição de webhook Stripe:', verification.error);
    return new Response(
      JSON.stringify({ error: verification.error || 'Não autorizado.' }),
      { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Payload JSON inválido.' }), {
      status: 400,
      headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventId = event?.id;
  const eventType = event?.type;

  if (!eventId || !eventType) {
    return new Response(JSON.stringify({ error: 'Evento Stripe malformado.' }), {
      status: 400,
      headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Idempotência estrita: se o evento já foi processado, retorna 200 OK imediatamente
  const { data: existingEvent } = await supabaseAdmin
    .from('stripe_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();

  if (existingEvent) {
    return new Response(JSON.stringify({ received: true, deduplicated: true }), {
      status: 200,
      headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const obj = event.data?.object || {};

    switch (eventType) {
      // ----------------------------------------------------------------------
      // 1. Checkout Concluído com Sucesso
      // ----------------------------------------------------------------------
      case 'checkout.session.completed': {
        const userId = obj.client_reference_id || obj.metadata?.user_id;
        const customerId = obj.customer;
        const subscriptionId = obj.subscription;
        const targetPlan = resolvePlanFromStripeObject(obj);

        if (userId) {
          // Registra ou atualiza a assinatura vinculada
          await supabaseAdmin.from('subscriptions').upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subscriptionId || `sub_chk_${eventId}`,
              plano: targetPlan,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
              cancel_at_period_end: false,
              metadata: {
                checkout_session_id: obj.id,
                source: 'stripe_checkout',
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'stripe_subscription_id' }
          );

          // Atualiza perfil authoritative
          await supabaseAdmin
            .from('profiles')
            .update({ plano: targetPlan, updated_at: new Date().toISOString() })
            .eq('id', userId);
        }
        break;
      }

      // ----------------------------------------------------------------------
      // 2. Criação ou Atualização de Assinatura (Trial, Upgrade, Downgrade, Status)
      // ----------------------------------------------------------------------
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscriptionId = obj.id;
        const customerId = obj.customer;
        const stripeStatus = obj.status; // 'active', 'trialing', 'past_due', 'canceled', etc.
        const targetPlan = resolvePlanFromStripeObject(obj);

        // Identifica o user_id (via metadata da subscription ou localizando no banco pelo customerId)
        let userId = obj.metadata?.user_id;
        if (!userId) {
          const { data: subRow } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id')
            .or(`stripe_subscription_id.eq.${subscriptionId},stripe_customer_id.eq.${customerId}`)
            .maybeSingle();

          if (subRow) {
            userId = subRow.user_id;
          }
        }

        if (userId) {
          let mappedStatus = stripeStatus;
          let gracePeriodEnd: string | null = null;

          // Tratamento de Grace Period para past_due (5 dias de tolerância)
          if (stripeStatus === 'past_due') {
            mappedStatus = 'grace_period';
            gracePeriodEnd = new Date(Date.now() + 5 * 86400000).toISOString();
          }

          const periodStart = obj.current_period_start
            ? new Date(obj.current_period_start * 1000).toISOString()
            : new Date().toISOString();
          const periodEnd = obj.current_period_end
            ? new Date(obj.current_period_end * 1000).toISOString()
            : new Date(Date.now() + 30 * 86400000).toISOString();
          const trialEnd = obj.trial_end
            ? new Date(obj.trial_end * 1000).toISOString()
            : null;

          await supabaseAdmin.from('subscriptions').upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plano: targetPlan,
              status: mappedStatus,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              trial_end: trialEnd,
              cancel_at_period_end: Boolean(obj.cancel_at_period_end),
              canceled_at: obj.canceled_at ? new Date(obj.canceled_at * 1000).toISOString() : null,
              grace_period_end: gracePeriodEnd,
              metadata: {
                stripe_status: stripeStatus,
                cancel_at: obj.cancel_at,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'stripe_subscription_id' }
          );

          // Sincroniza plano efetivo no perfil
          const effectivePlan =
            mappedStatus === 'active' || mappedStatus === 'trialing' || mappedStatus === 'grace_period'
              ? targetPlan
              : 'GRATUITO';

          await supabaseAdmin
            .from('profiles')
            .update({ plano: effectivePlan, updated_at: new Date().toISOString() })
            .eq('id', userId);
        }
        break;
      }

      // ----------------------------------------------------------------------
      // 3. Cancelamento Definitivo de Assinatura (Recai para GRATUITO)
      // ----------------------------------------------------------------------
      case 'customer.subscription.deleted': {
        const subscriptionId = obj.id;
        const { data: subRow } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle();

        if (subRow) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);

          // Reverte o perfil para GRATUITO imediatamente
          await supabaseAdmin
            .from('profiles')
            .update({ plano: 'GRATUITO', updated_at: new Date().toISOString() })
            .eq('id', subRow.user_id);
        }
        break;
      }

      // ----------------------------------------------------------------------
      // 4. Pagamento de Fatura com Sucesso (Renovação de Ciclo)
      // ----------------------------------------------------------------------
      case 'invoice.payment_succeeded': {
        const subscriptionId = obj.subscription;
        if (subscriptionId) {
          const { data: subRow } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id, plano')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();

          if (subRow) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'active',
                grace_period_end: null,
                current_period_end: obj.period_end
                  ? new Date(obj.period_end * 1000).toISOString()
                  : new Date(Date.now() + 30 * 86400000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('stripe_subscription_id', subscriptionId);

            // Assegura que o perfil permanece ativo no plano correspondente
            await supabaseAdmin
              .from('profiles')
              .update({ plano: subRow.plano, updated_at: new Date().toISOString() })
              .eq('id', subRow.user_id);
          }
        }
        break;
      }

      // ----------------------------------------------------------------------
      // 5. Falha no Pagamento da Fatura (Entra em Grace Period de 5 dias)
      // ----------------------------------------------------------------------
      case 'invoice.payment_failed': {
        const subscriptionId = obj.subscription;
        if (subscriptionId) {
          const graceEnd = new Date(Date.now() + 5 * 86400000).toISOString();
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'grace_period',
              grace_period_end: graceEnd,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }

      default:
        // Outros eventos recebidos são registrados sem alterar o plano
        break;
    }

    // Registra evento processado para idempotência
    await supabaseAdmin.from('stripe_events').insert({
      id: eventId,
      event_type: eventType,
      payload: {
        type: eventType,
        created: event.created,
      },
    });

    return new Response(JSON.stringify({ received: true, eventId }), {
      status: 200,
      headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Erro ao processar webhook Stripe:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Falha ao processar evento Stripe.' }),
      { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
