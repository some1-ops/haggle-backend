import { resolveUser, hasCreditsRemaining, deductCredit } from '@/lib/auth';
import { callChatWithFallback, type ChatMessage } from '@/lib/providers';

/**
 * POST /v1/chat
 * Header: Authorization: Bearer <supabase access token or API key or license>
 * Body: {
 *   provider?: 'huggingface'|'groq'|'gemini'|'openai'|'anthropic',
 *   model?: string,
 *   messages: ChatMessage[],
 *   system?: string,
 *   fast_mode?: boolean,
 *   customApiKey?: string,
 *   temperature?: number,
 *   max_tokens?: number
 * }
 *
 * Automatically executes across a resilient 2-3+ path fallback cascade:
 * If the primary model or provider experiences a rate limit (429), quota exhaustion,
 * or outage (502/503/504), it seamlessly fails over to the next configured provider
 * without interrupting caller operations.
 */
export async function POST(request: Request) {
  const isStreaming = request.headers.get('accept')?.includes('text/event-stream');

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fallbackToken = body.key || body.api_key || body.trial_token || null;
  const user = await resolveUser(request, fallbackToken);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  const fastMode = Boolean(body.fast_mode || body.fastMode);
  const customApiKey = body.customApiKey;

  let messages: ChatMessage[] = Array.isArray(body.messages) ? [...body.messages] : [];
  if (body.system && typeof body.system === 'string') {
    messages = [{ role: 'system', content: body.system }, ...messages.filter((m) => m.role !== 'system')];
  }

  if (!messages.length) {
    return Response.json({ error: 'messages array is required and must not be empty' }, { status: 400 });
  }

  if (customApiKey) {
    if (!user.plan.features.byok) {
      return Response.json({ error: 'Bring Your AI is not available on your current plan' }, { status: 403 });
    }
  } else {
    if (!hasCreditsRemaining(user)) {
      return Response.json({ error: 'Insufficient credits' }, { status: 402 });
    }
  }

  try {
    const result = await callChatWithFallback({
      messages,
      provider: body.provider,
      model: body.model,
      fastMode,
      customApiKey,
      temperature: body.temperature,
      maxTokens: body.max_tokens ?? body.maxTokens,
    });

    if (!customApiKey) {
      await deductCredit(user.id);
    }

    const responseHeaders: Record<string, string> = {
      'x-provider-used': result.provider,
      'x-model-used': result.model,
      'x-fallback-occurred': String(result.fallbackOccurred),
      'x-request-id': request.headers.get('x-request-id') || `res_${Date.now()}`,
    };

    if (isStreaming) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const chunkPayload = JSON.stringify({
            delta: result.text,
            model: result.model,
            provider: result.provider,
            fallbackOccurred: result.fallbackOccurred,
          });
          controller.enqueue(encoder.encode(`data: ${chunkPayload}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...responseHeaders,
        },
      });
    }

    return Response.json(
      {
        text: result.text,
        model: result.model,
        provider: result.provider,
        fallbackOccurred: result.fallbackOccurred,
        attempts: result.attempts,
      },
      { headers: responseHeaders }
    );
  } catch (err: any) {
    console.error('[Chat API] All providers/fallbacks failed:', err);
    return Response.json(
      {
        error: err.message || 'All upstream AI providers failed',
        details: err?.details || null,
      },
      { status: 502 }
    );
  }
}
