import { Router } from 'express';
import {
  QUEUE_NAMES,
  generateId,
  jiraWebhookSchema,
  validateBody,
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { verifyJiraSignature } from '../middleware/webhook-signature';
import { enqueueJob } from '../queue-client';

export function createJiraRouter() {
  const router = Router();

  router.post(
    '/webhooks/jira',
    verifyJiraSignature,
    optionalAuth,
    validateBody(jiraWebhookSchema),
    async (req: AuthRequest, res) => {
      try {
        const envParam =
          (req.query.env as string) || (req.headers['x-env'] as string) || DEFAULT_ENVIRONMENT;
        const env: Environment = ENVIRONMENTS.includes(envParam as Environment)
          ? (envParam as Environment)
          : DEFAULT_ENVIRONMENT;

        const issue = req.body.issue;
        const _changeLog = req.body.changelog;

        const rawComponents = issue?.fields?.components;
        const components = Array.isArray(rawComponents)
          ? rawComponents.map((c: { id?: string; name?: string; description?: string }) => ({
              id: String(c.id || ''),
              name: String(c.name || ''),
              ...(c.description ? { description: String(c.description) } : {}),
            }))
          : [];

        const event: JiraWebhookEvent = {
          source: 'jira',
          type: req.body.webhookEvent || 'issue_updated',
          issueKey: issue?.key,
          issueType: issue?.fields?.issuetype?.name,
          status: issue?.fields?.status?.name,
          summary: issue?.fields?.summary,
          description: issue?.fields?.description,
          projectKey: issue?.fields?.project?.key,
          components,
          labels: Array.isArray(issue?.fields?.labels) ? issue.fields.labels : [],
          customFields: issue?.fields,
          timestamp: new Date().toISOString(),
          payload: req.body,
        };

        const jobId = generateId('jira');
        await enqueueJob(
          QUEUE_NAMES.JIRA,
          {
            event,
            userId: req.user?.userId || null,
            env,
          },
          jobId
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
