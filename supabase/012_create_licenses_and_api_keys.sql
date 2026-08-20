-- ==============================================================================
-- Migration 012: Create licenses and api_keys tables
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Create licenses table for standalone device licenses (e.g. HGL-PRO-XXXX-XXXX-XXXX)
CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  email text NOT NULL,
  license_key text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'pro',
  tier text NOT NULL DEFAULT 'pro',
  status text NOT NULL DEFAULT 'active',
  max_devices integer NOT NULL DEFAULT 2,
  hwid text NULL,
  platform text NULL,
  activated_devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  activated_at timestamp with time zone NULL,
  last_verified_at timestamp with time zone NULL,
  expires_at timestamp with time zone NULL,
  payment_id text NULL,
  subscription_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT licenses_pkey PRIMARY KEY (id),
  CONSTRAINT licenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT licenses_status_check CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text, 'suspended'::text]))
) TABLESPACE pg_default;

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_licenses_key ON public.licenses USING btree (license_key) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses USING btree (email) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_licenses_subscription_id ON public.licenses USING btree (subscription_id) TABLESPACE pg_default;

-- 2. Create api_keys table for Algeris Managed API Keys (e.g. hgl_live_...)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Default API Key',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  tier text NOT NULL DEFAULT 'pro',
  monthly_credit_limit integer NULL,
  credits_used integer NOT NULL DEFAULT 0,
  last_used_at timestamp with time zone NULL,
  expires_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT api_keys_status_check CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text]))
) TABLESPACE pg_default;

-- Indexes for api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys USING btree (key_hash) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys USING btree (user_id) TABLESPACE pg_default;

-- 3. Row Level Security (RLS)
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own licenses
CREATE POLICY "Users can view own licenses"
  ON public.licenses FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read their own API keys
CREATE POLICY "Users can view own api keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS automatically and handles insert/update/verify
