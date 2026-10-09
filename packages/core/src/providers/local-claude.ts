import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlatformError } from '../util/errors';
import { truncate } from '../util/sanitize';
import { toStructuredSchema } from './structured-schema';
import type { IModelProvider, ModelInvocation, ModelResult, ModelUsage, ProviderDiagnosis } from './types';

export interface LocalClaudeConfig {
  bin?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
}

/**
 * Nombre del archivo temporal con el prompt de sistema. El correlationId del motor trae ":" (ejecución:etapa:intento),
 * que Windows no admite en nombres de archivo (fallaba con ENOENT): se reemplaza todo lo que no sea seguro.
 */
export function promptFileName(correlationId: string): string {
  return `system-${correlationId.replace(/[^A-Za-z0-9._-]/g, '_')}-${process.pid}.md`;
}

/**
 * Uso de tokens de la salida JSON de `claude -p`. `modelUsage` trae el total por modelo (incluida la caché y los
 * modelos auxiliares); `usage` es el respaldo. Verificado con Claude Code 2.1.128: `input_tokens` solo cuenta la
 * entrada sin caché, que suele ser mínima; la mayor parte va en `cache_creation_input_tokens`/`cache_read_input_tokens`.
 */
export function claudeCodeUsage(result: Record<string, any>): ModelUsage {
  const perModel = Object.values((result.modelUsage ?? {}) as Record<string, Record<string, number>>);
  if (perModel.length) {
    const sum = (k: string) => perModel.reduce((n, m) => n + (Number(m[k]) || 0), 0);
    return {
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      cacheCreationInputTokens: sum('cacheCreationInputTokens'),
      cacheReadInputTokens: sum('cacheReadInputTokens'),
      costUsd: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : sum('costUSD'),
    };
  }
  const u = result.usage ?? {};
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    costUsd: result.total_cost_usd,
  };
}

/** Extrae el primer objeto JSON de un texto (tolerante a cercos de código). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* sigue */
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* sigue */
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new PlatformError('INVALID_RESPONSE', 'La respuesta del modelo no contiene JSON');
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ya terminó */
      }
    }
  }
}

/**
 * Runner local de Claude Code en modo no interactivo (`claude -p`), mecanismo oficial de ejecución programática.
 * - Sin herramientas (`--tools ""`) y sin servidores MCP (`--strict-mcp-config`): el modelo solo analiza.
 * - Salida estructurada validada con `--json-schema`; la plataforma vuelve a validar con Zod.
 * - Corre en un directorio vacío para no heredar CLAUDE.md ni configuración del repositorio.
 * - Usa la autenticación que tenga la CLI (`claude auth login`); la plataforma no lee ni copia credenciales.
 */
export class LocalClaudeRunner implements IModelProvider {
  readonly kind = 'LOCAL_CLAUDE' as const;
  private readonly bin: string;

  constructor(private readonly cfg: LocalClaudeConfig = {}) {
    this.bin = cfg.bin || process.env.MAO_CLAUDE_BIN || 'claude';
  }

  private workDir(): string {
    const dir = path.join(os.tmpdir(), 'mao-claude-runner');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  async diagnose(deep = false): Promise<ProviderDiagnosis> {
    const checks: ProviderDiagnosis['checks'] = [];
    const ver = spawnSync(this.bin, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    if (ver.status !== 0) {
      checks.push({ name: 'binario', ok: false, detail: `No se pudo ejecutar "${this.bin} --version"` });
      return { status: 'NOT_CONFIGURED', detail: 'Claude Code no está instalado o no está en el PATH.', checks };
    }
    checks.push({ name: 'binario', ok: true, detail: ver.stdout.trim() });
    const auth = spawnSync(this.bin, ['auth', 'status'], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    let loggedIn = false;
    let method = 'desconocido';
    try {
      const j = JSON.parse(auth.stdout);
      loggedIn = !!j.loggedIn;
      method = j.authMethod ?? method;
    } catch {
      /* formato inesperado */
    }
    checks.push({ name: 'autenticación', ok: loggedIn, detail: loggedIn ? `Autenticado (${method})` : 'No autenticado: ejecutá `claude auth login`' });
    if (!loggedIn) return { status: 'NOT_CONFIGURED', detail: 'Claude Code está instalado pero la CLI no tiene sesión iniciada.', checks };
    if (deep) {
      try {
        const r = await this.invoke({
          agentKey: 'diagnostic',
          task: 'plan_request',
          systemPrompt: 'Respondé solo con el JSON pedido.',
          userPrompt: 'Devolvé {"ok": true}.',
          outputJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
          timeoutMs: 120_000,
          maxBudgetUsd: 0.05,
          correlationId: randomUUID(),
          context: {},
        });
        checks.push({ name: 'invocación', ok: true, detail: `OK en ${r.durationMs} ms (${r.model})` });
      } catch (err) {
        checks.push({ name: 'invocación', ok: false, detail: (err as Error).message });
        return { status: 'ERROR', detail: 'La invocación de prueba falló.', checks };
      }
    }
    return { status: 'AVAILABLE', detail: deep ? 'Invocación de prueba exitosa.' : 'Instalado y autenticado (sin invocación de prueba).', checks };
  }

  async invoke(inv: ModelInvocation): Promise<ModelResult> {
    const started = Date.now();
    const dir = this.workDir();
    const promptFile = path.join(dir, promptFileName(inv.correlationId));
    writeFileSync(promptFile, inv.systemPrompt, 'utf8');
    const model = inv.model && inv.model !== 'default' ? inv.model : this.cfg.model;
    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      // Con el esquema crudo de Zod Claude Code ignora --json-schema y responde texto libre (EX-13).
      JSON.stringify(toStructuredSchema(inv.outputJsonSchema)),
      '--system-prompt-file',
      promptFile,
      '--tools',
      '',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--session-id',
      randomUUID(),
    ];
    if (model) args.push('--model', model);
    if (inv.effort ?? this.cfg.effort) args.push('--effort', (inv.effort ?? this.cfg.effort)!);
    if (inv.maxBudgetUsd) args.push('--max-budget-usd', String(inv.maxBudgetUsd));

    try {
      const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
        const child = spawn(this.bin, args, { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'mao-platform' } });
        let out = '';
        let err = '';
        let settled = false;
        const finish = (fn: () => void) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            inv.signal?.removeEventListener('abort', onAbort);
            fn();
          }
        };
        const timer = setTimeout(() => {
          killTree(child.pid);
          finish(() => reject(new PlatformError('TIMEOUT', `Claude Code no respondió en ${inv.timeoutMs} ms`)));
        }, inv.timeoutMs);
        const onAbort = () => {
          killTree(child.pid);
          finish(() => reject(new PlatformError('CANCELLED', 'Invocación cancelada')));
        };
        inv.signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', (d) => (out += d.toString('utf8')));
        child.stderr.on('data', (d) => (err += d.toString('utf8')));
        child.on('error', (e) => finish(() => reject(new PlatformError('TOOL_UNAVAILABLE', `No se pudo ejecutar Claude Code: ${e.message}`))));
        child.on('close', (c) => finish(() => resolve({ stdout: out, stderr: err, code: c })));
        child.stdin.end(inv.userPrompt, 'utf8');
      });

      let result: Record<string, any>;
      try {
        result = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? '{}');
      } catch {
        throw new PlatformError(code === 0 ? 'INVALID_RESPONSE' : 'INTERNAL', `Salida inesperada de Claude Code: ${truncate(stdout || stderr, 300)}`);
      }
      if (result.is_error) {
        const msg = String(result.result ?? result.subtype ?? 'error');
        if (/not logged in|login|authenticat|401|api key/i.test(msg)) throw new PlatformError('AUTH_ERROR', `Claude Code: ${msg}`);
        if (/rate|usage limit|limit reached|overloaded|429|529/i.test(msg)) throw new PlatformError('MODEL_RATE_LIMIT', `Claude Code: ${msg}`);
        if (/budget/i.test(msg)) throw new PlatformError('MODEL_RATE_LIMIT', `Claude Code: presupuesto agotado (${msg})`);
        throw new PlatformError('INVALID_RESPONSE', `Claude Code: ${truncate(msg, 300)}`);
      }
      const output = result.structured_output ?? extractJson(String(result.result ?? ''));
      return {
        output,
        simulated: false,
        provider: 'LOCAL_CLAUDE',
        model: Object.keys(result.modelUsage ?? {})[0] ?? model ?? 'default',
        durationMs: Date.now() - started,
        usage: claudeCodeUsage(result),
        sessionId: result.session_id,
      };
    } finally {
      rmSync(promptFile, { force: true });
    }
  }
}
