import type { OrchestratorDefinition, OrchestratorStepDefinition, ProjectConfig, TaskType } from '@mao/shared';
import type { Connection, Execution, ExecutionStep, ModelProviderConfiguration, Project } from '@mao/db';
import type { Core } from '../core';
import type { IJiraGateway } from '../jira/types';
import type { EventLevel } from './events';

export type LoadedExecution = Execution & {
  project: Project & { connection: Connection | null };
  provider: ModelProviderConfiguration;
  steps: ExecutionStep[];
};

export interface PinnedSnapshot {
  orchestrator: { key: string; versionId: string; version: number; checksum: string };
  projectConfig: { id: string; version: number; checksum: string };
  globalConfigVersion: number;
  agents: { key: string; versionId: string; version: number; checksum: string }[];
  skills: { key: string; versionId: string; version: number; checksum: string }[];
  policies: { id: string; operationType: string; scope: string; mode: string; version: number }[];
  provider: { key: string; kind: string };
  config: ProjectConfig;
}

export interface StepContext {
  core: Core;
  execution: LoadedExecution;
  step: ExecutionStep;
  def: OrchestratorStepDefinition;
  definition: OrchestratorDefinition;
  snapshot: PinnedSnapshot;
  config: ProjectConfig;
  input: Record<string, string>;
  /** Salidas de las etapas completadas, por clave. */
  outputs: Record<string, unknown>;
  signal: AbortSignal;
  gateway(): IJiraGateway;
  emit(type: string, message: string, opts?: { level?: EventLevel; data?: unknown }): Promise<void>;
  runAgent(agentKey: string, task: TaskType, context: Record<string, unknown>): Promise<unknown>;
  /** Busca la salida de la etapa que resolvió una tarea (o un handler). */
  findOutput<T = any>(match: { task?: TaskType; handler?: string; key?: string }): T | undefined;
  findOutputs<T = any>(match: { task?: TaskType; handler?: string }): { key: string; output: T }[];
}

export type StepOutcome =
  | { status: 'COMPLETED'; output: unknown; summary?: string }
  | { status: 'WAITING_APPROVAL'; output: unknown; summary?: string }
  | { status: 'SKIPPED'; output?: unknown; summary: string };

export interface StepHandler {
  run(ctx: StepContext): Promise<StepOutcome>;
}
