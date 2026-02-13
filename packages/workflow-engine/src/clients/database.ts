import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { requireEnv, createLogger, dbSchema } from '@rtb-ai-hub/shared';
import type { WorkflowExecution } from '@rtb-ai-hub/shared';

const logger = createLogger('database');

export class Database {
  private pool: Pool;
  private _drizzle: NodePgDatabase<typeof dbSchema> | null = null;

  constructor() {
    this.pool = new Pool({
      host: requireEnv('POSTGRES_HOST'),
      port: parseInt(requireEnv('POSTGRES_PORT')),
      database: requireEnv('POSTGRES_DB'),
      user: requireEnv('POSTGRES_USER'),
      password: requireEnv('POSTGRES_PASSWORD'),
    });

    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected database pool error');
    });
  }

  get drizzle(): NodePgDatabase<typeof dbSchema> {
    if (!this._drizzle) {
      this._drizzle = drizzle(this.pool, { schema: dbSchema });
    }
    return this._drizzle;
  }

  async saveWorkflowExecution(execution: Partial<WorkflowExecution>): Promise<void> {
    try {
      await this.drizzle
        .insert(dbSchema.workflowExecutions)
        .values({
          id: execution.id!,
          type: execution.type!,
          status: execution.status!,
          input: execution.input,
          output: execution.output || null,
          error: execution.error || null,
          userId: execution.userId || null,
          env: execution.env || 'int',
          aiModel: execution.aiModel || null,
          tokensInput: execution.tokensUsed?.input || null,
          tokensOutput: execution.tokensUsed?.output || null,
          costUsd: execution.costUsd?.toString() || null,
          startedAt: execution.startedAt || new Date(),
          completedAt: execution.completedAt || null,
          duration: execution.duration || null,
        })
        .onConflictDoUpdate({
          target: dbSchema.workflowExecutions.id,
          set: {
            status: execution.status!,
            output: execution.output || null,
            error: execution.error || null,
            completedAt: execution.completedAt || null,
            duration: execution.duration || null,
          },
        });
      logger.info({ executionId: execution.id }, 'Workflow execution saved');
    } catch (error) {
      logger.error({ error, executionId: execution.id }, 'Failed to save workflow execution');
      throw error;
    }
  }

  async saveAICost(data: {
    id: string;
    workflowExecutionId: string;
    model: string;
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
  }): Promise<void> {
    try {
      await this.drizzle.insert(dbSchema.aiCosts).values({
        id: data.id,
        workflowExecutionId: data.workflowExecutionId,
        model: data.model,
        tokensInput: data.tokensInput,
        tokensOutput: data.tokensOutput,
        costUsd: data.costUsd.toString(),
      });
      logger.info({ costId: data.id }, 'AI cost saved');
    } catch (error) {
      logger.error({ error }, 'Failed to save AI cost');
      throw error;
    }
  }

  /** Raw SQL query for backward compatibility */
  async query<T>(text: string, params?: unknown[]): Promise<T[]> {
    try {
      const result = await this.pool.query(text, params);
      return result.rows;
    } catch (error) {
      logger.error({ error, text }, 'Query failed');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    this._drizzle = null;
  }
}

export const database = new Database();
