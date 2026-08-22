import { resolveUser } from '@/lib/auth';
import {
  HUGGINGFACE_SPEECH_MODELS,
  getProviderKeys,
  prioritizeHealthyKeys,
  markKeyCooldown,
  maskApiKey,
} from '@/lib/providers';

/**
 * POST /v1/stt/session
 *
 * Issues short-lived scoped credentials or streaming session configurations
 * for speech-to-text providers (Deepgram, ElevenLabs, Azure Speech, IBM Watson, Hugging Face).
 *
 * Automatically rotates and falls back across multiple keys per provider
 * and across available configured providers if any key/provider encounters an error, rate limit, or is unreachable.
 */

type SpeechProvider = 'deepgram' | 'elevenlabs' | 'azure' | 'ibm_watson' | 'huggingface';

interface SessionResult {
  provider: SpeechProvider;
  apiKey?: string;
  token?: string;
  keyUsed?: string;
  wsUrl: string;
  region?: string;
  model?: string;
  expiresInSeconds: number;
}

let cachedDeepgramProjectId: string | null = process.env.DEEPGRAM_PROJECT_ID || null;

async function getDeepgramProjectId(apiKey: string): Promise<string | null> {
  if (cachedDeepgramProjectId) return cachedDeepgramProjectId;
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { authorization: `Token ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { projects?: Array<{ project_id: string }> };
    const id = data.projects?.[0]?.project_id ?? null;
    if (id) cachedDeepgramProjectId = id;
    return id;
  } catch {
    return null;
  }
}

async function createDeepgramSession(userId: string): Promise<SessionResult | null> {
  const allKeys = getProviderKeys('deepgram');
  if (allKeys.length === 0) return null;

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const ttlSeconds = 60 * 60; // 1 hour

  for (let idx = 0; idx < prioritizedKeys.length; idx++) {
    const apiKey = prioritizedKeys[idx];
    const keyMask = maskApiKey(apiKey);

    try {
      const projectId = await getDeepgramProjectId(apiKey);
      if (projectId) {
        const res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Token ${apiKey}`,
          },
          body: JSON.stringify({
            comment: `haggle-session-${userId}`,
            scopes: ['usage:write'],
            time_to_live_in_seconds: ttlSeconds,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { key: string };
          return {
            provider: 'deepgram',
            apiKey: data.key,
            keyUsed: keyMask,
            wsUrl: 'wss://api.deepgram.com/v1/listen',
            expiresInSeconds: ttlSeconds,
          };
        } else if (res.status === 429 || res.status === 401 || res.status === 403) {
          markKeyCooldown(apiKey, 60);
          console.warn(`[Deepgram] Key ${idx + 1} (${keyMask}) hit ${res.status}. Trying next key...`);
          continue;
        }
      }

      // Direct key fallback
      return {
        provider: 'deepgram',
        apiKey,
        keyUsed: keyMask,
        wsUrl: 'wss://api.deepgram.com/v1/listen',
        expiresInSeconds: ttlSeconds,
      };
    } catch (err: any) {
      console.warn(`[Deepgram] Key ${idx + 1} failed:`, err.message);
      markKeyCooldown(apiKey, 60);
    }
  }

  return null;
}

async function createElevenLabsSession(): Promise<SessionResult | null> {
  const allKeys = getProviderKeys('elevenlabs');
  if (allKeys.length === 0) return null;

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  for (const apiKey of prioritizedKeys) {
    const keyMask = maskApiKey(apiKey);
    return {
      provider: 'elevenlabs',
      apiKey,
      keyUsed: keyMask,
      wsUrl: 'wss://api.elevenlabs.io/v1/convai/conversation',
      expiresInSeconds: 3600,
    };
  }
  return null;
}

async function createAzureSpeechSession(): Promise<SessionResult | null> {
  const allKeys = getProviderKeys('azure');
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';
  if (allKeys.length === 0) return null;

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);

  for (let idx = 0; idx < prioritizedKeys.length; idx++) {
    const key = prioritizedKeys[idx];
    const keyMask = maskApiKey(key);

    try {
      const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-type': 'application/x-www-form-urlencoded',
          'Content-Length': '0',
        },
      });

      if (!res.ok) {
        if (res.status === 429 || res.status === 401 || res.status === 403) {
          markKeyCooldown(key, 60);
          console.warn(`[Azure Speech] Key ${idx + 1} (${keyMask}) returned ${res.status}. Rotating key...`);
          continue;
        }
        throw new Error(`Azure Speech token issue failed: ${res.statusText}`);
      }

      const token = await res.text();
      return {
        provider: 'azure',
        token,
        keyUsed: keyMask,
        region,
        wsUrl: `wss://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
        expiresInSeconds: 600,
      };
    } catch (err: any) {
      markKeyCooldown(key, 60);
      console.warn(`[Azure Speech] Key ${idx + 1} failed:`, err.message);
    }
  }

  return null;
}

async function createIBMWatsonSession(): Promise<SessionResult | null> {
  const allKeys = getProviderKeys('ibm_watson');
  const region = process.env.IBM_WATSON_REGION || 'us-south';
  if (allKeys.length === 0) return null;

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);

  for (let idx = 0; idx < prioritizedKeys.length; idx++) {
    const key = prioritizedKeys[idx];
    const keyMask = maskApiKey(key);

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
      params.append('apikey', key);

      const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) {
        if (res.status === 429 || res.status === 401 || res.status === 403) {
          markKeyCooldown(key, 60);
          console.warn(`[IBM Watson] Key ${idx + 1} (${keyMask}) returned ${res.status}. Rotating key...`);
          continue;
        }
        throw new Error(`IBM Watson token issue failed: ${res.statusText}`);
      }

      const data = (await res.json()) as { access_token: string; expires_in?: number };
      return {
        provider: 'ibm_watson',
        token: data.access_token,
        keyUsed: keyMask,
        region,
        wsUrl: `wss://api.${region}.speech-to-text.watson.cloud.ibm.com/instances/v1/recognize`,
        expiresInSeconds: data.expires_in || 3600,
      };
    } catch (err: any) {
      markKeyCooldown(key, 60);
      console.warn(`[IBM Watson] Key ${idx + 1} failed:`, err.message);
    }
  }

  return null;
}

async function createHuggingFaceSpeechSession(): Promise<SessionResult | null> {
  const allKeys = getProviderKeys('huggingface');
  if (allKeys.length === 0) return null;

  const prioritizedKeys = prioritizeHealthyKeys(allKeys);
  const apiKey = prioritizedKeys[0];
  const keyMask = maskApiKey(apiKey);

  return {
    provider: 'huggingface',
    apiKey,
    keyUsed: keyMask,
    model: HUGGINGFACE_SPEECH_MODELS.WHISPER_LARGE_V3_TURBO,
    wsUrl: `https://router.huggingface.co/hf-inference/models/${HUGGINGFACE_SPEECH_MODELS.WHISPER_LARGE_V3_TURBO}`,
    expiresInSeconds: 3600,
  };
}

const PROVIDER_HANDLERS: Record<SpeechProvider, (userId: string) => Promise<SessionResult | null>> = {
  deepgram: (userId) => createDeepgramSession(userId),
  elevenlabs: () => createElevenLabsSession(),
  azure: () => createAzureSpeechSession(),
  ibm_watson: () => createIBMWatsonSession(),
  huggingface: () => createHuggingFaceSpeechSession(),
};

export async function POST(request: Request) {
  let fallbackToken: string | null = null;
  let body: any = null;

  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
      fallbackToken = body.key || body.apiKey || body.trial_token || body.token || null;
    }
  } catch {
    // Ignore JSON parse errors for empty bodies
  }

  const user = await resolveUser(request, fallbackToken);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  // Check if client requested a specific preferred provider
  const url = new URL(request.url);
  const preferred = (url.searchParams.get('provider') || body?.provider) as SpeechProvider | null;

  const defaultLadder: SpeechProvider[] = ['deepgram', 'elevenlabs', 'azure', 'ibm_watson', 'huggingface'];
  const providerOrder = preferred && defaultLadder.includes(preferred)
    ? [preferred, ...defaultLadder.filter((p) => p !== preferred)]
    : defaultLadder;

  const errors: Record<string, string> = {};

  for (const provider of providerOrder) {
    try {
      const handler = PROVIDER_HANDLERS[provider];
      const session = await handler(user.id);
      if (session) {
        return Response.json(session);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Speech provider ${provider} failed, rotating to next provider:`, message);
      errors[provider] = message;
    }
  }

  return Response.json(
    {
      error: 'No active speech provider available on backend',
      attempted: providerOrder,
      details: errors,
    },
    { status: 500 }
  );
}
