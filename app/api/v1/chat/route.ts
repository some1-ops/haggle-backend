import { resolveUser, hasCreditsRemaining, deductCredit } from '@/lib/auth';
import { callChatProvider, type ChatMessage } from '@/lib/providers';

/**
 * POST /v1/chat
 * Header: Authorization: Bearer <supabase access token>
 * Body: { provider: 'anthropic'|'openai'|'gemini'|'groq', model: string, messages: ChatMessage[], customApiKey?: string }
 */
export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  type ChatRequestBody = { provider?: string; model?: string; messages?: ChatMessage[]; customApiKey?: string };
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model, messages, customApiKey } = body;
  if (!provider || !messages?.length) {
    return Response.json({ error: 'provider and messages are required' }, { status: 400 });
  }

  if (customApiKey) {
    if (!user.plan.features.byok) {
      return Response.json({ error: 'Bring Your AI is not available on your current plan' }, { status: 403 });
    }
    // Bypass credit deduction for BYOK
  } else {
    if (!hasCreditsRemaining(user)) {
      return Response.json({ error: 'Insufficient credits' }, { status: 402 });
    }
  }

  try {
    const result = await callChatProvider(provider, messages, model ?? '', customApiKey);
    if (!customApiKey) {
      await deductCredit(user.id);
    }
    return Response.json({ text: result.text });
  } catch (err) {
    console.error('chat provider error', err);
    return Response.json({ error: 'Upstream provider error' }, { status: 502 });
  }
}
