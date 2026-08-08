# Haggle API

Backend for Haggle Desktop — replaces the old `api.natively.software`.

## What's built & operational

- **`GET /v1/pricing`** — Reads from `lib/plans.ts`, the single source of truth for pricing and entitlements.
- **`POST /v1/negotiations/start`** — Call this ONCE per negotiation when the session starts. This is the only place a credit gets deducted. Returns `{ sessionId }`.
- **`POST /v1/stt/session`** — Issues short-lived scoped session tokens for speech-to-text with automatic rotation and failover across **Deepgram**, **ElevenLabs**, **Azure Speech**, and **IBM Watson**. Supports optional `?provider=<name>` override.
- **`POST /v1/chat`** — AI provider proxy to Anthropic, OpenAI, Gemini, and Groq using backend keys.
- **`GET /v1/usage`** — Returns current user subscription tier, available credits, and monthly allowances.
- **`POST /api/webhooks/dodo`** — Verifies Dodo Payments / Standard Webhooks (Svix) signatures and updates `subscription_tier` in the shared `profiles` table for activations, renewals, cancellations, and expirations.
- **`npm run sync:dodo`** — Automatically reconciles Dodo Payments catalog against `dodo-products.config.ts` and updates `lib/dodo-product-map.generated.json`.

---

## Desktop App Integration

1. **Start Negotiation**:
   - Wherever the "Start Session" button in `Launcher.tsx` kicks off audio capture, call `POST /v1/negotiations/start` with header `Authorization: Bearer <supabase_access_token>`.
   - If response is `429` (Out of credits), show the upgrade prompt and halt.
   - If response is `200` (`{ sessionId }`), proceed to speech session and audio capture.

2. **Audio / Speech Capture**:
   - Call `POST /v1/stt/session` with `Authorization: Bearer <supabase_access_token>`.
   - Connect directly to the returned WebSocket streaming URL (`wsUrl`) using the returned `apiKey` or `token`.

3. **AI Recommendations / Chat**:
   - Call `POST /v1/chat` with `{ provider: 'groq' | 'anthropic' | 'openai' | 'gemini', model: '...', messages: [...] }`.

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
   - Configure `DEEPGRAM_API_KEY` (and optional `DEEPGRAM_PROJECT_ID`), `ELEVENLABS_API_KEY`, `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`, `IBM_WATSON_API_KEY` / `IBM_WATSON_REGION`.
   - The backend will automatically rotate across any configured providers.

4. **AI Providers**:
   - Add `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` for active chat providers.
