import { Router } from 'express';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, generateId } from '@rtb-ai-hub/shared';
import type { DatadogWebhookEvent } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';

export function createDatadogRouter(datadogQueue: Queue) {
  const router = Router();

  router.post('/webhooks/datadog', optionalAuth, async (req: AuthRequest, res) => {
    try {
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

      await datadogQueue.add('datadog-event', {
        event,
        userId: req.user?.userId || null,
      }, {
        jobId: generateId('datadog'),
      });

      res.status(202).json({ status: 'accepted', eventId: event.alertId });
    } catch (error) {
      req.log.error({ error }, 'Failed to process Datadog webhook');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
