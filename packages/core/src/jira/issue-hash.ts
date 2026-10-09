import { contentHash } from '../util/hash';
import type { JiraIssue } from './types';

/** Huella de la versión de una issue: si cambia entre la lectura y la escritura, hay conflicto. */
export function issueVersionHash(i: Pick<JiraIssue, 'summary' | 'description' | 'status' | 'updated'>): string {
  return contentHash({ summary: i.summary, description: i.description, status: i.status, updated: i.updated ?? null });
}
