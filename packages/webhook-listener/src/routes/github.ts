import { Router } from 'express';
import {
  QUEUE_NAMES,
  generateId,
  githubWebhookSchema,
  validateBody,
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { verifyGitHubSignature } from '../middleware/webhook-signature';
import { enqueueJob } from '../queue-client';

export function createGitHubRouter() {
  const router = Router();

  router.post(
    '/webhooks/github',
    verifyGitHubSignature,
    optionalAuth,
    validateBody(githubWebhookSchema),
    async (req: AuthRequest, res) => {
      try {
        const envParam =
          (req.query.env as string) || (req.headers['x-env'] as string) || DEFAULT_ENVIRONMENT;
        const env: Environment = ENVIRONMENTS.includes(envParam as Environment)
          ? (envParam as Environment)
          : DEFAULT_ENVIRONMENT;

        const eventType = req.headers['x-github-event'] as string;
        const pr = req.body.pull_request;
        const deployment = req.body.deployment;

        const event: GitHubWebhookEvent = {
          source: 'github',
          type: eventType as any,
          repository: req.body.repository?.full_name,
          prNumber: pr?.number,
          prTitle: pr?.title,
          branch: pr?.head?.ref || deployment?.ref,
          sha: pr?.head?.sha || deployment?.sha,
          timestamp: new Date().toISOString(),
          payload: req.body,
        };

        const jobId = generateId('github');
        await enqueueJob(
          QUEUE_NAMES.GITHUB,
          {
            event,
            userId: req.user?.userId || null,
            env,
          },
          jobId
        );

        res.status(202).json({ status: 'accepted', eventId: event.sha });
      } catch (error) {
        req.log.error({ error }, 'Failed to process GitHub webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
