import { callAnthropic } from './anthropic';
import { callOpenAI } from './openai';
import { callGemini } from './gemini';
import { callHuggingFace, HUGGINGFACE_MODELS, resolveHuggingFaceModel } from './huggingface';
import {
  getProviderKeys,
  hasProviderKeys,
  prioritizeHealthyKeys,
  markKeyCooldown,
  maskApiKey,
} from './key-manager';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface FallbackCandidate {
  provider: 'groq' | 'gemini' | 'huggingface' | 'openai' | 'anthropic';
  model: string;
  label?: string;
}

export interface ChatExecutionAttempt {
  provider: string;
  model: string;
  durationMs: number;
  success: boolean;
  keyUsed?: string;
  error?: string;
}

export interface FallbackChatResult {
  text: string;
  raw: unknown;
  provider: string;
  model: string;
  fallbackOccurred: boolean;
  keyUsed?: string;
  attempts: ChatExecutionAttempt[];
}

export interface FallbackChatOptions {
  messages: ChatMessage[];
  provider?: string;
  model?: string;
  fastMode?: boolean;
  customApiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Checks whether at least one API key is configured on the backend for a given provider.
 */
export function hasProviderKey(provider: string, customApiKey?: string): boolean {
  return hasProviderKeys(provider, customApiKey);
}

/**
 * Returns a list of all AI providers currently configured with backend API keys.
 */
export function getActiveAIProviders(): string[] {
  const providers: string[] = [];
  if (hasProviderKeys('groq')) providers.push('groq');
  if (hasProviderKeys('gemini')) providers.push('gemini');
  if (hasProviderKeys('huggingface')) providers.push('huggingface');
  if (hasProviderKeys('openai')) providers.push('openai');
  if (hasProviderKeys('anthropic')) providers.push('anthropic');
  return providers;
}

async function callGroqDirect(
  messages: ChatMessage[],
  model: string,
  customApiKey?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ text: string; raw: unknown; keyUsed?: string }> {
  const allKeys = getProviderKeys('groq', customApiKey);
  if (allKeys.length === 0) throw new Error('GROQ_API_KEY not configured on backend');

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'groq/compound',
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[Groq] Key ${keyIdx + 1} (${keyMask}) hit status ${res.status}. Rotating to alternative key...`);
          lastError = new Error(`Groq [Key ${keyIdx + 1}/${prioritizedKeys.length} (${keyMask})] error ${res.status}: ${errText}`);
          continue;
        }
        throw new Error(`Groq error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';

      if (keyIdx > 0) {
        console.info(`[Groq] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
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

  throw lastError || new Error(`Groq call failed across all ${prioritizedKeys.length} configured key(s)`);
}

/**
 * Direct execution wrapper for a single provider/model with multi-key failover.
 */
export async function executeSingleProvider(
  provider: string,
  messages: ChatMessage[],
  model: string,
  customApiKey?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ text: string; raw: unknown; keyUsed?: string }> {
  switch (provider.toLowerCase()) {
    case 'anthropic':
      return callAnthropic(messages, model, customApiKey);
    case 'openai':
      return callOpenAI(messages, model, customApiKey, options);
    case 'gemini':
      return callGemini(messages, model, customApiKey);
    case 'groq':
      return callGroqDirect(messages, model, customApiKey, options);
    case 'huggingface':
    case 'hf':
      return callHuggingFace(messages, model, customApiKey, options);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Builds prioritized 2-3+ fallback candidate paths for a given request.
 */
export function buildFallbackLadder(options: FallbackChatOptions): FallbackCandidate[] {
  const { provider, model, fastMode, customApiKey } = options;
  const candidates: FallbackCandidate[] = [];

  // 1. If explicit provider and model requested, place as Path 1
  if (provider) {
    const normProvider = (provider === 'hf' ? 'huggingface' : provider).toLowerCase() as FallbackCandidate['provider'];
    let normModel = model || '';

    if (!normModel) {
      switch (normProvider) {
        case 'groq':
          normModel = 'groq/compound';
          break;
        case 'huggingface':
          normModel = HUGGINGFACE_MODELS.LLAMA_3_3_70B;
          break;
        case 'gemini':
          normModel = 'gemini-3.6-flash';
          break;
        case 'openai':
          normModel = fastMode ? 'gpt-4o-mini' : 'gpt-5.4';
          break;
        case 'anthropic':
          normModel = 'claude-sonnet-4-6';
          break;
      }
    } else if (normProvider === 'huggingface') {
      normModel = resolveHuggingFaceModel(normModel);
    }

    candidates.push({ provider: normProvider, model: normModel, label: `Primary (${normProvider})` });
  }

  // 2. Build prioritized fallback paths depending on mode and primary provider
  if (fastMode) {
    // Fast & Lightweight Ladder (Ultra-fast, low latency)
    const fastLadder: FallbackCandidate[] = [
      { provider: 'groq', model: 'groq/compound', label: 'Fast Path 1 (Groq Compound)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Fast Path 2 (HF Llama 3.1 8B)' },
      { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'Fast Path 3 (Groq GPT-OSS 120B)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Fast Path 4 (HF Llama 3.3 70B)' },
      { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fast Path 5 (Gemini 3.6 Flash)' },
      { provider: 'openai', model: 'gpt-4o-mini', label: 'Fast Path 6 (OpenAI 4o-mini)' },
    ];

    for (const c of fastLadder) {
      if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
        candidates.push(c);
      }
    }
  } else {
    // Standard / Quality Ladder
    const primary = provider?.toLowerCase();

    if (primary === 'huggingface' || primary === 'hf') {
      // Hugging Face primary fallbacks
      const hfFallbacks: FallbackCandidate[] = [
        { provider: 'groq', model: 'groq/compound', label: 'Fallback 1 (Groq Compound)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Fallback 2 (HF Llama 3.1 8B)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.QWEN_2_5_72B, label: 'Fallback 3 (HF Qwen 2.5 72B)' },
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fallback 4 (Gemini 3.6 Flash)' },
        { provider: 'openai', model: 'gpt-5.4', label: 'Fallback 5 (OpenAI GPT-5.4)' },
      ];
      for (const c of hfFallbacks) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    } else if (primary === 'anthropic') {
      const anthropicFallbacks: FallbackCandidate[] = [
        { provider: 'openai', model: 'gpt-5.4', label: 'Fallback 1 (OpenAI GPT-5.4)' },
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fallback 2 (Gemini 3.6 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Fallback 3 (HF Llama 3.3 70B)' },
        { provider: 'groq', model: 'groq/compound', label: 'Fallback 4 (Groq Compound)' },
      ];
      for (const c of anthropicFallbacks) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    } else if (primary === 'openai') {
      const openaiFallbacks: FallbackCandidate[] = [
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fallback 1 (Gemini 3.6 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Fallback 2 (HF Llama 3.3 70B)' },
        { provider: 'groq', model: 'groq/compound', label: 'Fallback 3 (Groq Compound)' },
        { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Fallback 4 (Anthropic Claude Sonnet)' },
      ];
      for (const c of openaiFallbacks) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    } else if (primary === 'groq') {
      const groqFallbacks: FallbackCandidate[] = [
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Fallback 1 (HF Llama 3.3 70B)' },
        { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'Fallback 2 (Groq GPT-OSS 120B)' },
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fallback 3 (Gemini 3.6 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Fallback 4 (HF Llama 3.1 8B)' },
        { provider: 'openai', model: 'gpt-4o-mini', label: 'Fallback 5 (OpenAI 4o-mini)' },
      ];
      for (const c of groqFallbacks) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    } else {
      // Default (e.g. Gemini or unspecified)
      const defaultLadder: FallbackCandidate[] = [
        { provider: 'groq', model: 'groq/compound', label: 'Default Path 1 (Groq Compound)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Default Path 2 (HF Llama 3.3 70B)' },
        { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'Default Path 3 (Groq GPT-OSS 120B)' },
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Default Path 4 (Gemini 3.6 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Default Path 5 (HF Llama 3.1 8B)' },
      ];
      for (const c of defaultLadder) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    }
  }

  // Filter candidates to only those with configured API keys (or if customApiKey is provided for the primary)
  const activeCandidates = candidates.filter((c, idx) => {
    if (idx === 0 && customApiKey) return true;
    return hasProviderKeys(c.provider);
  });

  return activeCandidates.length > 0 ? activeCandidates : candidates.slice(0, 3);
}

/**
 * Executes a chat request across an automatic 2-3+ path fallback cascade with multi-key failover.
 * If Path 1 Key 1 hits a rate limit (429), it switches to Key 2.
 * If all keys for Path 1 fail, it seamlessly switches to Path 2, Path 3, etc.
 */
export async function callChatWithFallback(options: FallbackChatOptions): Promise<FallbackChatResult> {
  const ladder = buildFallbackLadder(options);
  const attempts: ChatExecutionAttempt[] = [];

  if (ladder.length === 0) {
    throw new Error('No AI provider keys configured on backend. Please add HUGGINGFACE_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
  }

  let lastError: Error | null = null;

  for (let i = 0; i < ladder.length; i++) {
    const candidate = ladder[i];
    const startTime = Date.now();

    try {
      // Only pass customApiKey to the first candidate if it matches
      const customKey = i === 0 ? options.customApiKey : undefined;
      const result = await executeSingleProvider(
        candidate.provider,
        options.messages,
        candidate.model,
        customKey,
        { temperature: options.temperature, maxTokens: options.maxTokens }
      );

      const durationMs = Date.now() - startTime;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        keyUsed: result.keyUsed,
        durationMs,
        success: true,
      });

      if (i > 0) {
        console.info(
          `[AI Fallback] Successfully fell back to path ${i + 1} (${candidate.provider} / ${candidate.model}${result.keyUsed ? ` / key: ${result.keyUsed}` : ''}) after previous path(s) failed.`
        );
      }

      return {
        text: result.text,
        raw: result.raw,
        provider: candidate.provider,
        model: candidate.model,
        keyUsed: result.keyUsed,
        fallbackOccurred: i > 0,
        attempts,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err?.message || String(err);
      lastError = err instanceof Error ? err : new Error(errorMessage);

      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        durationMs,
        success: false,
        error: errorMessage,
      });

      console.warn(
        `[AI Fallback] Path ${i + 1}/${ladder.length} failed (${candidate.provider} / ${candidate.model}): ${errorMessage}. Attempting next path...`
      );
    }
  }

  // If all fallback paths were exhausted
  const failureSummary = attempts
    .map((a, idx) => `Path ${idx + 1} (${a.provider}/${a.model}): ${a.error}`)
    .join(' | ');

  throw new Error(`All AI fallback paths failed. Summary: ${failureSummary}`);
}
