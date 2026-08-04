import { resolveDevice } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const TRIAL_LENGTH_DAYS = 7; // adjust to whatever you decide

export async function GET(request: Request) {
  const device = await resolveDevice(request);
  if (!device) {
    return Response.json({ error: 'Missing or invalid x-haggle-key' }, { status: 401 });
  }

  const { data: row } = await supabaseAdmin
    .from('devices')
    .select('trial_started_at, trial_converted, plan_id')
    .eq('id', device.id)
    .single();

  if (!row?.trial_started_at) {
    return Response.json({ status: 'not_started' });
  }

  const startedAt = new Date(row.trial_started_at);
  const daysElapsed = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, TRIAL_LENGTH_DAYS - daysElapsed);

  return Response.json({
    status: row.trial_converted ? 'converted' : daysRemaining > 0 ? 'active' : 'expired',
    daysRemaining: Math.ceil(daysRemaining),
    planId: row.plan_id,
  });
}
