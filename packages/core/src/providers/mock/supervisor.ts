import type { CapabilityGap } from '@mao/shared';
import { normalize, overlap } from './text';

type Ctx = Record<string, any>;

interface CatalogEntry {
  key: string;
  name?: string;
  description?: string;
  tags?: string[];
  technologies?: string[];
}

/** Propuesta de skill para una tecnología sin cobertura. Solo datos: sin código ni permisos nuevos. */
function skillGap(tech: string): CapabilityGap {
  const key = `${tech.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}Validation`;
  const isOracle = /oracle|pl\/?sql/i.test(tech);
  return {
    kind: 'SKILL',
    action: 'CREATE',
    evidence: [`Configuración del proyecto › Tecnologías: "${tech}"`, `Catálogo: ninguna skill activa declara la tecnología "${tech}" en appliesTo.technologies`],
    targetKey: key,
    title: `Skill de validación ${tech}`,
    problem: `El proyecto declara la tecnología "${tech}" y ningún agente ni skill activo la cubre. Las tareas que la involucran se generan sin criterios técnicos específicos.`,
    justification: 'Las historias de la épica dependen de esa tecnología; sin criterios específicos aumenta el riesgo de tareas incompletas.',
    solution: `Crear la skill ${key} y asignarla a BackendSpecialist y FullstackSpecialist para las tareas que la involucren.`,
    definition: {
      name: `Validación ${tech}`,
      description: `Criterios para analizar y descomponer trabajo que involucra ${tech}.`,
      instructions: [
        `# Validación ${tech}`,
        '',
        `Usá esta skill cuando una historia o tarea involucre ${tech}.`,
        '',
        '## Qué revisar',
        isOracle ? '- Llamadas a paquetes y procedimientos: firma, parámetros y manejo de excepciones (ORA-xxxxx).' : '- Contratos y versiones de la tecnología involucrada.',
        isOracle ? '- Transacciones: commit/rollback explícito y bloqueo de filas al reservar recursos compartidos.' : '- Manejo de errores y reintentos.',
        isOracle ? '- Uso de variables bind y límites de tiempo de ejecución.' : '- Límites de rendimiento.',
        '- Plan de pruebas con datos representativos.',
        '',
        '## Qué producir',
        '- Riesgos técnicos concretos y una actividad de verificación por cada uno.',
      ].join('\n'),
      rules: ['No inventar nombres de objetos de base de datos: citá solo los que aparecen en las issues.', 'Toda recomendación debe referir a una issue o regla de negocio.'],
      constraints: ['Solo análisis: no ejecuta consultas ni comandos.'],
      appliesTo: { tasks: ['technical_breakdown', 'validate_plan'], technologies: [tech] },
      tags: [normalize(tech)],
    },
    tools: [],
    permissions: [],
    impact: 'Tareas Backend/Fullstack con riesgos y criterios de finalización específicos de la tecnología.',
    risks: ['Instrucciones demasiado genéricas si no se ajustan al esquema real del proyecto.'],
    tests: ['Ejecutar EPIC_TO_STORIES_AND_TASKS sobre la épica demo y verificar que las tareas con integración incluyan los criterios de la skill.'],
  };
}

export function supervisorReview(ctx: Ctx) {
  const outputs = (ctx.outputs ?? {}) as Record<string, any>;
  const technologies = (ctx.technologies ?? []) as string[];
  const agents = (ctx.catalog?.agents ?? []) as CatalogEntry[];
  const skills = (ctx.catalog?.skills ?? []) as CatalogEntry[];
  const conflicts: { between: string[]; description: string; resolution: string }[] = [];
  const recommendations: string[] = [];

  const validation = Object.values(outputs).find((o) => o && Array.isArray(o.issues) && 'verdict' in o);
  const errors = (validation?.issues ?? []).filter((i: any) => i.severity === 'error');
  const warnings = (validation?.issues ?? []).filter((i: any) => i.severity === 'warning');
  if (errors.length) conflicts.push({ between: ['FunctionalAnalyst', 'QAValidator'], description: `QA marcó ${errors.length} error(es) sobre las historias generadas.`, resolution: 'Corregir antes de aprobar o regenerar con observaciones.' });
  const dups = Object.values(outputs).flatMap((o: any) => (Array.isArray(o?.tasks) ? o.tasks.filter((t: any) => t.duplicateOf) : []));
  if (dups.length) conflicts.push({ between: ['Especialistas', 'Jira'], description: `${dups.length} tarea(s) equivalen a tareas existentes.`, resolution: 'Se excluyen de la publicación.' });
  const review = Object.values(outputs).find((o: any) => o?.diagnosis);
  if (review && review.diagnosis.readiness !== 'READY') recommendations.push('Aplicar las mejoras propuestas antes de planificar la historia en un sprint.');
  if (warnings.length) recommendations.push(`Revisar ${warnings.length} advertencia(s) de QA en la vista de aprobación.`);
  const coverage = Object.values(outputs).find((o: any) => Array.isArray(o?.coverage) && o.coverage[0]?.criterion !== undefined);
  const gaps = coverage ? coverage.coverage.filter((c: any) => c.gap).length : 0;
  if (gaps) recommendations.push(`${gaps} criterio(s) sin cobertura de tareas.`);

  const covered = (tech: string) => {
    const t = normalize(tech);
    return [...agents, ...skills].some((e) => [...(e.tags ?? []), ...(e.technologies ?? [])].some((x) => normalize(x).includes(t) || t.includes(normalize(x))) || overlap(e.description ?? '', tech) >= 2);
  };
  const capabilityGaps = technologies.filter((t) => !covered(t)).map(skillGap);
  if (capabilityGaps.length) recommendations.push(`Se detectaron ${capabilityGaps.length} capacidad(es) faltante(s); se generan propuestas en borrador.`);

  const qualityScore = Math.max(0, Math.min(100, 100 - errors.length * 15 - warnings.length * 4 - gaps * 5 - dups.length * 2));
  return {
    qualityScore,
    summary: `Calidad estimada ${qualityScore}/100. ${errors.length} error(es) y ${warnings.length} advertencia(s) de validación. ${conflicts.length} conflicto(s) entre resultados.`,
    conflicts,
    recommendations,
    capabilityGaps,
  };
}

/** CapabilityDesigner: completa la definición propuesta con ejemplos y una plantilla de salida. */
export function designCapability(ctx: Ctx): CapabilityGap {
  const gap = ctx.gap as CapabilityGap;
  const tech = String((gap.definition.appliesTo as { technologies?: string[] } | undefined)?.technologies?.[0] ?? gap.targetKey);
  // Si la definición llega vacía (p. ej. al regenerar un borrador), se arma una mínima válida desde el problema y la solución.
  const base = {
    name: gap.title,
    description: gap.problem,
    instructions: `# ${gap.title}\n\n${gap.solution}`,
    appliesTo: { tasks: ['technical_breakdown'], technologies: [] as string[] },
  };
  return {
    ...gap,
    definition: {
      ...(gap.kind === 'SKILL' ? base : {}),
      ...gap.definition,
      examples: [
        {
          title: 'Riesgo técnico bien formulado',
          content: `Riesgo: la reserva se confirma en la app pero falla en ${tech}. Verificación: prueba de integración que simula el error y valida el rollback.`,
        },
      ],
      templates: [{ name: 'Riesgo y verificación', content: '- Riesgo: <qué puede fallar>\n- Evidencia: <issue o regla>\n- Verificación: <prueba concreta>' }],
    },
    tests: [...gap.tests, `Probar la skill desde "Skills → Probar" y revisar que el prompt compuesto incluya las reglas de ${tech}.`],
  };
}

export function planRequest(ctx: Ctx) {
  const text = String(ctx.text ?? '');
  const orchestrators = (ctx.catalog?.orchestrators ?? []) as { key: string; name: string; keywords: string[]; inputFields: { key: string; type: string }[] }[];
  const projects = (ctx.projects ?? []) as { key: string; jiraProjectKey: string }[];
  const issueKey = /\b([A-Z][A-Z0-9_]+-\d+)\b/.exec(text)?.[1];
  const n = normalize(text);
  const score = (o: (typeof orchestrators)[number]) => o.keywords.reduce((acc, k) => acc + (n.includes(normalize(k)) ? 1 : 0), 0);
  const ranked = orchestrators.map((o) => ({ o, s: score(o) })).sort((a, b) => b.s - a.s);
  const best = ranked[0] && ranked[0].s > 0 ? ranked[0].o : undefined;
  const projectKey =
    (ctx.projectKey as string | undefined) ??
    (issueKey ? projects.find((p) => p.jiraProjectKey === issueKey.split('-')[0])?.key : undefined) ??
    null;
  if (!best) {
    return {
      orchestratorKey: null,
      projectKey,
      input: {},
      rationale: 'Ningún orquestador registrado coincide con la solicitud.',
      confidence: 0.2,
      steps: [],
      missingCapability: `No hay un flujo para: "${text.slice(0, 160)}"`,
    };
  }
  const input: Record<string, string> = {};
  const keyField = best.inputFields.find((f) => f.type === 'issueKey');
  if (keyField && issueKey) input[keyField.key] = issueKey;
  const rest = text.replace(issueKey ?? '', '').trim();
  const extra = best.inputFields.find((f) => f.type === 'text');
  if (extra && rest) input[extra.key] = rest;
  const confidence = Math.min(0.95, 0.5 + ranked[0].s * 0.15 + (issueKey ? 0.15 : 0) + (projectKey ? 0.1 : 0));
  return {
    orchestratorKey: best.key,
    projectKey,
    input,
    rationale: `Coincide con las palabras clave de ${best.key}${issueKey ? ` y referencia la issue ${issueKey}` : ''}${projectKey ? `; proyecto ${projectKey}` : '; no se identificó el proyecto'}.`,
    confidence,
    steps: [],
  };
}
