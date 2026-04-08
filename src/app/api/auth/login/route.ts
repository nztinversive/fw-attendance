import { NextRequest, NextResponse } from 'next/server';
import { createAdminToken, getAdminCookieMaxAge, getAdminCookieName } from '@/lib/auth';

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (pin !== ADMIN_PIN) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const token = await createAdminToken();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(getAdminCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: getAdminCookieMaxAge(),
      path: '/',
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
