import { getProviderKeys, prioritizeHealthyKeys, markKeyCooldown, maskApiKey } from './key-manager';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Recommended fast, reliable models on Hugging Face router
export const HUGGINGFACE_MODELS = {
  // Flagship & High-Quality
  LLAMA_3_3_70B: 'meta-llama/Llama-3.3-70B-Instruct',
  LLAMA_3_1_8B: 'meta-llama/Llama-3.1-8B-Instruct',
  QWEN_2_5_72B: 'Qwen/Qwen2.5-72B-Instruct',
  DEEPSEEK_R1: 'deepseek-ai/DeepSeek-R1',
} as const;

export const DEFAULT_HF_CHAT_MODEL = HUGGINGFACE_MODELS.LLAMA_3_3_70B;

/**
 * Resolves convenient short aliases to full Hugging Face model IDs.
 */
export function resolveHuggingFaceModel(model?: string): string {
  if (!model) return DEFAULT_HF_CHAT_MODEL;

  const m = model.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    // Llama 3.3 & 3.1
    'llama-3.3-70b': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'llama-3.3-70b-instruct': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'llama-3.3': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'llama-3.1-8b': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama-3.1-8b-instruct': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama-3.1': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    // Qwen
    'qwen-2.5-72b': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    'qwen-2.5-72b-instruct': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    'qwen': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    // DeepSeek
    'deepseek-r1': HUGGINGFACE_MODELS.DEEPSEEK_R1,
    // Aliases
    'fast': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'lightweight': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'quality': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
  };

  return aliasMap[m] || model;
}

export function getHuggingFaceApiKey(customApiKey?: string): string | null {
  const keys = getProviderKeys('huggingface', customApiKey);
  return keys[0] || null;
}

/**
 * Calls Hugging Face Chat Completion endpoint with multi-key failover.
 * If Key 1 hits a rate limit or error, automatically tries Key 2, Key 3, etc.
 */
export async function callHuggingFace(
  messages: ChatMessage[],
  model: string = DEFAULT_HF_CHAT_MODEL,
  customApiKey?: string,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<{ text: string; raw: unknown; keyUsed?: string }> {
  const allKeys = getProviderKeys('huggingface', customApiKey);
  if (allKeys.length === 0) {
    throw new Error('HUGGINGFACE_API_KEY / HF_TOKEN not configured on backend');
  }

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const resolvedModel = resolveHuggingFaceModel(model);
  const maxTokens = options.maxTokens ?? 1024;
  const temperature = options.temperature ?? 0.7;

  const endpoints = [
    'https://router.huggingface.co/v1/chat/completions',
  ];

  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: resolvedModel,
            messages,
            max_tokens: maxTokens,
            temperature,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          if (res.status === 404 || res.status === 410) {
            lastError = new Error(`Hugging Face endpoint ${endpoint} returned ${res.status}: ${errorText}`);
            continue;
          }

          // If rate limit (429) or auth/quota error (401/403/503), mark cooldown and break to try next key
          if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
            markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
            lastError = new Error(`Hugging Face [Key ${keyIdx + 1}/${prioritizedKeys.length} (${keyMask})] error ${res.status}: ${errorText}`);
            console.warn(`[Hugging Face] Key ${keyIdx + 1} (${keyMask}) hit status ${res.status}. Rotating to alternative key if available...`);
            break; // Break endpoint loop to try next key
          }

          throw new Error(`Hugging Face error ${res.status}: ${errorText}`);
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          error?: string;
        };

        if (data.error) {
          throw new Error(`Hugging Face error: ${data.error}`);
        }

        const text = data.choices?.[0]?.message?.content ?? '';
        if (keyIdx > 0) {
          console.info(`[Hugging Face] Successfully fulfilled request using alternative key ${keyIdx + 1} (${keyMask})!`);
        }

        return { text, raw: data, keyUsed: keyMask };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('401') || err.message.includes('403'))) {
          markKeyCooldown(apiKey, 60);
          console.warn(`[Hugging Face] Key ${keyIdx + 1} failed: ${err.message}. Rotating to next alternative key...`);
          break; // Break endpoint loop to try next key
        }
      }
    }
  }

  throw lastError || new Error(`Hugging Face inference failed across all ${prioritizedKeys.length} configured key(s)`);
}
