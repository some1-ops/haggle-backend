# Haggle API

Backend for Haggle Desktop — replaces the old `api.natively.software`.

## What's built & operational

- **`GET /v1/pricing`** — Reads from `lib/plans.ts`, the single source of truth for pricing and entitlements.
- **`POST /v1/negotiations/start`** — Call this ONCE per negotiation when the session starts. This is the only place a credit gets deducted. Returns `{ sessionId }`.
- **`POST /v1/stt/session`** — Issues short-lived scoped session tokens for speech-to-text with automatic rotation and failover across **Deepgram**, **ElevenLabs**, **Azure Speech**, **IBM Watson**, and **Hugging Face** (`openai/whisper-large-v3-turbo`). Supports optional `?provider=<name>` override and multiple keys per provider.
- **`POST /v1/stt/transcribe`** — Direct speech-to-text audio transcription endpoint (multipart form data or raw audio) with automatic multi-path and multi-key fallback across Hugging Face Whisper Turbo, Groq Whisper, OpenAI Whisper, and Deepgram.
- **`POST /v1/chat`** — AI provider proxy with resilient **multi-key & multi-path automatic fallback cascades** across **Hugging Face**, **Groq**, **Gemini**, **OpenAI**, and **Anthropic**. If one key or provider hits a rate limit (429), quota issue, or outage, the request automatically fails over to alternative keys and next configured providers without stopping operations.
- **`GET /v1/usage`** — Returns current user subscription tier, available credits, and monthly allowances.
- **`POST /api/webhooks/dodo`** — Verifies Dodo Payments / Standard Webhooks (Svix) signatures and updates `subscription_tier` in the shared `profiles` table for activations, renewals, cancellations, and expirations.
- **`npm run sync:dodo`** — Automatically reconciles Dodo Payments catalog against `dodo-products.config.ts` and updates `lib/dodo-product-map.generated.json`.

---

## 2-Dimensional Automatic Fallback Engine

Haggle features a two-dimensional fallback matrix ensuring 100% continuous uptime:

### 1. Dimension 1: Multi-Key Fallback (Within Provider)
If you configure multiple API keys for any provider (e.g. `HUGGINGFACE_API_KEY="key1,key2"` or `HUGGINGFACE_API_KEY_1`, `HUGGINGFACE_API_KEY_2`, `GROQ_API_KEY_ALT`, etc.), when Key 1 hits a rate limit (`429`) or quota error, the provider immediately switches to Key 2, Key 3, etc. seamlessly.

### 2. Dimension 2: Multi-Provider Fallback (Across Providers)
If all keys for a provider are exhausted or the upstream service experiences an outage (`503`), the engine automatically cascades down the multi-path ladder to the next provider:

- **Fast & Lightweight Mode** (`fast_mode: true`):
  1. Groq (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`) ➔
  2. Hugging Face (`meta-llama/Llama-3.2-3B-Instruct` or `Qwen/Qwen2.5-7B-Instruct`) ➔
  3. Gemini (`gemini-2.0-flash`) ➔
  4. OpenAI (`gpt-4o-mini`) ➔
  5. Hugging Face Ultra-Light (`meta-llama/Llama-3.2-1B-Instruct`)

- **Quality / Standard Mode** (default):
  1. Gemini (`gemini-2.0-flash`) or requested provider ➔
  2. Hugging Face (`meta-llama/Llama-3.1-8B-Instruct` / `Qwen/Qwen2.5-72B-Instruct`) ➔
  3. Groq (`llama-3.3-70b-versatile`) ➔
  4. Anthropic (`claude-3-5-sonnet-latest` / `claude-3-5-haiku-latest`) ➔
  5. OpenAI (`gpt-4o`)

- **Supported Hugging Face Models & Aliases**:
  - `llama-3.2-3b` -> `meta-llama/Llama-3.2-3B-Instruct` (Fast lightweight default)
  - `llama-3.2-1b` -> `meta-llama/Llama-3.2-1B-Instruct` (Ultra-low latency)
  - `qwen-2.5-7b` -> `Qwen/Qwen2.5-7B-Instruct` (Top reasoning & speed)
  - `llama-3.1-8b` -> `meta-llama/Llama-3.1-8B-Instruct` (Standard 8B workhorse)
  - `mistral-7b` -> `mistralai/Mistral-7B-Instruct-v0.3`
  - `gemma-2-9b` -> `google/gemma-2-9b-it`
  - `phi-3.5-mini` -> `microsoft/Phi-3.5-mini-instruct`
  - Speech: `openai/whisper-large-v3-turbo` (Ultra-fast Whisper ASR)

---

## Desktop App Integration

1. **Start Negotiation**:
   - Wherever the "Start Session" button in `Launcher.tsx` kicks off audio capture, call `POST /v1/negotiations/start` with header `Authorization: Bearer <supabase_access_token>`.
   - If response is `429` (Out of credits), show the upgrade prompt and halt.
   - If response is `200` (`{ sessionId }`), proceed to speech session and audio capture.

2. **Audio / Speech Capture**:
   - Call `POST /v1/stt/session` with `Authorization: Bearer <supabase_access_token>`.
   - Connect directly to the returned WebSocket streaming URL (`wsUrl`) using the returned `apiKey` or `token`.
   - Or send audio files/chunks directly to `POST /v1/stt/transcribe`.

3. **AI Recommendations / Chat**:
   - Call `POST /v1/chat` with `{ provider?: 'huggingface' | 'groq' | 'anthropic' | 'openai' | 'gemini', model?: '...', messages: [...], fast_mode?: boolean }`.
   - Response returns `{ text, provider, model, fallbackOccurred, attempts }`.

---

## Deploy & Setup Steps

1. **Supabase**:
   - Uses your existing Haggle website Supabase project.
   - Run `supabase/011_command_tier.sql` in the Supabase SQL editor to add the Command tier and update free credit defaults.
   - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` / environment variables.

2. **Dodo Payments**:
   - Configure `DODO_API_KEY` and `DODO_WEBHOOK_SECRET` in `.env`.
   - Run `npm run sync:dodo` to sync products and generate `lib/dodo-product-map.generated.json`.
   - Set the webhook endpoint in Dodo Payments dashboard to `https://<your-domain>/api/webhooks/dodo`.

3. **Speech Providers**:
   - Configure `DEEPGRAM_API_KEY` (and optional `DEEPGRAM_PROJECT_ID`), `ELEVENLABS_API_KEY`, `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`, `IBM_WATSON_API_KEY` / `IBM_WATSON_REGION`, and `HUGGINGFACE_API_KEY`.
   - Multiple keys supported (e.g. `DEEPGRAM_API_KEY_2`, `ELEVENLABS_API_KEY_2`, etc.).

4. **AI Providers**:
   - Add `HUGGINGFACE_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`.
   - Multiple/alternative keys supported per provider (e.g. `HUGGINGFACE_API_KEY_1`, `HUGGINGFACE_API_KEY_2`, `GROQ_API_KEY_ALT`, comma-separated strings).
