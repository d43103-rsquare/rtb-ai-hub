import { Router } from 'express';
import {
  QUEUE_NAMES,
  generateId,
  figmaWebhookSchema,
  validateBody,
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { FigmaWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { verifyFigmaSignature } from '../middleware/webhook-signature';
import { enqueueJob } from '../queue-client';

export function createFigmaRouter() {
  const router = Router();

  router.post(
    '/webhooks/figma',
    verifyFigmaSignature,
    optionalAuth,
    validateBody(figmaWebhookSchema),
    async (req: AuthRequest, res) => {
      try {
        const envParam =
          (req.query.env as string) || (req.headers['x-env'] as string) || DEFAULT_ENVIRONMENT;
        const env: Environment = ENVIRONMENTS.includes(envParam as Environment)
          ? (envParam as Environment)
          : DEFAULT_ENVIRONMENT;

        const event: FigmaWebhookEvent = {
          source: 'figma',
          type: req.body.event_type || 'FILE_UPDATE',
          fileKey: req.body.file_key,
          fileName: req.body.file_name,
          fileUrl: req.body.file_url || `https://www.figma.com/file/${req.body.file_key}`,
          timestamp: new Date().toISOString(),
          payload: req.body,
        };

        const jobId = generateId('figma');
        await enqueueJob(
          QUEUE_NAMES.FIGMA,
          {
            event,
            userId: req.user?.userId || null,
            env,
          },
          jobId
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
