import { getProviderKeys, prioritizeHealthyKeys, markKeyCooldown, maskApiKey } from './key-manager';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Recommended fast, lightweight, and reliable models on Hugging Face
export const HUGGINGFACE_MODELS = {
  // Fast & Lightweight (Sub-second to 1-2s latency, low memory footprint)
  LLAMA_3_2_3B: 'meta-llama/Llama-3.2-3B-Instruct',
  LLAMA_3_2_1B: 'meta-llama/Llama-3.2-1B-Instruct',
  QWEN_2_5_7B: 'Qwen/Qwen2.5-7B-Instruct',
  GEMMA_2_2B: 'google/gemma-2-2b-it',
  PHI_3_5_MINI: 'microsoft/Phi-3.5-mini-instruct',

  // Balanced & High-Throughput (8B class)
  LLAMA_3_1_8B: 'meta-llama/Llama-3.1-8B-Instruct',
  MISTRAL_7B: 'mistralai/Mistral-7B-Instruct-v0.3',
  GEMMA_2_9B: 'google/gemma-2-9b-it',

  // Quality / Heavyweight
  QWEN_2_5_72B: 'Qwen/Qwen2.5-72B-Instruct',
} as const;

export const DEFAULT_HF_CHAT_MODEL = HUGGINGFACE_MODELS.LLAMA_3_2_3B;

/**
 * Resolves convenient short aliases to full Hugging Face model IDs.
 */
export function resolveHuggingFaceModel(model?: string): string {
  if (!model) return DEFAULT_HF_CHAT_MODEL;

  const m = model.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    // 3.2 Llama
    'llama-3.2-3b': HUGGINGFACE_MODELS.LLAMA_3_2_3B,
    'llama-3.2-3b-instruct': HUGGINGFACE_MODELS.LLAMA_3_2_3B,
    'llama-3.2-1b': HUGGINGFACE_MODELS.LLAMA_3_2_1B,
    'llama-3.2-1b-instruct': HUGGINGFACE_MODELS.LLAMA_3_2_1B,
    // 3.1 Llama
    'llama-3.1-8b': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama-3.1-8b-instruct': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    // Qwen
    'qwen-2.5-7b': HUGGINGFACE_MODELS.QWEN_2_5_7B,
    'qwen-2.5-7b-instruct': HUGGINGFACE_MODELS.QWEN_2_5_7B,
    'qwen-7b': HUGGINGFACE_MODELS.QWEN_2_5_7B,
    'qwen-2.5-72b': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    // Mistral & Gemma & Phi
    'mistral-7b': HUGGINGFACE_MODELS.MISTRAL_7B,
    'gemma-2-2b': HUGGINGFACE_MODELS.GEMMA_2_2B,
    'gemma-2-9b': HUGGINGFACE_MODELS.GEMMA_2_9B,
    'phi-3.5-mini': HUGGINGFACE_MODELS.PHI_3_5_MINI,
    'phi-3.5': HUGGINGFACE_MODELS.PHI_3_5_MINI,
    // Fast mode generic alias
    'fast': HUGGINGFACE_MODELS.LLAMA_3_2_3B,
    'lightweight': HUGGINGFACE_MODELS.LLAMA_3_2_1B,
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
    'https://router.huggingface.co/hf-inference/v1/chat/completions',
    'https://api-inference.huggingface.co/v1/chat/completions',
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
