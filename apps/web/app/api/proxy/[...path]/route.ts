import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API = (process.env.MAO_API_URL || 'http://127.0.0.1:4317').replace(/\/$/, '');

function forbidden(message: string) {
  return Response.json({ error: { code: 'AUTHORIZATION_ERROR', message } }, { status: 403 });
}

/**
 * Proxy de la UI hacia la API. El token del propietario vive solo en el servidor de Next;
 * el navegador nunca lo recibe. Las mutaciones exigen encabezado anti-CSRF y mismo origen.
 */
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const token = process.env.MAO_OWNER_TOKEN;
  if (!token) return Response.json({ error: { code: 'AUTH_ERROR', message: 'MAO_OWNER_TOKEN no está configurado en el servidor web' } }, { status: 500 });
  const { path } = await ctx.params;
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.headers.get('x-mao-csrf') !== '1') return forbidden('Falta el encabezado anti-CSRF');
    const site = req.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return forbidden('Solicitud entre sitios bloqueada');
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) return forbidden('Origen no permitido');
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'X-MAO-Channel': 'UI', Accept: req.headers.get('accept') ?? 'application/json' };
  const lastEventId = req.headers.get('last-event-id');
  if (lastEventId) headers['Last-Event-ID'] = lastEventId;
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await req.text();
    headers['Content-Type'] = 'application/json';
  }
  const url = `${API}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { method, headers, body: body || (method === 'GET' ? undefined : '{}'), cache: 'no-store', signal: req.signal });
  } catch {
    return Response.json({ error: { code: 'MCP_DISCONNECTED', message: `No se pudo conectar con la API (${API}). ¿Está iniciada?` } }, { status: 502 });
  }
  const out = new Headers();
  for (const h of ['content-type', 'cache-control']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (out.get('content-type')?.includes('text/event-stream')) out.set('X-Accel-Buffering', 'no');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
