/**
 * Workflow Helpers — Common boilerplate for workflow lifecycle management
 *
 * Extracts repeated start/complete/fail patterns from individual workflows.
 */

import {
  createLogger,
  generateId,
  WorkflowStatus,
} from '@rtb-ai-hub/shared';
import type { WorkflowExecution, WorkflowType, Environment } from '@rtb-ai-hub/shared';
import { database } from '../clients/database';

const logger = createLogger('workflow-helpers');

export type WorkflowStartResult = {
  executionId: string;
  startedAt: Date;
};

/**
 * Save initial workflow execution record.
 * Returns undefined executionId if DB save fails (non-blocking).
 */
export async function startWorkflow(
  workflowType: WorkflowType,
  input: WorkflowExecution['input'],
  env: Environment,
  extra?: Partial<WorkflowExecution>
): Promise<WorkflowStartResult | undefined> {
  const executionId = generateId('wf');
  const startedAt = new Date();

  try {
    await database.saveWorkflowExecution({
      id: executionId,
      type: workflowType,
      status: WorkflowStatus.IN_PROGRESS,
      input,
      env,
      startedAt,
      ...extra,
    });
    return { executionId, startedAt };
  } catch (dbError) {
    logger.warn(
      { error: dbError instanceof Error ? dbError.message : String(dbError) },
      'Failed to save workflow execution — continuing'
    );
    return undefined;
  }
}

/**
 * Mark workflow as completed (best-effort DB update).
 */
export async function completeWorkflow(
  executionId: string | undefined,
  workflowType: WorkflowType,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!executionId) return;
  try {
    await database.saveWorkflowExecution({
      id: executionId,
      type: workflowType,
      status: WorkflowStatus.COMPLETED,
      completedAt: new Date(),
      ...extra,
    });
  } catch {
    // best effort
  }
}

/**
 * Mark workflow as failed (best-effort DB update).
 */
export async function failWorkflow(
  executionId: string | undefined,
  workflowType: WorkflowType,
  error: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!executionId) return;
  try {
    await database.saveWorkflowExecution({
      id: executionId,
      type: workflowType,
      status: WorkflowStatus.FAILED,
      completedAt: new Date(),
      error,
      ...extra,
    });
  } catch {
    // best effort
  }
}
