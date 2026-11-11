import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verifySession } from '@/lib/auth';

// Jalur yang boleh diakses tanpa login. /api/agent/* punya autentikasi token sendiri.
const PUBLIC_EXACT = ['/login', '/api/auth/login'];
const PUBLIC_PREFIX = ['/api/agent/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const authed = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Tolak request tulis lintas-origin.
  if (pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch {
        host = '';
      }
      if (host !== req.headers.get('host')) {
        return NextResponse.json({ error: 'Origin tidak valid' }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|agent/).*)'],
};
