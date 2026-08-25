import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const TRIAL_SECRET = process.env.LICENSE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'haggle_trial_secret_2026';

export async function POST(request: NextRequest) {
  try {
    let hwid = 'unknown_hwid';
    try {
      const body: any = await request.json();
      if (body?.hwid) hwid = String(body.hwid);
    } catch {
      // Body parse optional
    }

    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days trial
    const payload = `${hwid}:${startedAt}:${expiresAt}`;
    const sig = crypto.createHmac('sha256', TRIAL_SECRET).update(payload).digest('hex').slice(0, 16);
    const trialToken = `haggle_trial_${Buffer.from(payload).toString('base64url')}.${sig}`;

    return NextResponse.json({
      ok: true,
      trial_token: trialToken,
      started_at: startedAt,
      expires_at: expiresAt,
      expired: false,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'trial_start_failed' }, { status: 500 });
  }
}
