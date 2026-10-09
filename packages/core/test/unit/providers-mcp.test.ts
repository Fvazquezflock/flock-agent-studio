import { projectConfigSchema, TASK_CONTRACTS, taskOutputJsonSchema } from '@mao/shared';
import { describe, expect, it } from 'vitest';
import { DemoJiraGateway } from '../../src/jira/demo-gateway';
import { mcpLinkArgs, parseMcpIssue } from '../../src/jira/mcp-gateway';
import { computeCapabilities } from '../../src/mcp/capability-map';
import { reviveStructuredOutput, toStructuredSchema } from '../../src/providers/structured-schema';
import { claudeCodeUsage, extractJson, promptFileName } from '../../src/providers/local-claude';
import { MockModelProvider } from '../../src/providers/mock-provider';
import type { ModelInvocation } from '../../src/providers/types';

const config = projectConfigSchema.parse({});
const inv = (task: ModelInvocation['task'], context: Record<string, unknown>): ModelInvocation => ({
  agentKey: 'x',
  task,
  systemPrompt: '',
  userPrompt: '',
  outputJsonSchema: {},
  timeoutMs: 1000,
  correlationId: 'c1',
  context,
});

describe('MockModelProvider (simulación determinística)', () => {
  const mock = new MockModelProvider();
  const gw = new DemoJiraGateway();

  it('marca sus resultados como simulados y respeta los contratos', async () => {
    const epic = await gw.getIssue('DEMO-100');
    const children = await gw.getChildren('DEMO-100');
    const r = await mock.invoke(inv('functional_analysis', { epic, existingStories: children.filter((c) => c.issueType === 'Story'), config }));
    expect(r.simulated).toBe(true);
    expect(TASK_CONTRACTS.functional_analysis.output.safeParse(r.output).success).toBe(true);
  });

  it('es determinístico y no duplica capacidades ya cubiertas', async () => {
    const epic = await gw.getIssue('DEMO-100');
    const existing = (await gw.getChildren('DEMO-100')).filter((c) => c.issueType === 'Story');
    const a = await mock.invoke(inv('generate_stories', { epic, existingStories: existing, config }));
    const b = await mock.invoke(inv('generate_stories', { epic, existingStories: existing, config }));
    expect(a.output).toEqual(b.output);
    const titles = (a.output as { stories: { title: string }[] }).stories.map((s) => s.title);
    expect(titles.some((t) => /^Cancelar/.test(t))).toBe(true);
    expect(titles.some((t) => /^Reservar/.test(t))).toBe(false); // DEMO-102 ya la cubre
    expect(titles.some((t) => /^Consultar/.test(t))).toBe(false); // DEMO-101 ya la cubre
  });

  it('detecta contenido de Jira con instrucciones inyectadas', async () => {
    const root = await gw.getIssue('DEMO-100');
    const children = await gw.getChildren('DEMO-100');
    const r = await mock.invoke(inv('summarize_context', { mode: 'epic', root, children, related: [] }));
    expect((r.output as { untrustedContentWarnings: string[] }).untrustedContentWarnings.join(' ')).toMatch(/DEMO-103/);
  });

  it('el especialista Frontend no inventa tareas para procesos sin interfaz', async () => {
    const r = await mock.invoke(inv('technical_breakdown', { specialty: 'FRONTEND', stories: [{ ref: 'S1', title: 'Enviar recordatorios por email 24 horas antes del turno', acceptanceCriteria: ['x'] }], existingTasks: [], config }));
    const out = r.output as { tasks: unknown[]; notApplicable: unknown[] };
    expect(out.tasks).toHaveLength(0);
    expect(out.notApplicable).toHaveLength(1);
  });

  it('el diagnóstico de HU señala términos ambiguos', async () => {
    const story = await gw.getIssue('DEMO-102');
    const parent = await gw.getIssue('DEMO-100');
    const r = await mock.invoke(inv('story_review', { story, parent, config }));
    const out = r.output as { problems: { area: string }[]; diagnosis: { readiness: string } };
    expect(out.problems.filter((p) => p.area === 'AMBIGUITY').length).toBeGreaterThanOrEqual(3);
    expect(out.diagnosis.readiness).toBe('NOT_READY');
  });

  it('puede simular fallos transitorios para probar reintentos', async () => {
    const flaky = new MockModelProvider({ failTimes: { plan_request: 1 } });
    await expect(flaky.invoke(inv('plan_request', { text: 'x', catalog: { orchestrators: [] }, projects: [] }))).rejects.toMatchObject({ code: 'MODEL_RATE_LIMIT' });
    await expect(flaky.invoke(inv('plan_request', { text: 'x', catalog: { orchestrators: [] }, projects: [] }))).resolves.toBeDefined();
  });
});

describe('adaptador MCP Jira', () => {
  it('normaliza el formato real de mcp-atlassian', () => {
    const i = parseMcpIssue({
      id: '10000',
      key: 'SCRUM-1',
      summary: 'Tarea 1',
      browse_url: 'https://example.atlassian.net/browse/SCRUM-1',
      status: { name: 'Idea', category: 'Por hacer' },
      issue_type: { name: 'Feature' },
      project: { key: 'SCRUM', name: 'Team Astro' },
      updated: '2026-10-09 12:03:41 Hora estándar de Argentina',
      parent: { key: 'SCRUM-9' },
      issuelinks: [{ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inward_issue: { key: 'SCRUM-2', summary: 'Otra' } }],
    });
    expect(i).toMatchObject({ key: 'SCRUM-1', projectKey: 'SCRUM', issueType: 'Feature', status: 'Idea', parentKey: 'SCRUM-9', updated: '2026-10-09 12:03:41 Hora estándar de Argentina' });
    expect(i.links[0]).toMatchObject({ type: 'Blocks', direction: 'inward', label: 'is blocked by', issue: { key: 'SCRUM-2' } });
  });

  it('publica los vínculos en la dirección verificada contra Jira Cloud (la bloqueante va como inward_issue_key)', () => {
    // Dominio: SCRUM-6 bloquea a SCRUM-9 (outward = bloqueante, inward = bloqueada).
    expect(mcpLinkArgs({ linkType: 'Blocks', outwardKey: 'SCRUM-6', inwardKey: 'SCRUM-9' })).toEqual({ link_type: 'Blocks', inward_issue_key: 'SCRUM-6', outward_issue_key: 'SCRUM-9' });
    // Lo que Jira devolvió después de crearlo así (formato real de mcp-atlassian).
    const type = { id: '10000', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' };
    const blocked = parseMcpIssue({ key: 'SCRUM-9', issuelinks: [{ id: '10001', type, inward_issue: { id: '10005', key: 'SCRUM-6', fields: { summary: 'Registrar un reclamo desde el portal', issuetype: { name: 'Historia' } } } }] });
    const blocking = parseMcpIssue({ key: 'SCRUM-6', issuelinks: [{ id: '10001', type, outward_issue: { id: '10008', key: 'SCRUM-9', fields: { summary: 'Notificar por correo los cambios de estado del reclamo' } } }] });
    expect(blocked.links[0]).toMatchObject({ direction: 'inward', label: 'is blocked by', issue: { key: 'SCRUM-6', issueType: 'Historia' } });
    expect(blocking.links[0]).toMatchObject({ direction: 'outward', label: 'blocks', issue: { key: 'SCRUM-9' } });
  });

  it('el mapa de capacidades refleja lo realmente disponible y nunca mapea borrados', () => {
    const caps = computeCapabilities(['jira_get_issue', 'jira_search', 'jira_create_issue', 'jira_delete_issue'], false);
    const by = Object.fromEntries(caps.map((c) => [c.operation, c]));
    expect(by.GetIssue.supported).toBe(true);
    expect(by.GetIssueTypes.supported).toBe(false);
    expect(by.CreateIssue.note).toMatch(/deshabilitada/);
    expect(caps.some((c) => c.tool === 'jira_delete_issue')).toBe(false);
  });
});

describe('proveedores reales (sin invocar)', () => {
  it('extrae JSON de respuestas con cercos de código', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Respuesta: {"b": 2} fin')).toEqual({ b: 2 });
    expect(() => extractJson('sin json')).toThrow();
  });

  it('lee el consumo de Claude Code incluida la caché (input_tokens solo es la entrada sin caché)', () => {
    // Forma real de `claude -p --output-format json` (Claude Code 2.1.128).
    const real = {
      usage: { input_tokens: 17, cache_creation_input_tokens: 6779, cache_read_input_tokens: 6655, output_tokens: 144 },
      modelUsage: { 'claude-haiku-4-5-20251001': { inputTokens: 17, outputTokens: 144, cacheReadInputTokens: 6655, cacheCreationInputTokens: 6779, costUSD: 0.00987625 } },
      total_cost_usd: 0.00987625,
    };
    expect(claudeCodeUsage(real)).toEqual({ inputTokens: 17, outputTokens: 144, cacheCreationInputTokens: 6779, cacheReadInputTokens: 6655, costUsd: 0.00987625 });
    // Varios modelos (p. ej. uno auxiliar): se suman.
    const two = { modelUsage: { a: { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4, costUSD: 0.1 }, b: { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 40, costUSD: 0.2 } } };
    expect(claudeCodeUsage(two)).toMatchObject({ inputTokens: 11, outputTokens: 22, cacheReadInputTokens: 33, cacheCreationInputTokens: 44 });
    expect(claudeCodeUsage(two).costUsd).toBeCloseTo(0.3);
    // Sin modelUsage: respaldo en usage.
    expect(claudeCodeUsage({ usage: real.usage, total_cost_usd: 0.01 })).toMatchObject({ inputTokens: 17, cacheCreationInputTokens: 6779, cacheReadInputTokens: 6655, outputTokens: 144 });
  });

  it('el archivo temporal del prompt no usa caracteres inválidos en Windows (EX-13 fallaba con ENOENT)', () => {
    const name = promptFileName('cmv19j6k1000el5wc9d0di7c8:context:3');
    expect(name).toMatch(/^system-cmv19j6k1000el5wc9d0di7c8_context_3-\d+\.md$/);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('adapta el JSON Schema a salidas estructuradas (objetos cerrados, sin restricciones)', () => {
    const s = toStructuredSchema({ type: 'object', properties: { a: { type: 'string', minLength: 3, default: 'x' }, b: { type: 'array', items: { type: 'object', properties: { c: { type: 'number', minimum: 0 } } } } }, required: ['a'] }) as any;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.a.minLength).toBeUndefined();
    expect(s.properties.a.default).toBeUndefined();
    expect(s.properties.b.items.additionalProperties).toBe(false);
    expect(s.properties.b.items.properties.c.minimum).toBeUndefined();
  });

  it('los esquemas reales de los contratos quedan sin $schema ni default (Claude Code los ignoraba: EX-13)', () => {
    for (const task of Object.keys(TASK_CONTRACTS) as (keyof typeof TASK_CONTRACTS)[]) {
      const text = JSON.stringify(toStructuredSchema(taskOutputJsonSchema(task)));
      expect(text, task).not.toContain('"$schema"');
      expect(text, task).not.toContain('"default"');
      expect(JSON.parse(text).additionalProperties, task).toBe(false);
    }
  });

  it('ningún objeto queda cerrado y sin propiedades (solo admitiría {}: CP-2 a CP-4 salían vacías)', () => {
    const closedEmpty: string[] = [];
    const walk = (n: unknown, path: string, task: string) => {
      if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`, task));
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (o.type === 'object' && !o.properties) closedEmpty.push(`${task}${path}`);
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`, task);
    };
    for (const task of Object.keys(TASK_CONTRACTS) as (keyof typeof TASK_CONTRACTS)[]) walk(toStructuredSchema(taskOutputJsonSchema(task)), '', task);
    expect(closedEmpty).toEqual([]);
  });

  it('los objetos de forma libre viajan como texto JSON y vuelven a ser objetos antes de validar el contrato', () => {
    const schema = taskOutputJsonSchema('design_capability');
    const structured = toStructuredSchema(schema) as any;
    expect(structured.properties.definition.type).toBe('string');
    expect(structured.properties.definition.description).toMatch(/Para SKILL/);
    const definition = { name: 'Cumplimiento Ley 25.326', instructions: '# Checklist ARCO', appliesTo: { tasks: ['technical_breakdown'] } };
    const fromModel = { kind: 'SKILL', targetKey: 'RegulatoryComplianceAR', title: 't', problem: 'p', justification: 'j', solution: 's', definition: JSON.stringify(definition), impact: 'i' };
    const revived = reviveStructuredOutput(schema, fromModel) as any;
    expect(revived.definition).toEqual(definition);
    expect(TASK_CONTRACTS.design_capability.output.safeParse(revived).success).toBe(true);
    // Anidado en un arreglo (supervisor_review.capabilityGaps[]) y en el plan del supervisor.
    const review = reviveStructuredOutput(taskOutputJsonSchema('supervisor_review'), { capabilityGaps: [fromModel] }) as any;
    expect(review.capabilityGaps[0].definition).toEqual(definition);
    const plan = reviveStructuredOutput(taskOutputJsonSchema('plan_request'), { input: '{"epicKey":"SCRUM-5"}' }) as any;
    expect(plan.input).toEqual({ epicKey: 'SCRUM-5' });
    // Los objetos (proveedor simulado) no se tocan; un texto que no es JSON queda como texto y el contrato lo rechaza.
    expect(reviveStructuredOutput(schema, { definition })).toEqual({ definition });
    expect((reviveStructuredOutput(schema, { definition: 'no es json' }) as any).definition).toBe('no es json');
  });
});
