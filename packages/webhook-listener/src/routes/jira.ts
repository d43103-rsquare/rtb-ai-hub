import { Router } from 'express';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES as _QUEUE_NAMES,
  generateId,
  jiraWebhookSchema,
  validateBody,
} from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { verifyJiraSignature } from '../middleware/webhook-signature';

export function createJiraRouter(jiraQueue: Queue) {
  const router = Router();

  router.post(
    '/webhooks/jira',
    verifyJiraSignature,
    optionalAuth,
    validateBody(jiraWebhookSchema),
    async (req: AuthRequest, res) => {
      try {
        const issue = req.body.issue;
        const _changeLog = req.body.changelog;

        const event: JiraWebhookEvent = {
          source: 'jira',
          type: req.body.webhookEvent || 'issue_updated',
          issueKey: issue?.key,
          issueType: issue?.fields?.issuetype?.name,
          status: issue?.fields?.status?.name,
          summary: issue?.fields?.summary,
          description: issue?.fields?.description,
          customFields: issue?.fields,
          timestamp: new Date().toISOString(),
          payload: req.body,
        };

        await jiraQueue.add(
          'jira-event',
          {
            event,
            userId: req.user?.userId || null,
          },
          {
            jobId: generateId('jira'),
          }
        );

        res.status(202).json({ status: 'accepted', eventId: event.issueKey });
      } catch (error) {
        req.log.error({ error }, 'Failed to process Jira webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
