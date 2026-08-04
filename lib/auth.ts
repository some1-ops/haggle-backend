import { supabaseAdmin } from './supabase';
import { getPlan, type Plan } from './plans';

export interface ResolvedDevice {
  id: string;
  hwid: string;
  planId: string;
  plan: Plan;
  planStatus: string;
}

/**
 * Every desktop app request carries `x-haggle-key: <hwid>` (rename from the
 * old x-natively-key). This is NOT a secret — it's a device identifier, the
 * same role the old HWID-bound trial system played. Real payment
 * entitlement is looked up server-side from Supabase, never trusted from
 * the client. This is the "desktop app should not own your secrets"
 * principle from the migration plan.
 *
 * If you add real user accounts later, swap this for verifying a Supabase
 * Auth JWT from the Authorization header instead — the shape of
 * ResolvedDevice below stays the same either way, so callers don't change.
 */
export async function resolveDevice(request: Request): Promise<ResolvedDevice | null> {
  const hwid = request.headers.get('x-haggle-key');
  if (!hwid) return null;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('devices')
    .select('*')
    .eq('hwid', hwid)
    .maybeSingle();

  if (fetchErr) {
    console.error('resolveDevice fetch error', fetchErr);
    return null;
  }

  let device = existing;

  // First time this device has ever called the API — auto-provision it on
  // the free plan rather than requiring a separate signup step.
  if (!device) {
    const { data: created, error: insertErr } = await supabaseAdmin
      .from('devices')
      .insert({ hwid, plan_id: 'free' })
      .select('*')
      .single();

    if (insertErr) {
      console.error('resolveDevice insert error', insertErr);
      return null;
    }
    device = created;
  }

  const plan = getPlan(device.plan_id) ?? getPlan('free')!;

  return {
    id: device.id,
    hwid: device.hwid,
    planId: device.plan_id,
    plan,
    planStatus: device.plan_status,
  };
}

/** Returns the current calendar-month period key, e.g. "2026-08-01". */
export function currentPeriodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Checks whether a device has quota remaining this period WITHOUT
 * incrementing it — call this before starting a session/chat call.
 * Call recordUsage() only after the call actually succeeds.
 */
export async function checkQuota(device: ResolvedDevice) {
  const period = currentPeriodStart();
  const { data } = await supabaseAdmin
    .from('usage_records')
    .select('*')
    .eq('device_id', device.id)
    .eq('period_start', period)
    .maybeSingle();

  const sessionsUsed = data?.sessions_used ?? 0;
  const allowed = sessionsUsed < device.plan.sessionsPerMonth;

  return {
    allowed,
    sessionsUsed,
    sessionsLimit: device.plan.sessionsPerMonth,
    period,
  };
}

export async function recordUsage(deviceId: string, opts: { sessionIncrement?: number; minutesIncrement?: number }) {
  const period = currentPeriodStart();
  const { data: existing } = await supabaseAdmin
    .from('usage_records')
    .select('*')
    .eq('device_id', deviceId)
    .eq('period_start', period)
    .maybeSingle();

  const sessions = (existing?.sessions_used ?? 0) + (opts.sessionIncrement ?? 0);
  const minutes = Number(existing?.minutes_used ?? 0) + (opts.minutesIncrement ?? 0);

  await supabaseAdmin.from('usage_records').upsert(
    {
      device_id: deviceId,
      period_start: period,
      sessions_used: sessions,
      minutes_used: minutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id,period_start' }
  );
}
