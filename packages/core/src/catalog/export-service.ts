import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { agentDefinitionSchema, skillDefinitionSchema } from '@mao/shared';
import type { Core } from '../core';
import type { Actor } from '../context';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
const yamlStr = (s: string) => JSON.stringify(s.replace(/\s+/g, ' ').trim());

/**
 * Exporta a archivos compatibles con Claude Code (.claude/agents/*.md y .claude/skills/<n>/SKILL.md)
 * SOLO desde versiones ACTIVAS (aprobadas). La fuente de verdad sigue siendo la base de datos.
 */
export class ExportService {
  constructor(private readonly core: Core) {}

  async exportClaudeCode(actor: Actor) {
    const prisma = this.core.deps.prisma;
    const root = path.join(this.core.deps.repoRoot, 'exports', 'claude-code', '.claude');
    rmSync(root, { recursive: true, force: true });
    const files: string[] = [];
    const [agents, skills] = await Promise.all([
      prisma.agent.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
      prisma.skill.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
    ]);
    for (const s of skills) {
      if (!s.activeVersion) continue;
      const d = skillDefinitionSchema.parse(s.activeVersion.definition);
      const dir = path.join(root, 'skills', kebab(s.key));
      mkdirSync(dir, { recursive: true });
      const body = [
        '---',
        `name: ${kebab(s.key)}`,
        `description: ${yamlStr(d.description || d.name)}`,
        '---',
        '',
        `<!-- Generado desde ${s.key} v${s.activeVersion.version} (checksum ${s.activeVersion.checksum.slice(0, 12)}). No editar: se regenera desde la plataforma. -->`,
        '',
        d.instructions.trim(),
        d.rules.length ? `\n## Reglas\n${d.rules.map((r) => `- ${r}`).join('\n')}` : '',
        d.constraints.length ? `\n## Restricciones\n${d.constraints.map((r) => `- ${r}`).join('\n')}` : '',
        ...d.templates.map((t) => `\n## Plantilla: ${t.name}\n\n${t.content}`),
        ...d.examples.map((e) => `\n## Ejemplo: ${e.title}\n\n${e.content}`),
        '',
      ].join('\n');
      writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8');
      files.push(path.relative(this.core.deps.repoRoot, path.join(dir, 'SKILL.md')));
    }
    mkdirSync(path.join(root, 'agents'), { recursive: true });
    for (const a of agents) {
      if (!a.activeVersion) continue;
      const d = agentDefinitionSchema.parse(a.activeVersion.definition);
      const file = path.join(root, 'agents', `${kebab(a.key)}.md`);
      const body = [
        '---',
        `name: ${kebab(a.key)}`,
        `description: ${yamlStr(d.description || d.objective || d.name)}`,
        // Solo herramientas de lectura: las escrituras externas pasan por la plataforma.
        'tools: Read, Grep, Glob',
        'model: inherit',
        '---',
        '',
        `<!-- Generado desde ${a.key} v${a.activeVersion.version} (checksum ${a.activeVersion.checksum.slice(0, 12)}). No editar: se regenera desde la plataforma. -->`,
        '',
        d.systemPrompt.trim(),
        d.objective ? `\n## Objetivo\n${d.objective}` : '',
        d.responsibilities.length ? `\n## Responsabilidades\n${d.responsibilities.map((r) => `- ${r}`).join('\n')}` : '',
        d.constraints.length ? `\n## Restricciones\n${d.constraints.map((r) => `- ${r}`).join('\n')}` : '',
        d.skills.length ? `\n## Skills asignadas\n${d.skills.map((s) => `- ${kebab(s)}`).join('\n')}` : '',
        '',
      ].join('\n');
      writeFileSync(file, body, 'utf8');
      files.push(path.relative(this.core.deps.repoRoot, file));
    }
    await this.core.audit.record({ actor, action: 'CLAUDE_CODE_EXPORTED', entityType: 'Export', entityId: 'claude-code', summary: `Exportados ${files.length} archivo(s) a exports/claude-code` });
    return { directory: path.relative(this.core.deps.repoRoot, root), files };
  }
}
