import { resolveUser } from '@/lib/auth';

/** GET /v1/usage — lets either client show "2 of 3 free negotiations left" etc. */
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  return Response.json({
    tierId: user.tierId,
    tierName: user.plan.name,
    availableCredits: user.availableCredits,
    creditsPerMonth: user.plan.creditsPerMonth, // null = not credit-gated at this tier
    plan: user.plan,
    features: user.plan.features,
  });
}
