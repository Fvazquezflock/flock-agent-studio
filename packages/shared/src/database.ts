/** Descripción de una URL de PostgreSQL sin credenciales (para diagnóstico, estado y UI). */
export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
  /** true si el host no es loopback (p. ej. Railway). */
  remote: boolean;
  /** Valor de sslmode en la URL (null si no se indicó). */
  sslmode: string | null;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function describeDatabaseUrl(url: string | undefined | null): DatabaseTarget | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return {
      host: u.hostname,
      port: Number(u.port || 5432),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      remote: !LOOPBACK.has(u.hostname),
      sslmode: u.searchParams.get('sslmode'),
    };
  } catch {
    return null;
  }
}

/** "host:puerto/base" — nunca incluye usuario ni contraseña. */
export function databaseLabel(t: DatabaseTarget): string {
  return `${t.host}:${t.port}/${t.database}`;
}
