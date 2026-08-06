import { supabaseAdmin } from './supabase';
import { getPlan, type Plan } from './plans';

export interface ResolvedUser {
  id: string; // auth.users.id / profiles.id
  email: string | undefined;
  tierId: string;
  plan: Plan;
  availableCredits: number;
}

/**
 * Desktop app and website both send `Authorization: Bearer <supabase_access_token>`
 * — the same access_token the website's Supabase Auth session already
 * produces on sign-in. This is the token handed to the desktop app over the
 * haggle:// callback described in the login page patch. No separate device
 * concept anymore — a user's entitlement now genuinely follows their
 * account across web and desktop, which is the whole point of syncing them.
 */
export async function resolveUser(request: Request): Promise<ResolvedUser | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

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
