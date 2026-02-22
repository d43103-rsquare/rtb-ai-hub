/**
 * Pause Checker — 워크플로우 일시정지 상태 확인
 *
 * jira-auto-dev.ts 단계 경계에서 호출하여
 * 사용자가 /pause를 요청했는지 확인한다.
 */
import { createLogger, queryRaw } from '@rtb-ai-hub/shared';

const logger = createLogger('pause-checker');

/**
 * Check if a workflow has been paused by the user.
 * Call this at step boundaries in workflow execution.
 */
export async function isPaused(executionId: string): Promise<boolean> {
  try {
    const result = await queryRaw<{ status: string }>(
      'SELECT status FROM workflow_executions WHERE id = $1 LIMIT 1',
      [executionId]
    );
    return result[0]?.status === 'PAUSED';
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), executionId },
      'Failed to check pause status — assuming not paused'
    );
    return false;
  }
}

/**
 * Wait for resume signal by polling every `intervalMs`.
 * Resolves when workflow status changes from PAUSED to something else.
 * Times out after `timeoutMs` (default: 30 minutes).
 */
export async function waitForResume(
  executionId: string,
  intervalMs = 5000,
  timeoutMs = 30 * 60 * 1000
): Promise<'resumed' | 'timeout'> {
  const deadline = Date.now() + timeoutMs;
  logger.info({ executionId }, 'Waiting for resume signal...');

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const paused = await isPaused(executionId);
    if (!paused) {
      logger.info({ executionId }, 'Workflow resumed');
      return 'resumed';
    }
  }

  logger.warn({ executionId }, 'Pause wait timeout — workflow will remain paused');
  return 'timeout';
}
