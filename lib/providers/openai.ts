import { getProviderKeys, prioritizeHealthyKeys, markKeyCooldown, maskApiKey } from './key-manager';

export async function callOpenAI(
  messages: { role: string; content: string }[],
  model: string,
  customApiKey?: string,
  options: { temperature?: number; maxTokens?: number } = {}
) {
  const allKeys = getProviderKeys('openai', customApiKey);
  if (allKeys.length === 0) {
    throw new Error('OPENAI_API_KEY not configured on backend');
  }

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[OpenAI] Key ${keyIdx + 1} (${keyMask}) returned ${res.status}. Switching to alternative key...`);
          lastError = new Error(`OpenAI [Key ${keyIdx + 1}/${prioritizedKeys.length} (${keyMask})] error ${res.status}: ${text}`);
          continue;
        }
        throw new Error(`OpenAI error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';

      if (keyIdx > 0) {
        console.info(`[OpenAI] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
      }

      return { text, raw: data, keyUsed: keyMask };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('401'))) {
        markKeyCooldown(apiKey, 60);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`OpenAI call failed across all ${prioritizedKeys.length} configured key(s)`);
}
