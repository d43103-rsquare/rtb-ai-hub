import PgBoss from 'pg-boss';
import { requireEnv, createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('queue-connection');

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    const databaseUrl = requireEnv('DATABASE_URL');
    boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });

    boss.on('error', (error) => {
      logger.error({ error }, 'pg-boss error');
    });
  }
  return boss;
}

export async function startBoss(): Promise<PgBoss> {
  const b = getBoss();
  await b.start();
  logger.info('pg-boss started');
  return b;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
    logger.info('pg-boss stopped');
  }
}
