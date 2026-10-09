import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { PlatformError } from '../util/errors';
import { extractJson } from './local-claude';
import { toStructuredSchema } from './structured-schema';
import type { IModelProvider, ModelInvocation, ModelResult, ProviderDiagnosis } from './types';

export { toStructuredSchema };

export interface AnthropicApiConfig {
  model?: string;
  /** Nombre de la variable de entorno con la API key (nunca la key en sí). */
  apiKeyEnv?: string;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5-5';

/**
 * Proveedor por API de Anthropic (SDK oficial). Requiere una API key propia en la variable configurada;
 * no reutiliza la sesión de suscripción de Claude Code. Incluye fallback del lado del servidor ante rechazos.
 */
export class AnthropicApiProvider implements IModelProvider {
  readonly kind = 'ANTHROPIC_API' as const;

  constructor(private readonly cfg: AnthropicApiConfig = {}) {}

  private get envName() {
    return this.cfg.apiKeyEnv || 'ANTHROPIC_API_KEY';
  }

  private client(timeoutMs: number): Anthropic {
    const apiKey = process.env[this.envName];
    if (!apiKey) throw new PlatformError('AUTH_ERROR', `La variable ${this.envName} no está definida: el proveedor API no está configurado.`);
    // Los reintentos los gobierna el motor (con backoff y registro), no el SDK.
    return new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs });
  }

  async diagnose(deep = false): Promise<ProviderDiagnosis> {
    const has = !!process.env[this.envName];
    const checks = [{ name: 'credencial', ok: has, detail: has ? `${this.envName} definida` : `${this.envName} no definida` }];
    if (!has) return { status: 'NOT_CONFIGURED', detail: 'Falta la API key en el entorno.', checks };
    if (!deep) return { status: 'AVAILABLE', detail: `Configurado con el modelo ${this.cfg.model ?? DEFAULT_MODEL} (sin invocación de prueba).`, checks };
    try {
      const r = await this.invoke({
        agentKey: 'diagnostic',
        task: 'plan_request',
        systemPrompt: 'Respondé solo con el JSON pedido.',
        userPrompt: 'Devolvé {"ok": true}.',
        outputJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        timeoutMs: 60_000,
        correlationId: randomUUID(),
        effort: 'low',
        context: {},
      });
      return { status: 'AVAILABLE', detail: `Invocación de prueba exitosa (${r.model}).`, checks: [...checks, { name: 'invocación', ok: true, detail: `${r.durationMs} ms` }] };
    } catch (err) {
      return { status: 'ERROR', detail: (err as Error).message, checks: [...checks, { name: 'invocación', ok: false, detail: (err as Error).message }] };
    }
  }

  async invoke(inv: ModelInvocation): Promise<ModelResult> {
    const started = Date.now();
    const model = inv.model && inv.model !== 'default' ? inv.model : (this.cfg.model ?? DEFAULT_MODEL);
    const client = this.client(inv.timeoutMs);
    const params = {
      model,
      max_tokens: inv.maxOutputTokens ?? this.cfg.maxTokens ?? 16000,
      system: inv.systemPrompt,
      messages: [{ role: 'user', content: inv.userPrompt }],
      output_config: {
        effort: inv.effort ?? this.cfg.effort ?? 'medium',
        format: { type: 'json_schema', schema: toStructuredSchema(inv.outputJsonSchema) },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    };
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = (await client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming, { signal: inv.signal })) as Anthropic.Beta.BetaMessage;
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError) throw new PlatformError('CANCELLED', 'Invocación cancelada');
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new PlatformError('TIMEOUT', 'La API de Anthropic no respondió a tiempo');
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new PlatformError('AUTH_ERROR', `API de Anthropic: ${err.message}`);
      if (err instanceof Anthropic.RateLimitError) throw new PlatformError('MODEL_RATE_LIMIT', `API de Anthropic: ${err.message}`);
      if (err instanceof Anthropic.BadRequestError) throw new PlatformError('VALIDATION_ERROR', `API de Anthropic rechazó la solicitud: ${err.message}`);
      if (err instanceof Anthropic.APIError) {
        if (err.status === 529) throw new PlatformError('MODEL_RATE_LIMIT', 'API de Anthropic sobrecargada (529)');
        throw new PlatformError('INTERNAL', `API de Anthropic ${err.status ?? ''}: ${err.message}`);
      }
      if (err instanceof Anthropic.APIConnectionError) throw new PlatformError('INTERNAL', `Sin conexión con la API de Anthropic: ${err.message}`);
      throw err;
    }
    if (response.stop_reason === 'refusal') {
      throw new PlatformError('AUTHORIZATION_ERROR', 'El modelo declinó la solicitud.', { stopDetails: (response as unknown as { stop_details?: unknown }).stop_details ?? null });
    }
    if (response.stop_reason === 'max_tokens') throw new PlatformError('INVALID_RESPONSE', 'La respuesta se cortó por max_tokens');
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return {
      output: extractJson(text),
      simulated: false,
      provider: 'ANTHROPIC_API',
      model: response.model,
      durationMs: Date.now() - started,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
