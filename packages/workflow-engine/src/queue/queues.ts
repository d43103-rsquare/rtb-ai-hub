import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@rtb-ai-hub/shared';
import { getBoss } from './connection';

export type QueueSendOptions = {
  jobId?: string;
};

async function send(queue: string, data: unknown, opts?: QueueSendOptions): Promise<string | null> {
  const boss = getBoss();
  return boss.send(queue, data as object, {
    id: opts?.jobId,
    retryLimit: DEFAULT_JOB_OPTIONS.attempts,
    retryDelay: DEFAULT_JOB_OPTIONS.backoff.delay / 1000, // pg-boss uses seconds
    retryBackoff: true,
    expireInMinutes: DEFAULT_JOB_OPTIONS.expireInMinutes,
  });
}

export async function sendToFigmaQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.FIGMA, data, opts);
}

export async function sendToJiraQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.JIRA, data, opts);
}

export async function sendToGithubQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.GITHUB, data, opts);
}

export async function sendToDatadogQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.DATADOG, data, opts);
}
