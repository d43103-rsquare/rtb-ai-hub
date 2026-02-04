import { Queue } from 'bullmq';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@rtb-ai-hub/shared';
import { createRedisConnection } from './connection';

const connection = createRedisConnection();

export const figmaQueue = new Queue(QUEUE_NAMES.FIGMA, {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const jiraQueue = new Queue(QUEUE_NAMES.JIRA, {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const githubQueue = new Queue(QUEUE_NAMES.GITHUB, {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const datadogQueue = new Queue(QUEUE_NAMES.DATADOG, {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
