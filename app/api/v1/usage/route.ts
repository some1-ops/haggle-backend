import { resolveUser } from '@/lib/auth';

/** GET /v1/usage — lets either client show "2 of 3 free negotiations left" etc. */
export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  // Convert the PlanFeatures object {byok: true, exports: false, undetectableTier: 'advanced', ...}
  // into a flat string array of enabled feature keys — ['byok', 'exports', ...]
  // The desktop FeatureContext calls hasFeature('byok') against this array.
  // Boolean `true` features are included; string-value fields (undetectableTier) get their own key.
  const featuresObj = user.plan.features as Record<string, unknown>;
  const featureKeys: string[] = [];
  for (const [key, value] of Object.entries(featuresObj)) {
    if (value === true) {
      featureKeys.push(key);
    } else if (typeof value === 'string' && value !== 'standard') {
      // Include special string-valued features like undetectableTier=advanced/max
      featureKeys.push(`${key}:${value}`);
    }
  }

  return Response.json({
    tierId: user.tierId,
    tierName: user.plan.name,
    availableCredits: user.availableCredits,
    creditsPerMonth: user.plan.creditsPerMonth, // null = not credit-gated at this tier
    plan: user.plan,
    features: featureKeys,
  });
}
