import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhooks/dodo
 *
 * Verify the exact header names/secret encoding against Dodo's CURRENT
 * webhook docs before relying on this in production — Standard Webhooks
 * (Svix-style) is my best understanding of their scheme, not a confirmed
 * read of their docs.
 *
 * IMPORTANT: pass metadata: { supabase_user_id } when creating the Dodo
 * checkout session (both from the website's existing checkout flow and
 * from whatever the desktop app calls to open checkout) — this webhook has
 * no other way to know which profiles row to update. hwid is gone; this is
 * keyed on the real account id now.
 */

const DODO_PRODUCT_TO_TIER: Record<string, string> = {
  // 'pdt_xxxxxxxx': 'elite',
  // 'pdt_yyyyyyyy': 'elite_yearly',
  // 'pdt_zzzzzzzz': 'command',
  // 'pdt_wwwwwwww': 'command_yearly',
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
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  return signatureHeader.split(' ').some((part) => {
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

  // Confirm these field paths against a real Dodo payload before launch.
  const eventType = event.type as string | undefined;
  const productId = event.data?.product_id as string | undefined;
  const userId = event.data?.metadata?.supabase_user_id as string | undefined;

  if (!userId) {
    console.warn('Dodo webhook missing supabase_user_id in metadata — cannot map to a profile', event);
    return Response.json({ ok: true, warning: 'no supabase_user_id in metadata' });
  }

  const tierId = productId ? DODO_PRODUCT_TO_TIER[productId] : undefined;

  if (eventType === 'subscription.active' && tierId) {
    await supabaseAdmin.from('profiles').update({ subscription_tier: tierId }).eq('id', userId);
  } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
    await supabaseAdmin.from('profiles').update({ subscription_tier: 'free' }).eq('id', userId);
  }
  // No plan_status/past_due column exists on `profiles` yet — add one via
  // migration if you want to distinguish "cancelled" from "payment failed,
  // will retry" rather than dropping straight to free on any failure event.

  return Response.json({ ok: true });
}
