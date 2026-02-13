import { Router } from 'express';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { createFigmaRouter } from './figma';
import { createJiraRouter } from './jira';
import { createGitHubRouter } from './github';
import { createDatadogRouter } from './datadog';
import { createChatRouter } from './chat';
import { createContextRouter } from './context';
import { createOpenClawRouter } from './openclaw';
import { createKnowledgeRouter } from './knowledge';
import { createInfraRouter } from './infra';
import { createWorkflowsRouter } from './workflows';
import { createAgentChatRouter } from './agent-chat';

export function createRoutes(queues: {
  figmaQueue: Queue;
  jiraQueue: Queue;
  githubQueue: Queue;
  datadogQueue: Queue;
  redis: Redis;
}) {
  const router = Router();

  router.use(createFigmaRouter(queues.figmaQueue));
  router.use(createJiraRouter(queues.jiraQueue));
  router.use(createGitHubRouter(queues.githubQueue));
  router.use(createDatadogRouter(queues.datadogQueue));
  router.use(createChatRouter(queues.redis));
  router.use(createContextRouter());
  router.use(createOpenClawRouter());
  router.use(createKnowledgeRouter());
  router.use(createInfraRouter());
  router.use(createWorkflowsRouter());
  router.use(createAgentChatRouter());

  return router;
}
