import { getProviderKeys, prioritizeHealthyKeys, markKeyCooldown, maskApiKey } from './key-manager';

export async function callGemini(
  messages: { role: string; content: string }[],
  model: string,
  customApiKey?: string
) {
  const allKeys = getProviderKeys('gemini', customApiKey);
  if (allKeys.length === 0) {
    throw new Error('GEMINI_API_KEY not configured on backend');
  }

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const modelName = model || 'gemini-2.0-flash';

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === 'system')?.content;
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[Gemini] Key ${keyIdx + 1} (${keyMask}) returned ${res.status}. Switching to alternative key...`);
          lastError = new Error(`Gemini [Key ${keyIdx + 1}/${prioritizedKeys.length} (${keyMask})] error ${res.status}: ${text}`);
          continue;
        }
        throw new Error(`Gemini error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

      if (keyIdx > 0) {
        console.info(`[Gemini] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
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

  throw lastError || new Error(`Gemini call failed across all ${prioritizedKeys.length} configured key(s)`);
}
