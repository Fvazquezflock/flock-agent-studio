import { describe, expect, it } from 'vitest';
import { backlogSearchText, buildBacklogJql } from '../../src/jira/backlog-service';

describe('JQL del backlog de Jira', () => {
  it('lista épicas abiertas del proyecto con el tipo mapeado', () => {
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Epic' })).toBe('project = "SCRUM" AND issuetype = "Epic" AND statusCategory != Done ORDER BY updated DESC');
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Epic', includeDone: true })).not.toContain('statusCategory');
  });

  it('historias de una épica o sin épica', () => {
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Historia', parentKey: 'SCRUM-5' })).toContain('issuetype = "Historia" AND parent = SCRUM-5');
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Historia', withoutParent: true })).toContain('parent is EMPTY');
    // Una clave de épica mal formada no llega a la consulta.
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Historia', parentKey: 'SCRUM-5 OR 1=1' })).not.toContain('parent');
  });

  it('busca por clave exacta o por texto del resumen con prefijos', () => {
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Epic', text: 'scrum-5' })).toContain('key = SCRUM-5');
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Epic', text: 'recl de clientes' })).toContain('summary ~ "recl* de clientes*"');
  });

  it('el texto libre no puede alterar la consulta', () => {
    const jql = buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Epic', text: 'x" OR project = OTRO OR summary ~ "y' });
    expect(jql).toBe('project = "SCRUM" AND issuetype = "Epic" AND statusCategory != Done AND summary ~ "x or project* otro* or summary* y" ORDER BY updated DESC');
    expect(backlogSearchText('Autogestión (reclamos) & "pagos"')).toBe('autogestión* reclamos* pagos*');
    expect(buildBacklogJql({ jiraProjectKey: 'SCRUM', issueType: 'Tipo "raro"' })).toContain('issuetype = "Tipo \\"raro\\""');
  });
});
