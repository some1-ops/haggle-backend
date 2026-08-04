# Haggle API

Backend for Haggle Desktop — replaces the old `api.natively.software`. Verified: `npm install`, `npx tsc --noEmit`, and `npx next build` all pass clean in this scaffold.

## What's built vs. what's still a stub

**Built and working, pending your keys/IDs:**
- `GET /v1/pricing` — reads from `lib/plans.ts`, the single source of truth for pricing (fixes the 3 different numbers currently shown across the app)
- `POST /v1/chat` — the BYOK replacement. Auth via `x-haggle-key` header (device HWID), checks plan + quota server-side, proxies to Anthropic/OpenAI/Gemini/Groq using YOUR keys, records usage
- `GET /v1/usage` — quota remaining this period
- `POST /v1/trial/start`, `GET /v1/trial/status`, `POST /v1/trial/convert`
- `POST /api/webhooks/dodo` — verifies Dodo's webhook signature, updates entitlement in Supabase

**Not built yet — same pattern, follow the existing routes as a template:**
- `/api/calendar/exchange`, `/api/calendar/refresh` (Google OAuth token exchange)
- `/api/reviews`
- STT session/relay — **this one specifically does NOT belong on Vercel.** Vercel serverless functions can't hold a persistent WebSocket connection for streaming audio. Deploy the STT relay separately on Fly.io or Railway (a small always-on Node process), and only issue short-lived session tokens for it from this Vercel API. Don't try to force streaming STT into a Vercel function.

## Deploy steps

1. **Supabase**: new project → SQL editor → run `supabase/schema.sql` → copy Project URL and `service_role` key (Settings → API) into your env vars. Never expose the service_role key to the desktop app or any client-side code.
2. **Vercel**: `vercel` CLI or dashboard import → set all vars from `.env.example` in Project Settings → Environment Variables.
3. **Dodo Payments**: create your final products (resolve the pricing-mismatch decision first) → get the webhook signing secret → set `DODO_WEBHOOK_SECRET` → point Dodo's webhook URL at `https://<your-domain>/api/webhooks/dodo` → fill in `DODO_PRODUCT_TO_PLAN` in `app/api/webhooks/dodo/route.ts` with the real product IDs → **pass `metadata: { hwid }` at checkout creation time**, the webhook depends on it to know which device to credit.
4. **Provider keys**: add `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` for whichever providers you're actually keeping live now that BYOK is going away.
5. **Desktop app changes needed**: replace direct calls to `api.anthropic.com` etc. in `electron/LLMHelper.ts` with a call to your new `/v1/chat` endpoint, sending `x-haggle-key: <hwid>` instead of a user-entered key. Also remove or repurpose the "AI Providers" BYOK settings screen — you decided to strip it, so that UI should either disappear or become read-only/advanced-only.

## Before you rely on this in production

- The Dodo webhook signature verification uses the Standard Webhooks (Svix) header format — this is my best understanding of Dodo's scheme, but **verify the exact header names and secret encoding against Dodo's current webhook docs** before going live. Getting this wrong either rejects real webhooks or (worse) accepts forged ones.
- `sessionIncrement`/`minutesIncrement` in `recordUsage()` currently only count a session once per `isNewSession: true` call — the desktop app needs to send that flag correctly (true on the first cascade call of a negotiation, false on every follow-up within it), and should PATCH the real elapsed minutes to `/v1/usage` when a session ends so `minutes_used` isn't always 0.
- No rate limiting beyond the monthly quota — a device could hammer `/v1/chat` with many requests within its quota window. Add per-minute rate limiting (Vercel Edge Config, or Upstash Redis) if that becomes a real cost risk.
