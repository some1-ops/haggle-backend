import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { code?: string; redirect_uri?: string };
    const { code, redirect_uri } = body;

    if (!code || !redirect_uri) {
      return NextResponse.json({ error: 'Missing code or redirect_uri' }, { status: 400 });
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
        code,
        grant_type: 'authorization_code',
        redirect_uri,
      }),
    });

    const data = (await tokenResponse.json().catch(() => ({}))) as any;

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: data.error_description || data.error || 'Token exchange failed' },
        { status: tokenResponse.status }
      );
    }

    return NextResponse.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token, // Only sent on first auth
      expires_in: data.expires_in,
    });
  } catch (error: any) {
    console.error('[Calendar/Exchange] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
