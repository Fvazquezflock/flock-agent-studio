import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/test/integration/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
          environment: 'node',
          // Base de datos de prueba aislada (mao_test): nunca toca la base de trabajo ni Jira real.
          // Catálogo de prueba: copia de catalog/ que global-setup recrea en cada corrida (las pruebas nunca escriben en catalog/).
          env: { MAO_USE_TEST_DB: '1', MAO_ALLOW_JIRA_WRITES: 'false', MAO_SEED_DEMO: 'true', MAO_CATALOG_DIR: process.env.MAO_CATALOG_DIR || '.data/test-catalog' },
          globalSetup: ['packages/core/test/integration/global-setup.ts'],
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
