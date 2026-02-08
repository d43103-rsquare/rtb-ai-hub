import { Router } from 'express';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES as _QUEUE_NAMES,
  generateId,
  figmaWebhookSchema,
  validateBody,
} from '@rtb-ai-hub/shared';
import type { FigmaWebhookEvent } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { verifyFigmaSignature } from '../middleware/webhook-signature';

export function createFigmaRouter(figmaQueue: Queue) {
  const router = Router();

  router.post(
    '/webhooks/figma',
    verifyFigmaSignature,
    optionalAuth,
    validateBody(figmaWebhookSchema),
    async (req: AuthRequest, res) => {
      try {
        const event: FigmaWebhookEvent = {
          source: 'figma',
          type: req.body.event_type || 'FILE_UPDATE',
          fileKey: req.body.file_key,
          fileName: req.body.file_name,
          fileUrl: req.body.file_url || `https://www.figma.com/file/${req.body.file_key}`,
          timestamp: new Date().toISOString(),
          payload: req.body,
        };

        await figmaQueue.add(
          'figma-event',
          {
            event,
            userId: req.user?.userId || null,
          },
          {
            jobId: generateId('figma'),
          }
        );

        res.status(202).json({ status: 'accepted', eventId: event.fileKey });
      } catch (error) {
        req.log.error({ error }, 'Failed to process Figma webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
