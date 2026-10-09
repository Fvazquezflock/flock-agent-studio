import type { ModelProviderConfiguration } from '@mao/db';
import type { CoreDeps } from '../context';
import { AnthropicApiProvider, type AnthropicApiConfig } from './anthropic-api';
import { LocalClaudeRunner, type LocalClaudeConfig } from './local-claude';
import { MockModelProvider } from './mock-provider';
import type { IModelProvider } from './types';

/** Fábrica de proveedores a partir de su configuración persistida (sin secretos). */
export function createProvider(cfg: ModelProviderConfiguration, deps?: CoreDeps): IModelProvider {
  if (deps?.providerFactory) return deps.providerFactory(cfg);
  const c = (cfg.config ?? {}) as Record<string, unknown>;
  switch (cfg.kind) {
    case 'MOCK':
      return new MockModelProvider({ latencyMs: typeof c.latencyMs === 'number' ? c.latencyMs : 0 });
    case 'LOCAL_CLAUDE':
      return new LocalClaudeRunner(c as LocalClaudeConfig);
    case 'ANTHROPIC_API':
      return new AnthropicApiProvider(c as AnthropicApiConfig);
  }
}
