import { callAnthropic } from './anthropic';
import { callOpenAI } from './openai';
import { callGemini } from './gemini';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function callGroq(messages: ChatMessage[], model: string, customApiKey?: string) {
  const apiKey = customApiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured on backend');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'llama-3.3-70b-versatile', messages }),
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: data.choices?.[0]?.message?.content ?? '', raw: data };
}

/**
 * This is the one place that knows which provider handles which model —
 * everything upstream (the /v1/chat route, and eventually the desktop app)
 * just asks for a provider name and gets a normalized { text } back.
 * All keys live here as backend env vars, never inside the desktop app —
 * this is what "strip BYOK, run on our own keys" actually means at the
 * wire level.
 */
export async function callChatProvider(
  provider: string,
  messages: ChatMessage[],
  model: string,
  customApiKey?: string
): Promise<{ text: string; raw: unknown }> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(messages, model, customApiKey);
    case 'openai':
      return callOpenAI(messages, model, customApiKey);
    case 'gemini':
      return callGemini(messages, model, customApiKey);
    case 'groq':
      return callGroq(messages, model, customApiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
