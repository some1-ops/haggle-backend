import {
  getProviderKeys,
  prioritizeHealthyKeys,
  markKeyCooldown,
  maskApiKey,
} from './key-manager';

export const HUGGINGFACE_SPEECH_MODELS = {
  WHISPER_LARGE_V3_TURBO: 'openai/whisper-large-v3-turbo',
  WHISPER_LARGE_V3: 'openai/whisper-large-v3',
  WHISPER_SMALL: 'openai/whisper-small',
  WHISPER_BASE: 'openai/whisper-base',
} as const;

export const DEFAULT_HF_SPEECH_MODEL = HUGGINGFACE_SPEECH_MODELS.WHISPER_LARGE_V3_TURBO;

export interface SpeechTranscriptionResult {
  text: string;
  provider: 'huggingface' | 'groq' | 'openai' | 'deepgram';
  model: string;
  keyUsed?: string;
  durationMs: number;
  fallbackOccurred: boolean;
  attempts: Array<{
    provider: string;
    model: string;
    keyUsed?: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }>;
}

export interface TranscribeAudioOptions {
  audioBuffer: Buffer | ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
  language?: string;
  preferredProvider?: 'huggingface' | 'groq' | 'openai' | 'deepgram';
  customApiKey?: string;
}

/**
 * Direct Hugging Face Speech-to-Text inference using Whisper Large v3 Turbo with multi-key rotation.
 */
export async function transcribeHuggingFace(
  audioBuffer: Buffer | ArrayBuffer | Uint8Array,
  model: string = DEFAULT_HF_SPEECH_MODEL,
  customApiKey?: string
): Promise<{ text: string; keyUsed?: string }> {
  const allKeys = getProviderKeys('huggingface', customApiKey);
  if (allKeys.length === 0) throw new Error('HUGGINGFACE_API_KEY not configured on backend');

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const endpoints = [
    `https://router.huggingface.co/hf-inference/models/${model}`,
    `https://api-inference.huggingface.co/models/${model}`,
  ];

  let lastError: Error | null = null;
  const binaryBody = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer as ArrayBuffer);

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/octet-stream',
          },
          body: binaryBody,
        });

        if (!res.ok) {
          const errorText = await res.text();
          if (res.status === 404 || res.status === 410) {
            lastError = new Error(`HF Speech endpoint ${endpoint} returned ${res.status}: ${errorText}`);
            continue;
          }
          if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
            markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
            console.warn(`[HF Speech] Key ${keyIdx + 1} (${keyMask}) hit ${res.status}. Rotating to alternative key...`);
            lastError = new Error(`Hugging Face Speech [Key ${keyIdx + 1} (${keyMask})] error ${res.status}: ${errorText}`);
            break;
          }
          throw new Error(`Hugging Face Speech error ${res.status}: ${errorText}`);
        }

        const data = (await res.json()) as { text?: string; error?: string };
        if (data.error) {
          throw new Error(`Hugging Face Speech error: ${data.error}`);
        }

        if (keyIdx > 0) {
          console.info(`[HF Speech] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
        }

        return { text: (data.text || '').trim(), keyUsed: keyMask };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('401'))) {
          markKeyCooldown(apiKey, 60);
          break;
        }
      }
    }
  }

  throw lastError || new Error(`Hugging Face speech transcription failed across all ${prioritizedKeys.length} configured key(s)`);
}

/**
 * Transcribes audio via Groq Whisper with multi-key rotation.
 */
export async function transcribeGroq(
  audioBuffer: Buffer | ArrayBuffer | Uint8Array,
  fileName: string = 'audio.wav',
  customApiKey?: string
): Promise<{ text: string; keyUsed?: string }> {
  const allKeys = getProviderKeys('groq', customApiKey);
  if (allKeys.length === 0) throw new Error('GROQ_API_KEY not configured on backend');

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const binaryBody = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer as ArrayBuffer);
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    try {
      const formData = new FormData();
      const blob = new Blob([binaryBody], { type: 'audio/wav' });
      formData.append('file', blob, fileName);
      formData.append('model', 'whisper-large-v3-turbo');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[Groq Speech] Key ${keyIdx + 1} (${keyMask}) hit ${res.status}. Rotating to alternative key...`);
          lastError = new Error(`Groq Whisper [Key ${keyIdx + 1} (${keyMask})] error ${res.status}: ${errorText}`);
          continue;
        }
        throw new Error(`Groq Whisper error ${res.status}: ${errorText}`);
      }

      const data = (await res.json()) as { text?: string };
      if (keyIdx > 0) {
        console.info(`[Groq Speech] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
      }
      return { text: (data.text || '').trim(), keyUsed: keyMask };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('401'))) {
        markKeyCooldown(apiKey, 60);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`Groq Whisper failed across all ${prioritizedKeys.length} configured key(s)`);
}

/**
 * Transcribes audio via OpenAI Whisper with multi-key rotation.
 */
export async function transcribeOpenAI(
  audioBuffer: Buffer | ArrayBuffer | Uint8Array,
  fileName: string = 'audio.wav',
  customApiKey?: string
): Promise<{ text: string; keyUsed?: string }> {
  const allKeys = getProviderKeys('openai', customApiKey);
  if (allKeys.length === 0) throw new Error('OPENAI_API_KEY not configured on backend');

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const binaryBody = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer as ArrayBuffer);
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    try {
      const formData = new FormData();
      const blob = new Blob([binaryBody], { type: 'audio/wav' });
      formData.append('file', blob, fileName);
      formData.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[OpenAI Speech] Key ${keyIdx + 1} (${keyMask}) hit ${res.status}. Rotating to alternative key...`);
          lastError = new Error(`OpenAI Whisper [Key ${keyIdx + 1} (${keyMask})] error ${res.status}: ${errorText}`);
          continue;
        }
        throw new Error(`OpenAI Whisper error ${res.status}: ${errorText}`);
      }

      const data = (await res.json()) as { text?: string };
      if (keyIdx > 0) {
        console.info(`[OpenAI Speech] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
      }
      return { text: (data.text || '').trim(), keyUsed: keyMask };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('401'))) {
        markKeyCooldown(apiKey, 60);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`OpenAI Whisper failed across all ${prioritizedKeys.length} configured key(s)`);
}

/**
 * Transcribes audio via Deepgram REST API with multi-key rotation.
 */
export async function transcribeDeepgram(
  audioBuffer: Buffer | ArrayBuffer | Uint8Array,
  mimeType: string = 'audio/wav',
  customApiKey?: string
): Promise<{ text: string; keyUsed?: string }> {
  const allKeys = getProviderKeys('deepgram', customApiKey);
  if (allKeys.length === 0) throw new Error('DEEPGRAM_API_KEY not configured on backend');

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const binaryBody = audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer as ArrayBuffer);
  let lastError: Error | null = null;

  for (let keyIdx = 0; keyIdx < prioritizedKeys.length; keyIdx++) {
    const apiKey = prioritizedKeys[keyIdx];
    const keyMask = maskApiKey(apiKey);

    try {
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType || 'audio/wav',
        },
        body: binaryBody,
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 429 || res.status === 401 || res.status === 403 || res.status === 503) {
          markKeyCooldown(apiKey, res.status === 429 ? 60 : 300);
          console.warn(`[Deepgram Speech] Key ${keyIdx + 1} (${keyMask}) hit ${res.status}. Rotating to alternative key...`);
          lastError = new Error(`Deepgram [Key ${keyIdx + 1} (${keyMask})] error ${res.status}: ${errorText}`);
          continue;
        }
        throw new Error(`Deepgram STT error ${res.status}: ${errorText}`);
      }

      const data = (await res.json()) as {
        results?: {
          channels?: Array<{
            alternatives?: Array<{
              transcript?: string;
            }>;
          }>;
        };
      };

      const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      if (keyIdx > 0) {
        console.info(`[Deepgram Speech] Fulfilled via alternative key ${keyIdx + 1} (${keyMask})`);
      }
      return { text: transcript.trim(), keyUsed: keyMask };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err.message && (err.message.includes('429') || err.message.includes('503') || err.message.includes('401'))) {
        markKeyCooldown(apiKey, 60);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`Deepgram STT failed across all ${prioritizedKeys.length} configured key(s)`);
}

/**
 * Executes Speech-to-Text with automatic multi-key and multi-provider fallback cascade:
 * Path 1: Hugging Face Whisper Large v3 Turbo (tries all HF keys)
 * Path 2: Groq Whisper (tries all Groq keys)
 * Path 3: OpenAI Whisper (tries all OpenAI keys)
 * Path 4: Deepgram Nova-2 (tries all Deepgram keys)
 */
export async function transcribeAudioWithFallback(
  options: TranscribeAudioOptions
): Promise<SpeechTranscriptionResult> {
  const { audioBuffer, mimeType = 'audio/wav', fileName = 'audio.wav', preferredProvider, customApiKey } = options;

  type SpeechPath = {
    provider: 'huggingface' | 'groq' | 'openai' | 'deepgram';
    model: string;
    fn: () => Promise<{ text: string; keyUsed?: string }>;
  };

  const defaultLadder: SpeechPath[] = [
    {
      provider: 'huggingface',
      model: HUGGINGFACE_SPEECH_MODELS.WHISPER_LARGE_V3_TURBO,
      fn: () => transcribeHuggingFace(audioBuffer, HUGGINGFACE_SPEECH_MODELS.WHISPER_LARGE_V3_TURBO, customApiKey),
    },
    {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      fn: () => transcribeGroq(audioBuffer, fileName, customApiKey),
    },
    {
      provider: 'openai',
      model: 'whisper-1',
      fn: () => transcribeOpenAI(audioBuffer, fileName, customApiKey),
    },
    {
      provider: 'deepgram',
      model: 'nova-2',
      fn: () => transcribeDeepgram(audioBuffer, mimeType, customApiKey),
    },
  ];

  // Reorder if user requested preferred provider
  const candidateLadder = preferredProvider
    ? [
        ...defaultLadder.filter((p) => p.provider === preferredProvider),
        ...defaultLadder.filter((p) => p.provider !== preferredProvider),
      ]
    : defaultLadder;

  const attempts: SpeechTranscriptionResult['attempts'] = [];

  for (let i = 0; i < candidateLadder.length; i++) {
    const candidate = candidateLadder[i];
    const startTime = Date.now();

    const keys = getProviderKeys(candidate.provider, customApiKey);
    if (keys.length === 0) {
      continue;
    }

    try {
      const result = await candidate.fn();
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
          `[Speech Fallback] Successfully transcribed via path ${i + 1} (${candidate.provider} / ${candidate.model}${result.keyUsed ? ` / key: ${result.keyUsed}` : ''}) after previous path(s) failed.`
        );
      }

      return {
        text: result.text,
        provider: candidate.provider,
        model: candidate.model,
        keyUsed: result.keyUsed,
        durationMs,
        fallbackOccurred: i > 0,
        attempts,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err?.message || String(err);

      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        durationMs,
        success: false,
        error: errorMessage,
      });

      console.warn(
        `[Speech Fallback] Path ${i + 1} failed (${candidate.provider} / ${candidate.model}): ${errorMessage}. Trying next speech provider...`
      );
    }
  }

  const failureSummary = attempts
    .map((a, idx) => `Path ${idx + 1} (${a.provider}/${a.model}): ${a.error}`)
    .join(' | ');

  throw new Error(`All Speech-to-Text fallback paths failed. Summary: ${failureSummary || 'No speech provider API keys configured'}`);
}
