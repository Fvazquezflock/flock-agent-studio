import { disconnectPrisma } from '@mao/db';
import { Core } from '../core';
import { seedDatabase } from './seed';

const core = new Core();
try {
  await seedDatabase(core, (m) => console.log(`· ${m}`));
  console.log('Carga inicial completa.');
} catch (err) {
  console.error('Error en la carga inicial:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await core.close();
  await disconnectPrisma();
}
