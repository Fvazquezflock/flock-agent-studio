import type { OrchestratorDefinition } from '@mao/shared';

type OrchestratorSeed = { key: string; definition: Omit<OrchestratorDefinition, 'steps'> & { steps: Partial<OrchestratorDefinition['steps'][number]>[] } };

export const ORCHESTRATOR_SEEDS: OrchestratorSeed[] = [
  {
    key: 'EPIC_TO_STORIES_AND_TASKS',
    definition: {
      name: 'Épica → Historias → Tareas',
      objective: 'Analizar una épica y proponer historias de usuario y tareas técnicas listas para aprobar y publicar.',
      description: 'Lee la épica y su contexto, analiza el alcance, genera historias, las descompone por especialidad en paralelo, valida, planifica dependencias y pide aprobación antes de publicar.',
      useConditions: ['Hay una épica con alcance descripto y faltan historias o tareas.', 'Se quiere completar el backlog de una épica existente.'],
      keywords: ['épica', 'epica', 'epic', 'historias', 'proponé historias', 'generar historias', 'tareas técnicas', 'backlog'],
      inputSchema: {
        fields: [
          { key: 'epicKey', label: 'Clave de la épica', type: 'issueKey', required: true, description: 'Por ejemplo DEMO-100' },
          { key: 'instructions', label: 'Instrucciones complementarias', type: 'text', required: false, description: 'Opcional' },
        ],
      },
      steps: [
        { key: 'context', name: 'Contexto', handler: 'jira.context', agentKey: 'JiraContextAnalyzer', params: { mode: 'epic' }, description: 'Proyecto, épica, historias y tareas existentes, tipos y vínculos.' },
        { key: 'analysis', name: 'Análisis funcional', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'functional_analysis', dependsOn: ['context'] },
        { key: 'stories', name: 'Generación de historias', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'generate_stories', skillKeys: ['UserStoryWriting'], dependsOn: ['analysis'] },
        { key: 'tasks_backend', name: 'Tareas Backend', handler: 'agent.task', agentKey: 'BackendSpecialist', task: 'technical_breakdown', params: { specialty: 'BACKEND' }, dependsOn: ['stories'] },
        { key: 'tasks_frontend', name: 'Tareas Frontend', handler: 'agent.task', agentKey: 'FrontendSpecialist', task: 'technical_breakdown', params: { specialty: 'FRONTEND' }, dependsOn: ['stories'] },
        { key: 'tasks_fullstack', name: 'Tareas Fullstack', handler: 'agent.task', agentKey: 'FullstackSpecialist', task: 'technical_breakdown', params: { specialty: 'FULLSTACK' }, dependsOn: ['stories'] },
        { key: 'validation', name: 'Validación QA', handler: 'agent.task', agentKey: 'QAValidator', task: 'validate_plan', dependsOn: ['tasks_backend', 'tasks_frontend', 'tasks_fullstack'] },
        { key: 'dependencies', name: 'Dependencias', handler: 'agent.task', agentKey: 'DependencyPlanner', task: 'dependency_plan', dependsOn: ['validation'] },
        { key: 'review', name: 'Revisión del supervisor', handler: 'supervisor.review', agentKey: 'MainSupervisor', dependsOn: ['dependencies'], onError: 'continue' },
        { key: 'approval', name: 'Aprobación', handler: 'approval.gate', params: { builder: 'epic_publication', regenerateFrom: ['stories'] }, dependsOn: ['review'], retry: { maxAttempts: 1, backoffMs: 1000 } },
        { key: 'publish', name: 'Publicación', handler: 'jira.publish', dependsOn: ['approval'], parallelSafe: false },
      ],
      approvalConditions: { operationTypes: ['CREATE_ISSUE', 'CREATE_ISSUE_LINK'], notes: 'Se crean solo los elementos aprobados; las tareas dependen de que su historia se apruebe.' },
      errorHandling: { defaultMaxAttempts: 3, backoffMs: 2000, notes: 'Errores transitorios (modelo, MCP, timeout) se reintentan con backoff; errores de validación o autorización detienen el flujo.' },
      resultSchema: {
        description: 'Historias, tareas, validación, dependencias y resultado de publicación.',
        fields: [
          { key: 'stories', description: 'Cantidad de historias propuestas' },
          { key: 'tasks', description: 'Cantidad de tareas propuestas' },
          { key: 'publication', description: 'Operaciones ejecutadas o simuladas' },
        ],
      },
      tags: ['jira', 'historias'],
    },
  },
  {
    key: 'STORY_REVIEW_AND_DECOMPOSITION',
    definition: {
      name: 'HU existente → Validación → Tareas',
      objective: 'Validar una historia existente, proponer mejoras con diferencias editables y generar las tareas técnicas que faltan.',
      description: 'Recupera la historia y su contexto, diagnostica su calidad contra la Definition of Ready, propone mejoras, descompone en tareas evitando duplicados y hace una evaluación cruzada (cobertura QA y dependencias en paralelo) antes de la aprobación.',
      useConditions: ['Hay una historia existente con descripción o criterios incompletos.', 'Se quiere preparar una historia para el sprint.'],
      keywords: ['historia', 'hu', 'user story', 'validá', 'valida', 'mejorá', 'mejora', 'revisá', 'refinar', 'definition of ready'],
      inputSchema: {
        fields: [
          { key: 'storyKey', label: 'Clave de la historia', type: 'issueKey', required: true, description: 'Por ejemplo DEMO-102' },
          { key: 'objective', label: 'Objetivo adicional', type: 'text', required: false, description: 'Opcional' },
        ],
      },
      steps: [
        { key: 'context', name: 'Recuperación', handler: 'jira.context', agentKey: 'JiraContextAnalyzer', params: { mode: 'story' } },
        { key: 'review_story', name: 'Validación funcional', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'story_review', skillKeys: ['AcceptanceCriteriaQuality'], dependsOn: ['context'] },
        { key: 'improvements', name: 'Propuestas de mejora', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'story_improvements', dependsOn: ['review_story'] },
        { key: 'tasks_backend', name: 'Tareas Backend', handler: 'agent.task', agentKey: 'BackendSpecialist', task: 'technical_breakdown', params: { specialty: 'BACKEND' }, dependsOn: ['improvements'] },
        { key: 'tasks_frontend', name: 'Tareas Frontend', handler: 'agent.task', agentKey: 'FrontendSpecialist', task: 'technical_breakdown', params: { specialty: 'FRONTEND' }, dependsOn: ['improvements'] },
        { key: 'tasks_fullstack', name: 'Tareas Fullstack', handler: 'agent.task', agentKey: 'FullstackSpecialist', task: 'technical_breakdown', params: { specialty: 'FULLSTACK' }, dependsOn: ['improvements'] },
        { key: 'qa_coverage', name: 'Cobertura QA', handler: 'agent.task', agentKey: 'QAValidator', task: 'qa_coverage', dependsOn: ['tasks_backend', 'tasks_frontend', 'tasks_fullstack'] },
        { key: 'dependencies', name: 'Dependencias y orden', handler: 'agent.task', agentKey: 'DependencyPlanner', task: 'dependency_plan', dependsOn: ['tasks_backend', 'tasks_frontend', 'tasks_fullstack'] },
        { key: 'review', name: 'Revisión del supervisor', handler: 'supervisor.review', agentKey: 'MainSupervisor', dependsOn: ['qa_coverage', 'dependencies'], onError: 'continue' },
        { key: 'approval', name: 'Aprobación', handler: 'approval.gate', params: { builder: 'story_publication', regenerateFrom: ['improvements'] }, dependsOn: ['review'], retry: { maxAttempts: 1, backoffMs: 1000 } },
        { key: 'publish', name: 'Publicación', handler: 'jira.publish', dependsOn: ['approval'], parallelSafe: false },
      ],
      approvalConditions: { operationTypes: ['UPDATE_ISSUE', 'CREATE_ISSUE', 'CREATE_ISSUE_LINK'], notes: 'Cambios en la HU, tareas nuevas y relaciones se aprueban por separado. Antes de actualizar se compara la versión actual de Jira.' },
      errorHandling: { defaultMaxAttempts: 3, backoffMs: 2000, notes: 'Un conflicto de versión detiene la escritura de esa issue y genera una nueva revisión.' },
      resultSchema: {
        description: 'Diagnóstico, mejoras, tareas faltantes y resultado de publicación.',
        fields: [
          { key: 'diagnosis', description: 'Diagnóstico y preparación de la HU' },
          { key: 'improvements', description: 'Cantidad de cambios propuestos' },
          { key: 'publication', description: 'Operaciones ejecutadas o simuladas' },
        ],
      },
      tags: ['jira', 'refinamiento'],
    },
  },
];
