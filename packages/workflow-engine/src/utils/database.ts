import { Pool, PoolClient } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createLogger, requireEnv, dbSchema } from '@rtb-ai-hub/shared';

const logger = createLogger('database');

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: requireEnv('POSTGRES_HOST'),
      port: parseInt(requireEnv('POSTGRES_PORT')),
      database: requireEnv('POSTGRES_DB'),
      user: requireEnv('POSTGRES_USER'),
      password: requireEnv('POSTGRES_PASSWORD'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected database error');
    });

    logger.info('Database connection pool created');
  }

  return pool;
}

let drizzleDb: NodePgDatabase<typeof dbSchema> | null = null;

export function getDb(): NodePgDatabase<typeof dbSchema> {
  if (!drizzleDb) {
    drizzleDb = drizzle(getPool(), { schema: dbSchema });
  }
  return drizzleDb;
}

export const db = new Proxy({} as NodePgDatabase<typeof dbSchema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug({ text, duration, rows: result.rowCount }, 'Query executed');

    return result.rows;
  } catch (error) {
    logger.error({ error, text, params }, 'Query failed');
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return await pool.connect();
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    drizzleDb = null;
    logger.info('Database connection pool closed');
  }
}
