import { NextResponse, type NextRequest } from 'next/server';

/** Solo se atiende con Host de loopback (protección contra DNS rebinding). */
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
    return new NextResponse('Host no permitido', { status: 421 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/:path*' };
