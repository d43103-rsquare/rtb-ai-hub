import { Router } from 'express';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES as _QUEUE_NAMES,
  generateId,
  datadogWebhookSchema,
  validateBody,
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { DatadogWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { verifyDatadogSignature } from '../middleware/webhook-signature';

export function createDatadogRouter(datadogQueue: Queue) {
  const router = Router();

  router.post(
    '/webhooks/datadog',
    verifyDatadogSignature,
    optionalAuth,
    validateBody(datadogWebhookSchema),
    async (req: AuthRequest, res) => {
      try {
        const envParam =
          (req.query.env as string) || (req.headers['x-env'] as string) || DEFAULT_ENVIRONMENT;
        const env: Environment = ENVIRONMENTS.includes(envParam as Environment)
          ? (envParam as Environment)
          : DEFAULT_ENVIRONMENT;

        const event: DatadogWebhookEvent = {
          source: 'datadog',
          type: req.body.event_type || 'alert',
          alertId: req.body.id || req.body.alert_id,
          title: req.body.title,
          message: req.body.body || req.body.message,
          priority: req.body.priority || 'P2',
          service: req.body.tags?.find((t: string) => t.startsWith('service:'))?.split(':')[1],
          timestamp: new Date().toISOString(),
          payload: req.body,
        };

        await datadogQueue.add(
          'datadog-event',
          {
            event,
            userId: req.user?.userId || null,
            env,
          },
          {
            jobId: generateId('datadog'),
          }
        );

        res.status(202).json({ status: 'accepted', eventId: event.alertId });
      } catch (error) {
        req.log.error({ error }, 'Failed to process Datadog webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
