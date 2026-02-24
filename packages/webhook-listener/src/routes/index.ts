import { Router } from 'express';
import { createFigmaRouter } from './figma';
import { createJiraRouter } from './jira';
import { createGitHubRouter } from './github';
import { createDatadogRouter } from './datadog';
import { createChatRouter } from './chat';
import { createContextRouter } from './context';

import { createKnowledgeRouter } from './knowledge';
import { createInfraRouter } from './infra';
import { createWorkflowsRouter } from './workflows';
export function createRoutes() {
  const router = Router();

  router.use(createFigmaRouter());
  router.use(createJiraRouter());
  router.use(createGitHubRouter());
  router.use(createDatadogRouter());
  router.use(createChatRouter());
  router.use(createContextRouter());

  router.use(createKnowledgeRouter());
  router.use(createInfraRouter());
  router.use(createWorkflowsRouter());

  return router;
}
