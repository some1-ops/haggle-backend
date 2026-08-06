-- Migration 011: Add Command tier, update Bootstrapper (free) credit default
-- Run in: Supabase Dashboard -> SQL Editor (same project as the haggle website repo)
-- This is additive only — does not touch existing elite/mercenary data.

ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'command';
ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'command_yearly';

-- New free-tier default is 3 credits (Bootstrapper), not 2.
-- Update the trigger function so new signups get the new default:
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, available_credits, subscription_tier)
  VALUES (NEW.id, 3, 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Existing free-tier users keep whatever credit count they currently have —
-- deliberately NOT bumping everyone to 3 here, since that would hand out
-- free credits retroactively. If you want existing free users bumped too,
-- uncomment:
-- UPDATE profiles SET available_credits = 3 WHERE subscription_tier = 'free' AND available_credits = 2;
