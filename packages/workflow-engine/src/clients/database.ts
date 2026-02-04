import { Pool } from 'pg';
import { requireEnv, createLogger } from '@rtb-ai-hub/shared';
import type { WorkflowExecution } from '@rtb-ai-hub/shared';

const logger = createLogger('database');

export class Database {
  private pool: Pool;

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

  async saveWorkflowExecution(execution: Partial<WorkflowExecution>): Promise<void> {
    const query = `
      INSERT INTO workflow_executions (
        id, type, status, input, output, error, user_id,
        ai_model, tokens_input, tokens_output, cost_usd,
        started_at, completed_at, duration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        output = EXCLUDED.output,
        error = EXCLUDED.error,
        completed_at = EXCLUDED.completed_at,
        duration = EXCLUDED.duration
    `;

    const values = [
      execution.id,
      execution.type,
      execution.status,
      JSON.stringify(execution.input),
      execution.output ? JSON.stringify(execution.output) : null,
      execution.error || null,
      execution.userId || null,
      execution.aiModel || null,
      execution.tokensUsed?.input || null,
      execution.tokensUsed?.output || null,
      execution.costUsd || null,
      execution.startedAt,
      execution.completedAt || null,
      execution.duration || null,
    ];

    try {
      await this.pool.query(query, values);
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
    const query = `
      INSERT INTO ai_costs (id, workflow_execution_id, model, tokens_input, tokens_output, cost_usd)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const values = [
      data.id,
      data.workflowExecutionId,
      data.model,
      data.tokensInput,
      data.tokensOutput,
      data.costUsd,
    ];

    try {
      await this.pool.query(query, values);
      logger.info({ costId: data.id }, 'AI cost saved');
    } catch (error) {
      logger.error({ error }, 'Failed to save AI cost');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const database = new Database();

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = database['pool'];
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (error) {
    logger.error({ error, text }, 'Query failed');
    throw error;
  }
}
