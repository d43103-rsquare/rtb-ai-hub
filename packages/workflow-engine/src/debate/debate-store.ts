/**
 * Debate Store — DB 저장/조회
 *
 * debate_sessions 테이블 CRUD.
 * 기존 decision-store.ts 패턴을 따른다.
 */

import type { DebateSession, DebateTurn, DebateOutcome } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { Database } from '../clients/database';

const logger = createLogger('debate-store');

export class DebateStore {
  constructor(private db: Database) {}

  /** Save a new debate session */
  async save(session: DebateSession): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO debate_sessions (id, workflow_execution_id, config, turns, outcome, total_tokens_input, total_tokens_output, total_cost_usd, duration_ms, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          session.id,
          session.workflowExecutionId,
          JSON.stringify(session.config),
          JSON.stringify(session.turns),
          session.outcome ? JSON.stringify(session.outcome) : null,
          session.totalTokens.input,
          session.totalTokens.output,
          session.totalCostUsd.toString(),
          session.durationMs,
          session.createdAt,
          session.completedAt ?? null,
        ]
      );

      logger.info({ sessionId: session.id }, 'Debate session saved');
    } catch (error) {
      logger.error({ error, sessionId: session.id }, 'Failed to save debate session');
      throw error;
    }
  }

  /** Update turns for an ongoing debate */
  async updateTurns(sessionId: string, turns: DebateTurn[], tokens: { input: number; output: number }, costUsd: number): Promise<void> {
    try {
      await this.db.query(
        `UPDATE debate_sessions
         SET turns = $2, total_tokens_input = $3, total_tokens_output = $4, total_cost_usd = $5
         WHERE id = $1`,
        [sessionId, JSON.stringify(turns), tokens.input, tokens.output, costUsd.toString()]
      );
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to update debate turns');
      throw error;
    }
  }

  /** Complete a debate session */
  async complete(sessionId: string, outcome: DebateOutcome, durationMs: number): Promise<void> {
    try {
      await this.db.query(
        `UPDATE debate_sessions
         SET outcome = $2, duration_ms = $3, completed_at = $4
         WHERE id = $1`,
        [
          sessionId,
          JSON.stringify(outcome),
          durationMs,
          new Date().toISOString(),
        ]
      );

      logger.info({ sessionId, status: outcome.status }, 'Debate session completed');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to complete debate session');
      throw error;
    }
  }

  /** Get debate session by ID */
  async getById(sessionId: string): Promise<DebateSession | null> {
    try {
      const rows = await this.db.query(
        'SELECT * FROM debate_sessions WHERE id = $1',
        [sessionId]
      );

      if (!rows || rows.length === 0) return null;
      return this.rowToSession(rows[0]);
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get debate session');
      return null;
    }
  }

  /** Get debate sessions by workflow execution ID */
  async getByWorkflow(workflowExecutionId: string): Promise<DebateSession[]> {
    try {
      const rows = await this.db.query(
        'SELECT * FROM debate_sessions WHERE workflow_execution_id = $1 ORDER BY created_at ASC',
        [workflowExecutionId]
      );

      if (!rows) return [];
      return rows.map((r: any) => this.rowToSession(r));
    } catch (error) {
      logger.error({ error, workflowExecutionId }, 'Failed to get debate sessions');
      return [];
    }
  }

  private rowToSession(row: any): DebateSession {
    return {
      id: row.id,
      workflowExecutionId: row.workflow_execution_id,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      turns: typeof row.turns === 'string' ? JSON.parse(row.turns) : row.turns,
      outcome: row.outcome
        ? typeof row.outcome === 'string'
          ? JSON.parse(row.outcome)
          : row.outcome
        : undefined,
      totalTokens: {
        input: row.total_tokens_input ?? 0,
        output: row.total_tokens_output ?? 0,
      },
      totalCostUsd: parseFloat(row.total_cost_usd ?? '0'),
      durationMs: row.duration_ms ?? 0,
      createdAt: row.created_at?.toISOString?.() ?? row.created_at,
      completedAt: row.completed_at?.toISOString?.() ?? row.completed_at,
    };
  }
}

export function createDebateStore(db: Database): DebateStore {
  return new DebateStore(db);
}
