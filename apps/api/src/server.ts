import { loadRootEnv, disconnectPrisma } from '@mao/db';
import { Core } from '@mao/core';
import { buildApp } from './app';
import { syncCatalogFilesOnStartup } from './routes/catalog-files';

loadRootEnv();
const host = process.env.MAO_API_HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  // El MVP solo escucha en loopback.
  console.error(`MAO_API_HOST=${host} no es loopback. El MVP solo se expone en 127.0.0.1.`);
  process.exit(1);
}
const port = Number(process.env.MAO_API_PORT || 4317);
const webPort = Number(process.env.MAO_WEB_PORT || 3000);
const core = new Core();
const app = await buildApp(core, {
  ownerToken: process.env.MAO_OWNER_TOKEN ?? '',
  allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`],
  allowedOrigins: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`],
  logger: process.env.MAO_API_LOG === '1',
});

const shutdown = async () => {
  await app.close();
  await core.close();
  await disconnectPrisma();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Archivos de catalog/: importa como pendientes de aprobación lo que cambió y avisa qué falta aplicar (nunca impide arrancar).
await syncCatalogFilesOnStartup(core);
await app.listen({ host, port });
console.log(`API escuchando en http://${host}:${port} (solo loopback)`);
