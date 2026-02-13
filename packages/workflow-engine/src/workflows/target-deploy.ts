import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createLogger,
  generateId,
  WorkflowStatus,
  WorkflowType,
  DEFAULT_ENVIRONMENT,
  FEATURE_FLAGS,
} from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent, WorkflowExecution, Environment } from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { runTargetCd, type CdRunResult } from '../utils/target-cd';
import { updateContext, extractJiraKey } from '../utils/context-engine';

const execAsync = promisify(exec);
const logger = createLogger('target-deploy');

export async function processTargetDeploy(
  event: GitHubWebhookEvent,
  userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<{ success: boolean; cdResults: CdRunResult | null; skipped: boolean }> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  const branch = event.branch || '';
  const autoDeploy = event.payload?.autoDeploy !== false;

  logger.info({ executionId, branch, env, autoDeploy }, 'Processing push event for target deploy');

  if (!FEATURE_FLAGS.TARGET_CD_ENABLED) {
    logger.info({ executionId }, 'TARGET_CD_ENABLED=false — skipping deploy');
    return { success: true, cdResults: null, skipped: true };
  }

  if (!autoDeploy) {
    logger.info(
      { executionId, branch, env },
      'autoDeploy=false — skipping (prd requires manual approval)'
    );
    return { success: true, cdResults: null, skipped: true };
  }

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.DEPLOY_MONITOR,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    env,
    startedAt,
  };

  await database.saveWorkflowExecution(execution);

  try {
    const workDir = process.env.WORK_REPO_LOCAL_PATH;
    if (workDir) {
      logger.info({ branch, workDir }, 'Pulling latest changes');
      await execAsync(`git checkout ${branch} && git pull origin ${branch}`, {
        cwd: workDir,
        timeout: 60000,
      });
    }

    const cdResults = await runTargetCd();

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      status: cdResults.success ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED,
      output: {
        branch,
        env,
        cdResults: {
          success: cdResults.success,
          services: cdResults.services.map((s) => ({
            service: s.service,
            success: s.success,
            rolledBack: s.rolledBack,
          })),
        },
      },
      completedAt,
      duration,
    });

    const jiraKey = extractJiraKey(branch);
    if (jiraKey) {
      try {
        await updateContext({
          jiraKey,
          deployment: {
            env,
            timestamp: new Date().toISOString(),
            success: cdResults.success,
          },
        });
      } catch {
        /* fire-and-forget */
      }
    }

    if (cdResults.success) {
      logger.info({ executionId, branch, env, duration }, 'Target deploy completed');
    } else {
      const failedServices = cdResults.services
        .filter((s) => !s.success)
        .map((s) => s.service)
        .join(', ');
      const rolledBack = cdResults.services.some((s) => s.rolledBack);
      logger.error(
        { executionId, branch, env, duration, failedServices, rolledBack },
        'Target deploy failed'
      );
    }

    return { success: cdResults.success, cdResults, skipped: false };
  } catch (error) {
    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    logger.error(
      { error: error instanceof Error ? error.message : String(error), executionId },
      'Target deploy failed'
    );

    await database.saveWorkflowExecution({
      id: executionId,
      status: WorkflowStatus.FAILED,
      error: error instanceof Error ? error.message : String(error),
      completedAt,
      duration,
    });

    return { success: false, cdResults: null, skipped: false };
  }
}
