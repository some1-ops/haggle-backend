import { resolveUser, hasCreditsRemaining, deductCredit } from '@/lib/auth';
import { randomUUID } from 'crypto';

/**
 * POST /v1/negotiations/start
 *
 * Call this ONCE when a negotiation/call begins — the desktop app's
 * existing "Start Session" button (Launcher.tsx) is the natural hook.
 * This is the ONLY place a credit gets spent. /v1/chat and /v1/stt/session
 * no longer deduct anything — without this split, every single smart-
 * cascade AI reply during one call would burn a separate credit, and a
 * Bootstrapper user's 3/month would be gone in the first 10 seconds of
 * their first negotiation.
 */
export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  if (!hasCreditsRemaining(user)) {
    return Response.json(
      {
        error: 'Out of credits for this tier',
        tierId: user.tierId,
        upgradeUrl: 'https://haggle.algeris.com/pricing',
      },
      { status: 429 }
    );
  }

  if (user.plan.creditsPerMonth !== null) {
    await deductCredit(user.id);
  }

  // Not validated against on subsequent calls yet in this MVP — /v1/chat
  // and /v1/stt/session trust the caller already went through this gate,
  // same trust level as the rest of the backend right now. Fine for v0.1;
  // if that trust boundary ever matters, this id can become a real
  // server-tracked session with an expiry.
  return Response.json({ sessionId: randomUUID() });
}
