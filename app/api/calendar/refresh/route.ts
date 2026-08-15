import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { refresh_token?: string };
    const { refresh_token } = body;

    if (!refresh_token) {
      return NextResponse.json({ error: 'Missing refresh_token' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Google OAuth credentials not configured on server' }, { status: 500 });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = (await tokenResponse.json().catch(() => ({}))) as any;

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: data.error_description || data.error || 'Token refresh failed' },
        { status: tokenResponse.status }
      );
    }

    return NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (error: any) {
    console.error('[Calendar/Refresh] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
