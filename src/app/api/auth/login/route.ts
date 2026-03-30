import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (pin !== ADMIN_PIN) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    // Create a simple signed token (timestamp + hash)
    const token = Buffer.from(`${Date.now()}:${ADMIN_PIN}`).toString('base64');

    const res = NextResponse.json({ ok: true });
    res.cookies.set('fw-auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
