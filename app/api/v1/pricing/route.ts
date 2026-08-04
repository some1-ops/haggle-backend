import { PLANS } from '@/lib/plans';

export async function GET() {
  return Response.json({ plans: Object.values(PLANS) });
}
