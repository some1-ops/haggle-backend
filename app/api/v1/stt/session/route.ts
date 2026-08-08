import { resolveUser } from '@/lib/auth';

/**
 * POST /v1/stt/session
 *
 * Issues short-lived scoped credentials or streaming session configurations
 * for speech-to-text providers (Deepgram, ElevenLabs, Azure Speech, IBM Watson).
 *
 * Automatically rotates and falls back across available configured providers
 * if any provider encounters an error or is unreachable.
 */

type SpeechProvider = 'deepgram' | 'elevenlabs' | 'azure' | 'ibm_watson';

interface SessionResult {
  provider: SpeechProvider;
  apiKey?: string;
  token?: string;
  wsUrl: string;
  region?: string;
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
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return null;

  const projectId = await getDeepgramProjectId(apiKey);
  const ttlSeconds = 60 * 60; // 1 hour

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
        wsUrl: 'wss://api.deepgram.com/v1/listen',
        expiresInSeconds: ttlSeconds,
      };
    }
  }

  // Fallback to direct key if project key issuance fails
  return {
    provider: 'deepgram',
    apiKey,
    wsUrl: 'wss://api.deepgram.com/v1/listen',
    expiresInSeconds: ttlSeconds,
  };
}

async function createElevenLabsSession(): Promise<SessionResult | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === 'your_elevenlabs_key_here') return null;

  return {
    provider: 'elevenlabs',
    apiKey,
    wsUrl: 'wss://api.elevenlabs.io/v1/convai/conversation',
    expiresInSeconds: 3600,
  };
}

async function createAzureSpeechSession(): Promise<SessionResult | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';
  if (!key || key === 'your_azure_key_here') return null;

  const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-type': 'application/x-www-form-urlencoded',
      'Content-Length': '0',
    },
  });

  if (!res.ok) {
    throw new Error(`Azure Speech token issue failed: ${res.statusText}`);
  }

  const token = await res.text();
  return {
    provider: 'azure',
    token,
    region,
    wsUrl: `wss://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
    expiresInSeconds: 600,
  };
}

async function createIBMWatsonSession(): Promise<SessionResult | null> {
  const key = process.env.IBM_WATSON_API_KEY;
  const region = process.env.IBM_WATSON_REGION || 'us-south';
  if (!key || key === 'your_ibm_key_here') return null;

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
  params.append('apikey', key);

  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`IBM Watson token issue failed: ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  return {
    provider: 'ibm_watson',
    token: data.access_token,
    region,
    wsUrl: `wss://api.${region}.speech-to-text.watson.cloud.ibm.com/instances/v1/recognize`,
    expiresInSeconds: data.expires_in || 3600,
  };
}

const PROVIDER_HANDLERS: Record<SpeechProvider, (userId: string) => Promise<SessionResult | null>> = {
  deepgram: (userId) => createDeepgramSession(userId),
  elevenlabs: () => createElevenLabsSession(),
  azure: () => createAzureSpeechSession(),
  ibm_watson: () => createIBMWatsonSession(),
};

export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  // Check if client requested a specific preferred provider
  const url = new URL(request.url);
  const preferred = url.searchParams.get('provider') as SpeechProvider | null;

  const defaultLadder: SpeechProvider[] = ['deepgram', 'elevenlabs', 'azure', 'ibm_watson'];
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
