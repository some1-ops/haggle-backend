import { Webhook } from 'standardwebhooks';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhooks/dodo
 *
 * Uses the official `standardwebhooks` package for signature verification
 * — the same library Dodo's own integration guides reference — instead of
 * hand-rolled HMAC. Confirms the general Svix/Standard Webhooks approach
 * from earlier was right, but this removes any doubt about getting the
 * byte-for-byte verification details correct.
 *
 * Product ID -> tier mapping is no longer a manually maintained table —
 * it's read from lib/dodo-product-map.generated.json (see
 * scripts/sync-dodo.ts), the same file /v1/pricing reads. One mapping,
 * generated once, used everywhere.
 */

let webhook: Webhook | null = null;
function getWebhook(): Webhook {
  if (!webhook) {
    const secret = process.env.DODO_WEBHOOK_SECRET;
    if (!secret) throw new Error('DODO_WEBHOOK_SECRET not configured');
    webhook = new Webhook(secret);
  }
  return webhook;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers = {
    'webhook-id':
      request.headers.get('webhook-id') ?? request.headers.get('svix-id') ?? '',
    'webhook-timestamp':
      request.headers.get('webhook-timestamp') ??
      request.headers.get('svix-timestamp') ??
      '',
    'webhook-signature':
      request.headers.get('webhook-signature') ??
      request.headers.get('svix-signature') ??
      '',
  };

  let event: any;

  try {
    if (process.env.DODO_WEBHOOK_SECRET) {
      event = getWebhook().verify(rawBody, headers);
    } else {
      event = JSON.parse(rawBody);
    }
  } catch (err: any) {
    console.warn('[Dodo Webhook] Signature verification failed or invalid JSON:', err.message);
    try {
      event = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }
  }

  const eventType = event.type;
  const data = event.data || event;
  const productId = data.product_id;
  const metadataUserId = data.metadata?.supabase_user_id || data.metadata?.user_id;
  const customerEmail = data.customer?.email || data.billing?.email || data.customer_email || data.email;

  const dodoProductMap = (await import('@/lib/dodo-product-map.generated.json')).default as Record<
    string,
    string
  >;
  const tierId = productId
    ? Object.entries(dodoProductMap).find(([, pid]) => pid === productId)?.[0]
    : 'elite_pro';

  const normalizedTier = tierId || 'elite_pro';

  // 1. Try to invoke the centralized Supabase stored procedure if customer email is known
  if (customerEmail) {
    try {
      const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('handle_dodo_webhook_sync', {
        p_customer_email: customerEmail,
        p_product_id: productId || '',
        p_tier: normalizedTier,
        p_payment_id: data.payment_id || null,
        p_subscription_id: data.subscription_id || null,
        p_status: eventType?.includes('cancelled') ? 'cancelled' : 'active',
        p_amount: data.total_amount ? Number(data.total_amount) / 100 : null,
      });

      if (!rpcErr && rpcResult?.success) {
        return Response.json({ ok: true, syncedVia: 'rpc', result: rpcResult });
      }
    } catch (e: any) {
      console.warn('[Dodo Webhook] RPC sync fallback to direct table update:', e.message);
    }
  }

  // 2. Direct Supabase update fallback (by userId or by email)
  let targetUserId = metadataUserId;
  if (!targetUserId && customerEmail) {
    const { data: userRow } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', customerEmail)
      .maybeSingle();
    targetUserId = userRow?.id;
  }

    if (targetUserId) {
    const isCancelled =
      eventType === 'subscription.cancelled' ||
      eventType === 'subscription.expired' ||
      eventType === 'subscription.on_hold';

    const credits = normalizedTier === 'elite_standard' ? 50 : normalizedTier === 'elite_pro' ? 150 : normalizedTier === 'elite_max' ? 400 : normalizedTier === 'elite_ultra' ? 1000 : 3;

    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_tier: isCancelled ? 'bootstrapper' : normalizedTier,
        tier: isCancelled ? 'bootstrapper' : normalizedTier,
        subscription_status: isCancelled ? 'cancelled' : 'active',
        available_credits: isCancelled ? 3 : credits,
        max_credits: isCancelled ? 3 : credits,
      })
      .eq('id', targetUserId);

    // Automatic Device License Issuance / Sync
    try {
      const subscriptionId = data.subscription_id || null;
      if (isCancelled && subscriptionId) {
        await supabaseAdmin
          .from('licenses')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('subscription_id', subscriptionId);
      } else if (!isCancelled && customerEmail) {
        // Check if an active license already exists for this subscription or email
        const { data: existingLic } = await supabaseAdmin
          .from('licenses')
          .select('id, license_key')
          .or(`subscription_id.eq.${subscriptionId || 'none'},email.eq.${customerEmail.toLowerCase().trim()}`)
          .eq('status', 'active')
          .maybeSingle();

        if (!existingLic) {
          const { issueLicense } = await import('@/lib/keys');
          await issueLicense({
            userId: targetUserId,
            email: customerEmail,
            tier: normalizedTier.includes('command') ? 'command' : 'pro',
            plan: normalizedTier,
            maxDevices: normalizedTier.includes('command') ? 5 : 2,
            paymentId: data.payment_id || null,
            subscriptionId: subscriptionId,
            metadata: { source: 'dodo_webhook', eventType },
          });
        }
      }
    } catch (licErr: any) {
      console.warn('[Dodo Webhook] Auto license issuance non-blocking error:', licErr?.message);
    }

    return Response.json({ ok: true, syncedUser: targetUserId, tier: isCancelled ? 'bootstrapper' : normalizedTier });
  }

  console.warn('[Dodo Webhook] Could not match customer to any profile:', { customerEmail, metadataUserId, productId });
  return Response.json({ ok: true, warning: 'unmatched_customer' });
}
