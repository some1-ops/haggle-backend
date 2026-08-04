import { resolveDevice, checkQuota } from '@/lib/auth';

export async function GET(request: Request) {
  const device = await resolveDevice(request);
  if (!device) {
    return Response.json({ error: 'Missing or invalid x-haggle-key' }, { status: 401 });
  }

  const quota = await checkQuota(device);

  return Response.json({
    planId: device.planId,
    planStatus: device.planStatus,
    sessionsUsed: quota.sessionsUsed,
    sessionsLimit: quota.sessionsLimit,
    period: quota.period,
  });
}
