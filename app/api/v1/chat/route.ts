import { resolveDevice, checkQuota, recordUsage } from '@/lib/auth';
import { callChatProvider, type ChatMessage } from '@/lib/providers';

/**
 * POST /v1/chat
 * Body: { provider: 'anthropic'|'openai'|'gemini'|'groq', model: string,
 *         messages: ChatMessage[], sessionMinutes?: number }
 * Header: x-haggle-key: <device hwid>
 *
 * This is the route the desktop app calls INSTEAD of hitting
 * api.anthropic.com / api.openai.com directly with a user-entered key.
 * All provider keys live in this backend's environment variables only.
 */
export async function POST(request: Request) {
  const device = await resolveDevice(request);
  if (!device) {
    return Response.json({ error: 'Missing or invalid x-haggle-key' }, { status: 401 });
  }

  if (device.planStatus !== 'active') {
    return Response.json(
      { error: 'Subscription not active', planStatus: device.planStatus },
      { status: 402 }
    );
  }

  const quota = await checkQuota(device);
  if (!quota.allowed) {
    return Response.json(
      {
        error: 'Monthly session quota exceeded',
        sessionsUsed: quota.sessionsUsed,
        sessionsLimit: quota.sessionsLimit,
        upgradeUrl: 'https://haggle.algeris.com/pricing', // point at real URL
      },
      { status: 429 }
    );
  }

  type ChatRequestBody = {
    provider?: string;
    model?: string;
    messages?: ChatMessage[];
    sessionMinutes?: number;
    isNewSession?: boolean;
  };

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model, messages, sessionMinutes = 0, isNewSession = false } = body;

  if (!provider || !messages?.length) {
    return Response.json({ error: 'provider and messages are required' }, { status: 400 });
  }

  // Hard stop on runaway sessions, independent of the session-count cap —
  // this is the "cap max session length" safety net from the pricing
  // discussion, so one very long call can't blow past the cost the
  // sessions-per-month number assumed.
  if (sessionMinutes > device.plan.maxSessionMinutes) {
    return Response.json(
      {
        error: 'Session exceeds max length for your plan',
        maxSessionMinutes: device.plan.maxSessionMinutes,
      },
      { status: 429 }
    );
  }

  try {
    const result = await callChatProvider(provider, messages, model ?? '');

    // Only count usage on real, successful calls, and only increment the
    // session counter once per session (desktop app should send
    // isNewSession: true on the first call of a negotiation, false on
    // every follow-up cascade call within the same session).
    await recordUsage(device.id, {
      sessionIncrement: isNewSession ? 1 : 0,
      minutesIncrement: 0, // desktop app should PATCH actual minutes at session end — see README
    });

    return Response.json({ text: result.text });
  } catch (err) {
    console.error('chat provider error', err);
    return Response.json({ error: 'Upstream provider error' }, { status: 502 });
  }
}
