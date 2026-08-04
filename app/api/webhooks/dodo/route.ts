import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhooks/dodo
 *
 * Dodo Payments sends webhooks using the Standard Webhooks spec (Svix-style
 * headers: webhook-id / webhook-timestamp / webhook-signature). Verify this
 * against Dodo's CURRENT docs before going live — webhook signature schemes
 * are exactly the kind of detail that's worth double-checking against the
 * source rather than trusting this from memory, and get it wrong here and
 * anyone can forge a "subscription activated" event.
 *
 * Map Dodo's product IDs to your plan IDs in DODO_PRODUCT_TO_PLAN below
 * once you've created the real products in the Dodo dashboard.
 */

const DODO_PRODUCT_TO_PLAN: Record<string, string> = {
  // 'pdt_xxxxxxxx': 'ally',
  // 'pdt_yyyyyyyy': 'command',
};

function verifySignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DODO_WEBHOOK_SECRET not configured');
    return false;
  }

  const webhookId = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!webhookId || !timestamp || !signatureHeader) return false;

  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  // Standard Webhooks secrets are typically prefixed "whsec_" and base64-encoded after that.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // webhook-signature header can contain multiple space-separated "v1,<sig>" values
  return signatureHeader
    .split(' ')
    .some((part) => {
      const sig = part.split(',')[1];
      if (!sig) return false;
      try {
        return timingSafeEqual(Buffer.from(sig, 'base64'), Buffer.from(expected, 'base64'));
      } catch {
        return false;
      }
    });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  await supabaseAdmin.from('dodo_webhook_events').insert({
    event_type: event.type ?? 'unknown',
    payload: event,
  });

  // Adjust field paths below once you see a real payload — Dodo's exact
  // event shape should be confirmed against their current docs/dashboard
  // logs rather than assumed.
  const eventType = event.type as string | undefined;
  const productId = event.data?.product_id as string | undefined;
  const dodoCustomerId = event.data?.customer_id as string | undefined;
  const dodoSubscriptionId = event.data?.subscription_id as string | undefined;
  const hwid = event.data?.metadata?.hwid as string | undefined; // pass this at checkout time

  if (!hwid) {
    console.warn('Dodo webhook missing hwid metadata — cannot map to a device', event);
    return Response.json({ ok: true, warning: 'no hwid in metadata' });
  }

  const planId = productId ? DODO_PRODUCT_TO_PLAN[productId] : undefined;

  if (eventType === 'subscription.active' && planId) {
    await supabaseAdmin
      .from('devices')
      .update({
        plan_id: planId,
        plan_status: 'active',
        dodo_customer_id: dodoCustomerId,
        dodo_subscription_id: dodoSubscriptionId,
        trial_converted: true,
      })
      .eq('hwid', hwid);
  } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
    await supabaseAdmin
      .from('devices')
      .update({ plan_id: 'free', plan_status: 'canceled' })
      .eq('hwid', hwid);
  } else if (eventType === 'subscription.past_due') {
    await supabaseAdmin.from('devices').update({ plan_status: 'past_due' }).eq('hwid', hwid);
  }

  return Response.json({ ok: true });
}
