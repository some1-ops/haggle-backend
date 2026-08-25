import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Optional
    }

    return NextResponse.json({
      ok: true,
      converted: true,
      choice: body?.choice || 'unknown',
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'convert_failed' }, { status: 500 });
  }
}
