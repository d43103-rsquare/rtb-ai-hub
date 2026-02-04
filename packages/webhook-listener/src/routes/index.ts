import { Router } from 'express';
import { Queue } from 'bullmq';
import { createFigmaRouter } from './figma';
import { createJiraRouter } from './jira';
import { createGitHubRouter } from './github';
import { createDatadogRouter } from './datadog';

export function createRoutes(queues: {
  figmaQueue: Queue;
  jiraQueue: Queue;
  githubQueue: Queue;
  datadogQueue: Queue;
}) {
  const router = Router();

  router.use(createFigmaRouter(queues.figmaQueue));
  router.use(createJiraRouter(queues.jiraQueue));
  router.use(createGitHubRouter(queues.githubQueue));
  router.use(createDatadogRouter(queues.datadogQueue));

  return router;
}
