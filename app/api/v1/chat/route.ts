import { resolveUser } from '@/lib/auth';
import { callChatProvider, type ChatMessage } from '@/lib/providers';

/**
 * POST /v1/chat
 * Header: Authorization: Bearer <supabase access token>
 * Body: { provider: 'anthropic'|'openai'|'gemini'|'groq', model: string, messages: ChatMessage[] }
 *
 * provider/model here select HAGGLE'S OWN keys (this is the BYOK removal).
 * If you keep an opt-in "Connect Your Own AI" override for Elite/Command
 * (per the "Bring Your AI" framing), that's a second code path — a request
 * carrying the user's own key should skip deductCredit() entirely, since
 * they're paying that provider directly at that point, not spending your
 * quota. Not built here yet; flag if you want it added.
 */
export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  type ChatRequestBody = { provider?: string; model?: string; messages?: ChatMessage[] };
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model, messages } = body;
  if (!provider || !messages?.length) {
    return Response.json({ error: 'provider and messages are required' }, { status: 400 });
  }

  try {
    const result = await callChatProvider(provider, messages, model ?? '');
    return Response.json({ text: result.text });
  } catch (err) {
    console.error('chat provider error', err);
    return Response.json({ error: 'Upstream provider error' }, { status: 502 });
  }
}
