import { getProviderKeys, prioritizeHealthyKeys, markKeyCooldown, maskApiKey } from './key-manager';

export async function callAnthropic(
  messages: { role: string; content: string }[],
  model: string,
  customApiKey?: string
) {
  const allKeys = getProviderKeys('anthropic', customApiKey);
  if (allKeys.length === 0) {
    throw new Error('ANTHROPIC_API_KEY not configured on backend');
  }

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-latest',
          max_tokens: 1024,
          messages: messages.filter((m) => m.role !== 'system'),
          system: messages.find((m) => m.role === 'system')?.content,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[Anthropic] Key ${keyIdx + 1} (${keyMask}) returned ${res.status}. Switching to alternative key...`);
          lastError = new Error(`Anthropic [Key ${keyIdx + 1}/${prioritizedKeys.length} (${keyMask})] error ${res.status}: ${text}`);
          continue;
        }
        throw new Error(`Anthropic error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { content?: { text?: string }[] };
      const text = data.content?.map((c) => c.text ?? '').join('') ?? '';

      if (keyIdx > 0) {
        console.info(`[Anthropic] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
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

  throw lastError || new Error(`Anthropic call failed across all ${prioritizedKeys.length} configured key(s)`);
}
