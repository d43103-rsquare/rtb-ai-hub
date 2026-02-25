import { Router, Request, Response } from 'express';
import { MockJiraStore } from '../store';

const WEBHOOK_TARGET = process.env.WEBHOOK_LISTENER_URL || 'http://localhost:4000';
const DEFAULT_ENV = process.env.MOCK_JIRA_TARGET_ENV || 'int';

export function webhookTriggerRouter(store: MockJiraStore): Router {
  const router = Router();

  // POST /trigger — send Jira-format webhook to webhook-listener
  router.post('/trigger', async (req: Request, res: Response) => {
    const { issueKey, event } = req.body ?? {};

    if (!issueKey) {
      res.status(400).json({ error: 'Missing issueKey' });
      return;
    }

    const issue = store.getIssue(issueKey);
    if (!issue) {
      res.status(404).json({ error: `Issue ${issueKey} not found` });
      return;
    }

    const webhookPayload = {
      webhookEvent: event || 'issue_updated',
      issue: {
        key: issue.key,
        id: issue.id,
        fields: {
          issuetype: issue.fields.issuetype,
          status: issue.fields.status,
          summary: issue.fields.summary,
          description: issue.fields.description,
          project: issue.fields.project,
          labels: issue.fields.labels,
          priority: issue.fields.priority,
          components: issue.fields.components,
        },
      },
    };

    const targetUrl = `${WEBHOOK_TARGET}/webhooks/jira?env=${DEFAULT_ENV}`;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      res.json({
        triggered: true,
        webhookStatus: response.status,
        targetUrl,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        triggered: false,
        error: message,
      });
    }
  });

  return router;
}
