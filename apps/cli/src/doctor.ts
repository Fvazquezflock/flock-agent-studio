import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { databaseLabel, describeDatabaseUrl } from '@mao/shared';
import { ApiClient, loadEnv, repoRoot } from './client';

type Status = 'Disponible' | 'No configurado' | 'Error';
interface Check {
  name: string;
  status: Status;
  detail: string;
}

function cmd(bin: string, args: string[]): { ok: boolean; out: string } {
  // En Windows, pnpm/docker son .cmd: se invocan vía cmd.exe con argumentos fijos (sin interpolar entrada del usuario).
  const viaCmd = process.platform === 'win32' && !bin.endsWith('.exe');
  const r = viaCmd
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', [bin, ...args].join(' ')], { encoding: 'utf8', windowsHide: true, timeout: 20_000 })
    : spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

function tcp(port: number, host = '127.0.0.1', timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(timeoutMs, () => {
      s.destroy();
      resolve(false);
    });
  });
}

/** Diagnóstico del entorno. Nunca imprime credenciales. */
export async function doctor(opts: { mcp: boolean }): Promise<Check[]> {
  loadEnv();
  const checks: Check[] = [];
  const node = process.versions.node;
  checks.push({ name: 'Node.js', status: Number(node.split('.')[0]) >= 22 ? 'Disponible' : 'Error', detail: `v${node}` });
  const pnpm = cmd('pnpm', ['--version']);
  checks.push({ name: 'pnpm', status: pnpm.ok ? 'Disponible' : 'No configurado', detail: pnpm.ok ? pnpm.out.split('\n')[0] : 'Instalá con: npm i -g pnpm@10' });
  const docker = cmd('docker', ['--version']);
  checks.push({ name: 'Docker', status: docker.ok ? 'Disponible' : 'No configurado', detail: docker.ok ? docker.out.split('\n')[0] : 'No instalado: se usa PostgreSQL embebido (pnpm db:start)' });
  const work = describeDatabaseUrl(process.env.DATABASE_URL);
  if (!work) checks.push({ name: 'PostgreSQL (trabajo)', status: 'No configurado', detail: 'DATABASE_URL vacío o inválido en .env' });
  else {
    const up = await tcp(work.port, work.host, work.remote ? 8000 : 2000);
    const tls = ['require', 'verify-ca', 'verify-full'].includes(work.sslmode ?? '');
    const kind = work.remote ? `remota${tls ? ', TLS' : ', sin TLS: agregá sslmode=require'}` : 'local';
    checks.push({
      name: 'PostgreSQL (trabajo)',
      status: up ? (work.remote && !tls ? 'Error' : 'Disponible') : 'Error',
      detail: `${databaseLabel(work)} · ${kind}${up ? '' : work.remote ? ' · sin respuesta (revisá la red o el servicio en Railway)' : ' · sin respuesta (pnpm db:start)'}`,
    });
  }
  const test = describeDatabaseUrl(process.env.TEST_DATABASE_URL);
  if (test) {
    const up = await tcp(test.port, test.host);
    checks.push({ name: 'PostgreSQL (pruebas)', status: up ? 'Disponible' : 'No configurado', detail: `${databaseLabel(test)}${up ? '' : ' · sin respuesta: pnpm db:start antes de pnpm test'}` });
  }

  const claudeBin = process.env.MAO_CLAUDE_BIN || 'claude';
  const ver = cmd(claudeBin, ['--version']);
  if (!ver.ok) checks.push({ name: 'Claude Code', status: 'No configurado', detail: 'No está en el PATH' });
  else {
    const auth = cmd(claudeBin, ['auth', 'status']);
    let logged = false;
    try {
      logged = !!JSON.parse(auth.out).loggedIn;
    } catch {
      /* formato inesperado */
    }
    checks.push({ name: 'Claude Code', status: logged ? 'Disponible' : 'No configurado', detail: `${ver.out.split('\n')[0]} · ${logged ? 'autenticado' : 'sin sesión: ejecutá `claude auth login`'}` });
  }

  const mcpCmd = process.env.MAO_JIRA_MCP_COMMAND || 'MCP/mcp-atlassian/.venv/Scripts/mcp-atlassian.exe';
  const mcpPath = path.resolve(repoRoot, mcpCmd);
  const envFileArg = (process.env.MAO_JIRA_MCP_ARGS || '').split(/\s+/).find((a) => a.endsWith('.env'));
  const envOk = envFileArg ? existsSync(path.resolve(repoRoot, envFileArg)) : false;
  checks.push({
    name: 'MCP Jira (archivos)',
    status: existsSync(mcpPath) && envOk ? 'Disponible' : 'No configurado',
    detail: `${existsSync(mcpPath) ? 'ejecutable encontrado' : `falta ${mcpCmd}`} · ${envOk ? 'archivo de entorno presente (no se lee)' : 'sin archivo de entorno'}`,
  });

  const api = new ApiClient();
  try {
    const st = await api.get('/api/status');
    checks.push({ name: 'API', status: 'Disponible', detail: api.base });
    checks.push({ name: 'Worker', status: st.worker === 'Disponible' ? 'Disponible' : 'Error', detail: st.worker });
    for (const c of st.connections) {
      let conn = c;
      if (opts.mcp) conn = await api.post(`/api/connections/${c.key}/diagnose`);
      const tools = (conn.capabilities as { toolCount?: number } | null)?.toolCount;
      checks.push({
        name: `Conexión ${c.key}`,
        status: conn.status === 'CONNECTED' ? 'Disponible' : conn.status === 'ERROR' ? 'Error' : 'No configurado',
        detail: `${conn.status}${tools ? ` · ${tools} herramientas` : ''} · escritura ${conn.writeEnabled ? 'habilitada' : 'deshabilitada'}${opts.mcp ? '' : ' (usá --mcp para diagnosticar en vivo)'}`,
      });
    }
    for (const p of st.providers) {
      const d = opts.mcp ? await api.post(`/api/providers/${p.key}/diagnose`, { deep: false }) : p;
      checks.push({
        name: `Proveedor ${p.key}`,
        status: d.status === 'AVAILABLE' ? 'Disponible' : d.status === 'ERROR' ? 'Error' : 'No configurado',
        detail: `${p.kind}${p.isDefault ? ' (por defecto)' : ''} · ${d.status}${p.kind === 'MOCK' ? ' · simulación' : ''}`,
      });
    }
  } catch (err) {
    checks.push({ name: 'API', status: 'Error', detail: (err as Error).message });
  }
  return checks;
}
