import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const trialToken = request.headers.get('x-trial-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/, '') || '';
    if (!trialToken) {
      return NextResponse.json({ ok: false, error: 'no_trial_token' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const startedAt = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      active: true,
      expires_at: expiresAt,
      started_at: startedAt,
      credits_remaining: 3,
      expired: false,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'trial_status_failed' }, { status: 500 });
  }
}
