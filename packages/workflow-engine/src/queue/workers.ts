import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@rtb-ai-hub/shared';
import type {
  FigmaWebhookEvent,
  GitHubWebhookEvent,
  JiraWebhookEvent,
  DatadogWebhookEvent,
} from '@rtb-ai-hub/shared';
import { createRedisConnection } from './connection';
import {
  processFigmaToJira,
  processAutoReview,
  processJiraAutoDev,
  processDeployMonitor,
  processIncidentToJira,
} from '../workflows';

const logger = createLogger('workers');

export function createWorkers() {
  const connection = createRedisConnection();

  const figmaWorker = new Worker(
    QUEUE_NAMES.FIGMA,
    async (job) => {
      logger.info({ jobId: job.id }, 'Processing Figma event');
      try {
        const { event, userId } = job.data as { event: FigmaWebhookEvent; userId: string | null };
        const result = await processFigmaToJira(event, userId);
        logger.info({ jobId: job.id, result, userId }, 'Figma workflow completed');
        return result;
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'Figma workflow failed');
        throw error;
      }
    },
    { connection, concurrency: 2 }
  );

  const jiraWorker = new Worker(
    QUEUE_NAMES.JIRA,
    async (job) => {
      logger.info({ jobId: job.id }, 'Processing Jira event');
      try {
        const { event, userId } = job.data as { event: JiraWebhookEvent; userId: string | null };
        const result = await processJiraAutoDev(event, userId);
        logger.info({ jobId: job.id, result, userId }, 'Jira workflow completed');
        return result;
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'Jira workflow failed');
        throw error;
      }
    },
    { connection, concurrency: 2 }
  );

  const githubWorker = new Worker(
    QUEUE_NAMES.GITHUB,
    async (job) => {
      logger.info({ jobId: job.id }, 'Processing GitHub event');
      try {
        const { event, userId } = job.data as { event: GitHubWebhookEvent; userId: string | null };
        if (event.type === 'deployment') {
          const result = await processDeployMonitor(event, userId);
          logger.info({ jobId: job.id, result, userId }, 'Deploy monitor workflow completed');
          return result;
        } else {
          const result = await processAutoReview(event, userId);
          logger.info({ jobId: job.id, result, userId }, 'Auto review workflow completed');
          return result;
        }
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'GitHub workflow failed');
        throw error;
      }
    },
    { connection, concurrency: 2 }
  );

  const datadogWorker = new Worker(
    QUEUE_NAMES.DATADOG,
    async (job) => {
      logger.info({ jobId: job.id }, 'Processing Datadog event');
      try {
        const { event, userId } = job.data as { event: DatadogWebhookEvent; userId: string | null };
        const result = await processIncidentToJira(event, userId);
        logger.info({ jobId: job.id, result, userId }, 'Datadog workflow completed');
        return result;
      } catch (error) {
        logger.error({ jobId: job.id, error }, 'Datadog workflow failed');
        throw error;
      }
    },
    { connection, concurrency: 2 }
  );

  figmaWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Figma job completed');
  });

  figmaWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Figma job failed');
  });

  githubWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'GitHub job completed');
  });

  githubWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error }, 'GitHub job failed');
  });

  return { figmaWorker, jiraWorker, githubWorker, datadogWorker };
}
