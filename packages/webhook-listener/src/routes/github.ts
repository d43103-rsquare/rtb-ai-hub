import { Router } from 'express';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, generateId } from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';

export function createGitHubRouter(githubQueue: Queue) {
  const router = Router();

  router.post('/webhooks/github', optionalAuth, async (req: AuthRequest, res) => {
    try {
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

      await githubQueue.add('github-event', {
        event,
        userId: req.user?.userId || null,
      }, {
        jobId: generateId('github'),
      });

      res.status(202).json({ status: 'accepted', eventId: event.sha });
    } catch (error) {
      req.log.error({ error }, 'Failed to process GitHub webhook');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
