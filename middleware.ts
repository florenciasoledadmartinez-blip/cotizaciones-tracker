import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyTokenEdge } from '@/lib/auth-edge';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const token = getTokenFromRequest(request);
    if (!token || !(await verifyTokenEdge(token))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const token = getTokenFromRequest(request);
  if (!token || !(await verifyTokenEdge(token))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
