import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { ownerActor, PlatformError, type Actor, type Core } from '@mao/core';

/** Valida con Zod y traduce el error al formato de la plataforma. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw new PlatformError('VALIDATION_ERROR', 'Datos inválidos', { issues: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) });
  }
  return r.data;
}

const CHANNELS = ['UI', 'CLI', 'CLAUDE_CODE', 'API'] as const;
export type Channel = (typeof CHANNELS)[number];

export function channelOf(req: FastifyRequest): Channel {
  const h = String(req.headers['x-mao-channel'] ?? 'API').toUpperCase();
  return (CHANNELS as readonly string[]).includes(h) ? (h as Channel) : 'API';
}

/** MVP local: un único propietario autenticado por token; el canal queda registrado en auditoría. */
export function actorOf(core: Core, req: FastifyRequest): Actor {
  return ownerActor(core.deps, channelOf(req));
}

export type Q = Record<string, string | undefined>;
export const query = (req: FastifyRequest) => (req.query ?? {}) as Q;
export const params = (req: FastifyRequest) => (req.params ?? {}) as Record<string, string>;

export function send(reply: FastifyReply, data: unknown, status = 200) {
  return reply.code(status).send(data);
}
