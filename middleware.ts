import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require auth
const PUBLIC_PATHS = ['/login', '/api/auth/', '/api/health', '/api/attendance', '/api/sync', '/api/workers'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes (API endpoints needed by Pi kiosks + login)
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = req.cookies.get('fw-auth');
  if (!authCookie?.value) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
