import { callAnthropic } from './anthropic';
import { callOpenAI } from './openai';
import { callGemini } from './gemini';
import {
  callHuggingFace,
  HUGGINGFACE_MODELS,
  resolveHuggingFaceModel,
  getHuggingFaceApiKey,
  DEFAULT_HF_CHAT_MODEL,
} from './huggingface';
import {
  callChatWithFallback,
  hasProviderKey,
  getActiveAIProviders,
  buildFallbackLadder,
  executeSingleProvider,
  type ChatMessage,
  type FallbackCandidate,
  type FallbackChatOptions,
  type FallbackChatResult,
  type ChatExecutionAttempt,
} from './fallback';
import {
  getProviderKeys,
  hasProviderKeys,
  getPrimaryProviderKey,
  markKeyCooldown,
  isKeyInCooldown,
  prioritizeHealthyKeys,
  maskApiKey,
  type AIOrSpeechProvider,
} from './key-manager';
import {
  transcribeAudioWithFallback,
  transcribeHuggingFace,
  transcribeGroq,
  transcribeOpenAI,
  transcribeDeepgram,
  HUGGINGFACE_SPEECH_MODELS,
  DEFAULT_HF_SPEECH_MODEL,
  type SpeechTranscriptionResult,
  type TranscribeAudioOptions,
} from './speech';

export type {
  ChatMessage,
  FallbackCandidate,
  FallbackChatOptions,
  FallbackChatResult,
  ChatExecutionAttempt,
  SpeechTranscriptionResult,
  TranscribeAudioOptions,
  AIOrSpeechProvider,
};

export {
  callAnthropic,
  callOpenAI,
  callGemini,
  callHuggingFace,
  HUGGINGFACE_MODELS,
  DEFAULT_HF_CHAT_MODEL,
  resolveHuggingFaceModel,
  getHuggingFaceApiKey,
  callChatWithFallback,
  hasProviderKey,
  getActiveAIProviders,
  buildFallbackLadder,
  executeSingleProvider,
  getProviderKeys,
  hasProviderKeys,
  getPrimaryProviderKey,
  markKeyCooldown,
  isKeyInCooldown,
  prioritizeHealthyKeys,
  maskApiKey,
  transcribeAudioWithFallback,
  transcribeHuggingFace,
  transcribeGroq,
  transcribeOpenAI,
  transcribeDeepgram,
  HUGGINGFACE_SPEECH_MODELS,
  DEFAULT_HF_SPEECH_MODEL,
};

async function callGroq(messages: ChatMessage[], model: string, customApiKey?: string) {
  const keys = getProviderKeys('groq', customApiKey);
  if (keys.length === 0) throw new Error('GROQ_API_KEY not configured on backend');

  const prioritized = prioritizeHealthyKeys(keys);
  let lastErr: Error | null = null;

  for (const apiKey of prioritized) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'llama-3.3-70b-versatile', messages }),
      });

      if (!res.ok) {
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, 60);
          continue;
        }
        throw new Error(`Groq error ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return { text: data.choices?.[0]?.message?.content ?? '', raw: data };
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('All Groq keys failed');
}

/**
 * Direct single-provider caller with automatic multi-key failover.
 * For automatic multi-provider and multi-key fallback cascades, use callChatWithFallback().
 */
export async function callChatProvider(
  provider: string,
  messages: ChatMessage[],
  model: string,
  customApiKey?: string
): Promise<{ text: string; raw: unknown; keyUsed?: string }> {
  switch (provider.toLowerCase()) {
    case 'anthropic':
      return callAnthropic(messages, model, customApiKey);
    case 'openai':
      return callOpenAI(messages, model, customApiKey);
    case 'gemini':
      return callGemini(messages, model, customApiKey);
    case 'groq':
      return callGroq(messages, model, customApiKey);
    case 'huggingface':
    case 'hf':
      return callHuggingFace(messages, model, customApiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
