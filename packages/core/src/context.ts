import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrisma, loadRootEnv, type ModelProviderConfiguration, type PrismaClient, type Project, type Connection } from '@mao/db';
import type { IJiraGateway } from './jira/types';
import type { IModelProvider } from './providers/types';

export type ActorType = 'USER' | 'AGENT' | 'SYSTEM' | 'WORKER';

export interface Actor {
  type: ActorType;
  id: string;
  /** Canal por el que actuó una persona: UI, CLI, CLAUDE_CODE, API. */
  channel?: string;
}

export interface GatewayRequest {
  project: Project & { connection: Connection | null };
}

export interface CoreDeps {
  prisma: PrismaClient;
  ownerName: string;
  repoRoot: string;
  /** Habilitación global de escrituras reales en Jira (además de conexión y política). */
  allowJiraWrites: boolean;
  /** Fábricas reemplazables en pruebas. */
  gatewayFactory?: (req: GatewayRequest) => IJiraGateway;
  providerFactory?: (cfg: ModelProviderConfiguration) => IModelProvider;
  now?: () => Date;
}

export function defaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export function defaultDeps(overrides: Partial<CoreDeps> = {}): CoreDeps {
  loadRootEnv();
  return {
    prisma: overrides.prisma ?? getPrisma(),
    ownerName: overrides.ownerName ?? (process.env.MAO_OWNER_NAME || 'Propietario local'),
    repoRoot: overrides.repoRoot ?? defaultRepoRoot(),
    allowJiraWrites: overrides.allowJiraWrites ?? process.env.MAO_ALLOW_JIRA_WRITES === 'true',
    gatewayFactory: overrides.gatewayFactory,
    providerFactory: overrides.providerFactory,
    now: overrides.now,
  };
}

/** El MVP local tiene un único propietario; la arquitectura admite identidades futuras. */
export function ownerActor(deps: CoreDeps, channel = 'UI'): Actor {
  return { type: 'USER', id: deps.ownerName, channel };
}

export const SYSTEM_ACTOR: Actor = { type: 'SYSTEM', id: 'platform' };
