import { supabaseAdmin } from './supabase';
import { getPlan, type Plan } from './plans';

export interface ResolvedUser {
  id: string; // auth.users.id / profiles.id
  email: string | undefined;
  tierId: string;
  plan: Plan;
  availableCredits: number;
}

import crypto from 'crypto';

/**
 * Desktop app, CLI, and website can authenticate via:
 * 1. Supabase User JWT session token (`Bearer eyJ...`)
 * 2. Algeris Managed API Key (`Bearer hgl_live_...` or `Bearer alg_...`)
 */
export async function resolveUser(request: Request): Promise<ResolvedUser | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  // 1. Managed API Key Lookup (hgl_live_...)
  if (token.startsWith('hgl_live_') || token.startsWith('alg_')) {
    try {
      const keyHash = crypto.createHash('sha256').update(token).digest('hex');
      const { data: apiKeyRow, error: keyErr } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('key_hash', keyHash)
        .eq('status', 'active')
        .maybeSingle();

      if (!keyErr && apiKeyRow) {
        // Update last used timestamp in background
        supabaseAdmin
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', apiKeyRow.id)
          .then();

        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('email, subscription_tier, available_credits')
          .eq('id', apiKeyRow.user_id)
          .single();

        const tierId = profile?.subscription_tier || apiKeyRow.tier || 'pro';
        const plan = getPlan(tierId) ?? getPlan('free')!;

        return {
          id: apiKeyRow.user_id,
          email: profile?.email,
          tierId,
          plan,
          availableCredits: profile?.available_credits ?? 100,
        };
      }
    } catch (e: any) {
      console.warn('resolveUser: API key lookup error', e.message);
    }
  }

  // 2. Supabase Auth Session Token
  const { data: userResult, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userResult?.user) return null;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('subscription_tier, available_credits')
    .eq('id', userResult.user.id)
    .single();

  if (profileErr || !profile) {
    console.error('resolveUser: no profile row for authenticated user', userResult.user.id, profileErr);
    return null;
  }

  const plan = getPlan(profile.subscription_tier) ?? getPlan('free')!;

  return {
    id: userResult.user.id,
    email: userResult.user.email,
    tierId: profile.subscription_tier,
    plan,
    availableCredits: profile.available_credits,
  };
}

/**
 * Uncapped-credit tiers (Elite/Command list creditsPerMonth: null in
 * plans.ts, per "higher AI limits" rather than a hard number) still need an
 * actual ceiling before launch, or a heavy user on Elite has no cost cap at
 * all now that BYOK is gone — see the pricing discussion in chat. Until a
 * real number is chosen, treat null as "not credit-gated" and rely on the
 * per-tier rate limiting you add later, not a bottomless quota.
 */
export function hasCreditsRemaining(user: ResolvedUser): boolean {
  if (user.plan.creditsPerMonth === null) return true;
  return user.availableCredits > 0;
}

/** Atomic — uses the existing deduct_credit RPC rather than a read-then-write. */
export async function deductCredit(userId: string) {
  const { error } = await supabaseAdmin.rpc('deduct_credit', { target_user_id: userId });
  if (error) console.error('deductCredit RPC failed', error);
}
