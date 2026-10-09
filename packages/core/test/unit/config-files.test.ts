import { globalConfigSchema, projectConfigSchema } from '@mao/shared';
import { describe, expect, it } from 'vitest';
import { CatalogFileError, parseYamlFile, renderYaml } from '../../src/catalog/file-format';
import {
  configFileHeader,
  configHash,
  connectionsFromDb,
  envFileFromArgs,
  globalFromDb,
  isKnownHash,
  normalizeConfigFile,
  normalizeConnectionsFile,
  normalizeGlobalFile,
  normalizePoliciesFile,
  normalizeProjectFile,
  normalizeProvidersFile,
  parseRegistry,
  policiesFromDb,
  projectFromDb,
  providersFromDb,
  registerHashes,
  renderConfigValue,
  secretConfigKeys,
  withoutSecretConfig,
  type ConfigSubject,
} from '../../src/config/config-format';

/** Lo que haría la plataforma: render con encabezado → texto → parse → normalizar. */
function roundtrip(subject: ConfigSubject, normalized: unknown, key?: string) {
  const text = renderYaml(renderConfigValue(subject, normalized), configFileHeader(subject, key));
  return { text, value: normalizeConfigFile(subject, parseYamlFile(text), key) };
}

function errorsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof CatalogFileError) return err.errors;
    throw err;
  }
  throw new Error('Se esperaba un error de validación');
}

describe('archivos de configuración: políticas', () => {
  const projects = new Map([
    ['p1', { key: 'SCRUM', mode: 'JIRA' }],
    ['p2', { key: 'DEMO', mode: 'DEMO' }],
  ]);
  const row = (o: Partial<Parameters<typeof policiesFromDb>[0][number]>) => ({ scope: 'GLOBAL', projectId: null, orchestratorKey: null, operationType: 'CREATE_ISSUE', mode: 'BATCH_APPROVAL', mandatory: false, description: '', rules: {}, version: 1, ...o });

  it('desde la base: última versión por ámbito, orden estable y sin proyectos DEMO', () => {
    const file = policiesFromDb(
      [
        row({ scope: 'PROJECT', projectId: 'p1', operationType: 'UPDATE_ISSUE', mode: 'ALWAYS_APPROVE' }),
        row({ operationType: 'DELETE_EXTERNAL', mode: 'DENIED', mandatory: true, version: 1 }),
        row({ operationType: 'READ_EXTERNAL', mode: 'AUTO_APPROVED' }),
        row({ scope: 'PROJECT', projectId: 'p2', operationType: 'CREATE_ISSUE', mode: 'DENIED' }),
        row({ operationType: 'DELETE_EXTERNAL', mode: 'DENIED', mandatory: true, version: 2, description: 'v2' }),
      ],
      projects,
    );
    expect(file.policies.map((p) => `${p.scope}:${p.project ?? ''}:${p.operation}`)).toEqual(['GLOBAL::READ_EXTERNAL', 'GLOBAL::DELETE_EXTERNAL', 'PROJECT:SCRUM:UPDATE_ISSUE']);
    expect(file.policies[1].description).toBe('v2');
    expect(file.policies.some((p) => p.project === 'DEMO')).toBe(false);
  });

  it('el orden y los valores por defecto no cambian el hash; rules vacías no se escriben', () => {
    const a = normalizePoliciesFile({ policies: [{ scope: 'GLOBAL', operation: 'CREATE_ISSUE', mode: 'BATCH_APPROVAL' }, { scope: 'PROJECT', project: 'SCRUM', operation: 'READ_EXTERNAL', mode: 'AUTO_APPROVED' }] });
    const b = normalizePoliciesFile({
      policies: [
        { mode: 'AUTO_APPROVED', operation: 'READ_EXTERNAL', project: 'SCRUM', scope: 'PROJECT', rules: {} },
        { scope: 'GLOBAL', operation: 'CREATE_ISSUE', mode: 'BATCH_APPROVAL', mandatory: false, description: '' },
      ],
    });
    expect(configHash(a)).toBe(configHash(b));
    const { text, value } = roundtrip('policies', a);
    expect(text).not.toContain('rules');
    expect(configHash(value)).toBe(configHash(a));
  });

  it('rechaza duplicados, ámbitos incompletos y claves desconocidas', () => {
    expect(errorsOf(() => normalizePoliciesFile({ policies: [{ scope: 'GLOBAL', operation: 'CREATE_ISSUE', mode: 'DENIED' }, { scope: 'GLOBAL', operation: 'CREATE_ISSUE', mode: 'BATCH_APPROVAL' }] }))[0]).toMatch(/repite/);
    expect(errorsOf(() => normalizePoliciesFile({ policies: [{ scope: 'PROJECT', operation: 'CREATE_ISSUE', mode: 'DENIED' }] })).join()).toMatch(/policies\[0\]\.project/);
    expect(errorsOf(() => normalizePoliciesFile({ policies: [{ scope: 'GLOBAL', operation: 'CREATE_ISSUE', mode: 'DENIED', mdoe: 'x' }] })).join()).toMatch(/mdoe/);
    expect(errorsOf(() => normalizePoliciesFile({ policies: [{ scope: 'GLOBAL', operation: 'BORRAR_TODO', mode: 'DENIED' }] })).join()).toMatch(/policies\[0\]\.operation/);
  });
});

describe('archivos de configuración: conexiones', () => {
  it('solo clave, nombre, tipo, propósito y archivo de credenciales', () => {
    const file = connectionsFromDb([
      { key: 'otra', name: 'Otra', kind: 'MCP_STDIO', purpose: 'JIRA', config: { transport: 'stdio', command: 'C:/ruta/local/mcp.exe', args: ['--env-file', 'MCP/otra.env'] } },
      { key: 'jira-mcp', name: 'Jira', kind: 'MCP_STDIO', purpose: 'JIRA', config: { command: 'x', args: ['--env-file=MCP/mcp-atlassian/.env'] } },
    ]);
    expect(file.connections).toEqual([
      { key: 'jira-mcp', name: 'Jira', kind: 'MCP_STDIO', purpose: 'JIRA', envFile: 'MCP/mcp-atlassian/.env' },
      { key: 'otra', name: 'Otra', kind: 'MCP_STDIO', purpose: 'JIRA', envFile: 'MCP/otra.env' },
    ]);
    const { text, value } = roundtrip('connections', file);
    expect(text).not.toMatch(/command|writeEnabled|status|capabilities/);
    expect(configHash(value)).toBe(configHash(file));
  });

  it('envFileFromArgs y el archivo no admite writeEnabled', () => {
    expect(envFileFromArgs(['--env-file', 'MCP/a.env'])).toBe('MCP/a.env');
    expect(envFileFromArgs(['--otro'])).toBeUndefined();
    expect(envFileFromArgs(undefined)).toBeUndefined();
    expect(errorsOf(() => normalizeConnectionsFile({ connections: [{ key: 'a', name: 'A', envFile: 'MCP/a.env', writeEnabled: true }] })).join()).toMatch(/writeEnabled/);
    expect(errorsOf(() => normalizeConnectionsFile({ connections: [{ key: 'a', name: 'A' }, { key: 'a', name: 'B' }] })).join()).toMatch(/repite/);
  });
});

describe('archivos de configuración: proveedores sin secretos', () => {
  it('filtra claves con forma de credencial y deja apiKeyEnv y maxTokens', () => {
    expect(secretConfigKeys({ model: 'm', apiKeyEnv: 'ANTHROPIC_API_KEY', maxTokens: 4096, apiKey: 'x', token: 'y', password: 'z' }).sort()).toEqual(['apiKey', 'password', 'token']);
    expect(secretConfigKeys({ apiKeyEnv: 'sk-ant-api03-abcdefghijklmnop' })).toEqual(['apiKeyEnv']);
    expect(secretConfigKeys({ note: 'Bearer abcdefghijklmnopqrstuvwxyz' })).toEqual(['note']);
    expect(withoutSecretConfig({ model: 'm', apiKey: 'x' })).toEqual({ model: 'm' });
  });

  it('desde la base: sin el simulado ni secretos; ida y vuelta sin pérdida', () => {
    const file = providersFromDb([
      { key: 'mock', name: 'Simulación', kind: 'MOCK', enabled: true, isDefault: true, config: {} },
      { key: 'anthropic-api', name: 'API', kind: 'ANTHROPIC_API', enabled: true, isDefault: false, config: { model: 'claude-opus-5-5', apiKeyEnv: 'ANTHROPIC_API_KEY', apiKey: 'filtrada' } },
    ]);
    expect(file.providers.map((p) => p.key)).toEqual(['anthropic-api']);
    expect(file.providers[0].config).toEqual({ model: 'claude-opus-5-5', apiKeyEnv: 'ANTHROPIC_API_KEY' });
    const { text, value } = roundtrip('providers', file);
    expect(text).not.toContain('filtrada');
    expect(configHash(value)).toBe(configHash(file));
  });

  it('el archivo rechaza secretos, el simulado y dos proveedores por defecto', () => {
    expect(errorsOf(() => normalizeProvidersFile({ providers: [{ key: 'a', name: 'A', kind: 'ANTHROPIC_API', config: { apiKey: 'sk-ant-api03-xxxxxxxxxxxxxxxx' } }] })).join()).toMatch(/providers\[0\]\.config\.apiKey/);
    expect(errorsOf(() => normalizeProvidersFile({ providers: [{ key: 'a', name: 'A', kind: 'ANTHROPIC_API', config: { apiKeyEnv: 'sk-ant-api03-xxxxxxxxxxxxxxxx' } }] })).join()).toMatch(/variable de entorno/);
    expect(errorsOf(() => normalizeProvidersFile({ providers: [{ key: 'mock', name: 'M', kind: 'MOCK' }] })).join()).toMatch(/MOCK/);
    expect(errorsOf(() => normalizeProvidersFile({ providers: [{ key: 'a', name: 'A', kind: 'LOCAL_CLAUDE', isDefault: true }, { key: 'b', name: 'B', kind: 'ANTHROPIC_API', isDefault: true }] })).join()).toMatch(/más de un proveedor por defecto/);
  });
});

describe('archivos de configuración: global y proyectos', () => {
  it('global: la base y el archivo normalizan igual; claves desconocidas y seguridad obligatoria se rechazan', () => {
    const db = globalFromDb(globalConfigSchema.parse({ defaults: { language: 'es-AR' } }));
    const { text, value } = roundtrip('global', db);
    expect(text.startsWith('# ')).toBe(true);
    expect(text).toContain('pnpm mao files apply');
    expect(configHash(value)).toBe(configHash(db));
    expect(configHash(normalizeGlobalFile({ defaults: { language: 'es-AR' } }))).toBe(configHash(db));
    expect(errorsOf(() => normalizeGlobalFile({ limits: { maxConcurentExecutions: 3 } })).join()).toMatch(/limits\.maxConcurentExecutions: clave desconocida/);
    expect(errorsOf(() => normalizeGlobalFile({ security: { mandatory: { allowDeleteExternal: true } } })).join()).toMatch(/allowDeleteExternal/);
    expect(errorsOf(() => normalizeGlobalFile(null)).join()).toMatch(/objeto YAML/);
  });

  it('proyecto: metadatos + configuración activa normalizada, ida y vuelta sin pérdida', () => {
    const config = projectConfigSchema.parse({ technologies: ['Java'], rules: ['Regla'] });
    const file = projectFromDb({ name: 'Scrum', description: '', jiraProjectKey: 'SCRUM', mode: 'JIRA', status: 'ACTIVE', connection: { key: 'jira-mcp' }, defaultProvider: null }, config);
    expect(file).toMatchObject({ name: 'Scrum', mode: 'JIRA', connection: 'jira-mcp' });
    expect('provider' in file).toBe(false);
    const { value } = roundtrip('project', file, 'SCRUM');
    expect(configHash(value)).toBe(configHash(file));
    // Un archivo mínimo completa la configuración con los valores por defecto.
    expect(configHash(normalizeProjectFile({ name: 'Scrum', jiraProjectKey: 'SCRUM', connection: 'jira-mcp', config: { technologies: ['Java'], rules: ['Regla'] } }, 'SCRUM'))).toBe(configHash(file));
  });

  it('proyecto: rechaza DEMO, claves de archivo inválidas y claves desconocidas en la configuración', () => {
    expect(errorsOf(() => normalizeProjectFile({ name: 'D', jiraProjectKey: 'D', mode: 'DEMO' }, 'DEMO2')).join()).toMatch(/modo DEMO/);
    expect(errorsOf(() => normalizeProjectFile({ name: 'D', jiraProjectKey: 'D' }, 'minusculas')).join()).toMatch(/Clave de proyecto inválida/);
    expect(errorsOf(() => normalizeProjectFile({ name: 'D', jiraProjectKey: 'D', config: { technologys: ['Go'] } }, 'SCRUM')).join()).toMatch(/config\.technologys: clave desconocida/);
    expect(errorsOf(() => normalizeProjectFile({ name: 'D', jiraProjectKey: 'D', writeEnabled: true }, 'SCRUM')).join()).toMatch(/writeEnabled/);
  });
});

describe('registro de hashes exportados', () => {
  it('el hash anterior pasa al historial (máximo configurable) y cuenta como conocido', () => {
    const reg = parseRegistry({ 'global.yaml': { hash: 'h1', history: [] }, roto: 3 });
    expect(Object.keys(reg)).toEqual(['global.yaml']);
    expect(registerHashes(reg, [{ relPath: 'global.yaml', hash: 'h1' }])).toBe(false);
    expect(registerHashes(reg, [{ relPath: 'global.yaml', hash: 'h2' }, { relPath: 'policies.yaml', hash: 'p1' }])).toBe(true);
    expect(reg['global.yaml']).toEqual({ hash: 'h2', history: ['h1'] });
    expect(isKnownHash(reg, 'global.yaml', 'h1')).toBe(true);
    expect(isKnownHash(reg, 'policies.yaml', 'h1')).toBe(false);
    registerHashes(reg, [{ relPath: 'global.yaml', hash: 'h3' }], 1);
    expect(reg['global.yaml']).toEqual({ hash: 'h3', history: ['h2'] });
    // Volver a un contenido anterior no lo duplica en el historial.
    registerHashes(reg, [{ relPath: 'global.yaml', hash: 'h2' }]);
    expect(reg['global.yaml']).toEqual({ hash: 'h2', history: ['h3'] });
  });
});
