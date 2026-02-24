import PgBoss from 'pg-boss';
import { QUEUE_NAMES, DEFAULT_ENVIRONMENT, createLogger } from '@rtb-ai-hub/shared';
import type {
  FigmaWebhookEvent,
  GitHubWebhookEvent,
  JiraWebhookEvent,
  DatadogWebhookEvent,
  Environment,
} from '@rtb-ai-hub/shared';
import {
  processFigmaToJira,
  processAutoReview,
  processJiraAutoDev,
  processDeployMonitor,
  processIncidentToJira,
} from '../workflows';
import { processTargetDeploy } from '../workflows/target-deploy';

const logger = createLogger('workers');

type JobPayload = {
  event: FigmaWebhookEvent | JiraWebhookEvent | GitHubWebhookEvent | DatadogWebhookEvent;
  userId: string | null;
  env?: Environment;
};

export async function registerWorkers(boss: PgBoss) {
  await boss.createQueue(QUEUE_NAMES.FIGMA);
  await boss.createQueue(QUEUE_NAMES.JIRA);
  await boss.createQueue(QUEUE_NAMES.GITHUB);
  await boss.createQueue(QUEUE_NAMES.DATADOG);

  await boss.work<JobPayload>(QUEUE_NAMES.FIGMA, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id }, 'Processing Figma event');
      try {
        const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
        const result = await processFigmaToJira(event as FigmaWebhookEvent, userId, env);
        logger.info({ jobId: job.id, result, userId }, 'Figma workflow completed');
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'Figma workflow failed');
        throw error;
      }
    }
  });

  await boss.work<JobPayload>(QUEUE_NAMES.JIRA, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id }, 'Processing Jira event');
      try {
        const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
        const result = await processJiraAutoDev(event as JiraWebhookEvent, userId, env);
        logger.info({ jobId: job.id, result, userId }, 'Jira workflow completed');
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'Jira workflow failed');
        throw error;
      }
    }
  });

  await boss.work<JobPayload>(QUEUE_NAMES.GITHUB, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id }, 'Processing GitHub event');
      try {
        const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
        const ghEvent = event as GitHubWebhookEvent;
        if (ghEvent.type === 'push') {
          await processTargetDeploy(ghEvent, userId, env);
        } else if (ghEvent.type === 'deployment') {
          await processDeployMonitor(ghEvent, userId, env);
        } else {
          await processAutoReview(ghEvent, userId, env);
        }
        logger.info({ jobId: job.id, userId }, 'GitHub workflow completed');
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'GitHub workflow failed');
        throw error;
      }
    }
  });

  await boss.work<JobPayload>(QUEUE_NAMES.DATADOG, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id }, 'Processing Datadog event');
      try {
        const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
        const result = await processIncidentToJira(event as DatadogWebhookEvent, userId, env);
        logger.info({ jobId: job.id, result, userId }, 'Datadog workflow completed');
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'Datadog workflow failed');
        throw error;
      }
    }
  });

  logger.info('All pg-boss workers registered');
}
