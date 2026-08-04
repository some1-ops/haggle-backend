import { resolveDevice } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/** POST /v1/trial/start — call once, the first time a device opens the app. */
export async function POST(request: Request) {
  const device = await resolveDevice(request);
  if (!device) {
    return Response.json({ error: 'Missing or invalid x-haggle-key' }, { status: 401 });
  }

  const { data: row } = await supabaseAdmin
    .from('devices')
    .select('trial_started_at')
    .eq('id', device.id)
    .single();

  if (row?.trial_started_at) {
    return Response.json({ trialStartedAt: row.trial_started_at, alreadyStarted: true });
  }

  const startedAt = new Date().toISOString();
  await supabaseAdmin.from('devices').update({ trial_started_at: startedAt }).eq('id', device.id);

  return Response.json({ trialStartedAt: startedAt, alreadyStarted: false });
}
