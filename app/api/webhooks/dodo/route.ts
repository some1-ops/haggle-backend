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

  let event: {
    type?: string;
    data?: { product_id?: string; metadata?: { supabase_user_id?: string } };
  };

  try {
    event = getWebhook().verify(rawBody, headers) as typeof event;
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Confirm these exact field paths against a real Dodo payload before
  // launch — this is my best understanding of the event shape, not a
  // confirmed read of a live webhook delivery.
  const eventType = event.type;
  const productId = event.data?.product_id;
  const userId = event.data?.metadata?.supabase_user_id;

  if (!userId) {
    console.warn('Dodo webhook missing supabase_user_id in metadata — cannot map to a profile', event);
    return Response.json({ ok: true, warning: 'no supabase_user_id in metadata' });
  }

  const dodoProductMap = (await import('@/lib/dodo-product-map.generated.json')).default as Record<
    string,
    string
  >;
  const tierId = productId
    ? Object.entries(dodoProductMap).find(([, pid]) => pid === productId)?.[0]
    : undefined;

  if ((eventType === 'subscription.active' || eventType === 'subscription.renewed') && tierId) {
    await supabaseAdmin.from('profiles').update({ subscription_tier: tierId }).eq('id', userId);
  } else if (
    eventType === 'subscription.cancelled' ||
    eventType === 'subscription.expired' ||
    eventType === 'subscription.on_hold'
  ) {
    await supabaseAdmin.from('profiles').update({ subscription_tier: 'free' }).eq('id', userId);
  }

  return Response.json({ ok: true });
}
