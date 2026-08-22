import { resolveUser } from '@/lib/auth';
import { transcribeAudioWithFallback } from '@/lib/providers';

/**
 * POST /v1/stt/transcribe
 *
 * Direct speech-to-text audio transcription endpoint.
 * Accepts multipart/form-data (field 'file' or 'audio') or raw binary audio stream.
 *
 * Automatically cascades across a 2-3+ path fallback ladder:
 * Path 1: Hugging Face Whisper Large v3 Turbo (ultra fast & lightweight)
 * Path 2: Groq Whisper (high throughput)
 * Path 3: OpenAI Whisper (fallback)
 * Path 4: Deepgram Nova-2
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  const fallbackToken = request.headers.get('x-haggle-key') || request.headers.get('x-trial-token') || null;

  const user = await resolveUser(request, fallbackToken);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  let audioBuffer: Buffer;
  let mimeType = 'audio/wav';
  let fileName = 'audio.wav';
  let preferredProvider: any = null;
  let customApiKey: string | undefined = undefined;

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = (formData.get('file') || formData.get('audio')) as File | null;
      if (!file) {
        return Response.json({ error: 'No audio file provided in multipart form data (field: file or audio)' }, { status: 400 });
      }

      preferredProvider = formData.get('provider') as any;
      customApiKey = (formData.get('customApiKey') as string) || undefined;
      fileName = file.name || 'audio.wav';
      mimeType = file.type || 'audio/wav';

      const arrayBuf = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuf);
    } else {
      // Raw binary payload
      const arrayBuf = await request.arrayBuffer();
      if (!arrayBuf || arrayBuf.byteLength === 0) {
        return Response.json({ error: 'Empty audio payload' }, { status: 400 });
      }

      mimeType = contentType || 'audio/wav';
      audioBuffer = Buffer.from(arrayBuf);

      const url = new URL(request.url);
      preferredProvider = url.searchParams.get('provider') as any;
    }

    const result = await transcribeAudioWithFallback({
      audioBuffer,
      mimeType,
      fileName,
      preferredProvider,
      customApiKey,
    });

    return Response.json(
      {
        text: result.text,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
        fallbackOccurred: result.fallbackOccurred,
        attempts: result.attempts,
      },
      {
        headers: {
          'x-provider-used': result.provider,
          'x-model-used': result.model,
          'x-fallback-occurred': String(result.fallbackOccurred),
        },
      }
    );
  } catch (err: any) {
    console.error('[Speech Transcribe API] All providers failed:', err);
    return Response.json(
      {
        error: err.message || 'Speech transcription failed across all providers',
      },
      { status: 502 }
    );
  }
}
