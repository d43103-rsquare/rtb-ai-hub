import PgBoss from 'pg-boss';
import { requireEnv, createLogger, DEFAULT_JOB_OPTIONS } from '@rtb-ai-hub/shared';

const logger = createLogger('queue-client');
let boss: PgBoss | null = null;

export async function getQueueClient(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({ connectionString: requireEnv('DATABASE_URL'), schema: 'pgboss' });
    boss.on('error', (error) => logger.error({ error }, 'pg-boss error'));
    await boss.start();
    logger.info('pg-boss queue client started');
  }
  return boss;
}

export async function stopQueueClient(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}

export async function enqueueJob(queue: string, data: unknown, jobId: string): Promise<string | null> {
  const b = await getQueueClient();
  return b.send(queue, data as object, {
    id: jobId,
    retryLimit: DEFAULT_JOB_OPTIONS.attempts,
    retryDelay: DEFAULT_JOB_OPTIONS.backoff.delay / 1000,
    retryBackoff: true,
    expireInMinutes: DEFAULT_JOB_OPTIONS.expireInMinutes,
  });
}
