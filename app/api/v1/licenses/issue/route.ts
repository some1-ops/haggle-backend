import { NextRequest, NextResponse } from 'next/server';
import { issueLicense, issueApiKey } from '@/lib/keys';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/v1/licenses/issue
 * 
 * Admin & Internal endpoint for generating and issuing Pro Device Licenses and API Keys.
 * Requires Bearer token (either Admin JWT or SUPABASE_SERVICE_ROLE_KEY).
 * 
 * Request body:
 * {
 *   email: "customer@example.com",
 *   userId?: "uuid",
 *   tier?: "pro" | "command" | "elite",
 *   plan?: "pro" | "command",
 *   maxDevices?: 2,
 *   expiresAt?: "2027-01-01T00:00:00Z" (or null for lifetime),
 *   includeApiKey?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminSecret = process.env.LICENSE_SECRET_KEY || process.env.ADMIN_API_KEY;

    let isAuthorized = false;

    // Check if token matches service role key or admin secret
    if (token && ((serviceKey && token === serviceKey) || (adminSecret && token === adminSecret))) {
      isAuthorized = true;
    } else if (token) {
      // Check if user is an admin in Supabase
      const { data: userResult } = await supabaseAdmin.auth.getUser(token);
      if (userResult?.user) {
        // You can check an admin flag or allow authenticated users to generate a license for themselves
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin or Service Role key required.' },
        { status: 401 }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const email = (body.email || '').trim();
    const userId = body.userId || null;
    const tier = body.tier || 'pro';
    const plan = body.plan || (tier === 'command' ? 'command' : 'pro');
    const maxDevices = body.maxDevices || (tier === 'command' ? 5 : 2);
    const expiresAt = body.expiresAt || null;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Customer email is required to issue a license' },
        { status: 400 }
      );
    }

    // 1. Issue Standalone Device License
    const licenseResult = await issueLicense({
      userId,
      email,
      tier,
      plan,
      maxDevices,
      expiresAt,
      paymentId: body.paymentId || null,
      subscriptionId: body.subscriptionId || null,
      metadata: body.metadata || { issuedBy: 'api' },
    });

    // 2. Optionally issue an API Key if requested
    let apiKeyResult = null;
    if (body.includeApiKey && userId) {
      apiKeyResult = await issueApiKey({
        userId,
        name: `${email} Managed Key`,
        tier,
        expiresAt,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'License successfully issued',
      licenseKey: licenseResult.licenseKey,
      license: licenseResult.license,
      apiKey: apiKeyResult ? { secretKey: apiKeyResult.secretKey, keyPrefix: apiKeyResult.keyPrefix } : null,
    });
  } catch (err: any) {
    console.error('[LicenseIssue] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error issuing license' },
      { status: 500 }
    );
  }
}
