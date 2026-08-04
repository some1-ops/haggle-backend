import { resolveDevice } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /v1/trial/convert
 * Called by the Dodo webhook handler (not directly by the desktop app) once
 * a subscription payment succeeds for a device that was on trial. Kept as
 * its own endpoint so the webhook handler stays simple and this logic is
 * testable/callable on its own.
 */
export async function POST(request: Request) {
  const device = await resolveDevice(request);
  if (!device) {
    return Response.json({ error: 'Missing or invalid x-haggle-key' }, { status: 401 });
  }

  await supabaseAdmin.from('devices').update({ trial_converted: true }).eq('id', device.id);

  return Response.json({ ok: true });
}
