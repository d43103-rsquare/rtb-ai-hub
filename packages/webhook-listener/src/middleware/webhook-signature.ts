import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('webhook-signature');

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Creates an HMAC-SHA256 signature verification middleware.
 * If the corresponding env var is not set, verification is skipped (dev mode).
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
function createHmacVerifier(options: {
  provider: string;
  headerName: string;
  envVar: string;
  signaturePrefix?: string;
}) {
  const { provider, headerName, envVar, signaturePrefix } = options;

  return function (req: RawBodyRequest, res: Response, next: NextFunction): void {
    const secret = process.env[envVar];

    if (!secret) {
      logger.warn(
        `${envVar} not set — skipping ${provider} webhook signature verification (dev mode)`
      );
      next();
      return;
    }

    const signature = req.headers[headerName.toLowerCase()] as string | undefined;

    if (!signature) {
      logger.warn({ provider }, 'Missing webhook signature header');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    if (!req.rawBody) {
      logger.error({ provider }, 'Raw body not available for signature verification');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const hmac = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const expectedSignature = signaturePrefix ? `${signaturePrefix}${hmac}` : hmac;

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      logger.warn({ provider }, 'Webhook signature verification failed');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    logger.debug({ provider }, 'Webhook signature verified successfully');
    next();
  };
}

export const verifyGitHubSignature = createHmacVerifier({
  provider: 'GitHub',
  headerName: 'X-Hub-Signature-256',
  envVar: 'GITHUB_WEBHOOK_SECRET',
  signaturePrefix: 'sha256=',
});

export const verifyJiraSignature = createHmacVerifier({
  provider: 'Jira',
  headerName: 'X-Hub-Signature',
  envVar: 'JIRA_WEBHOOK_SECRET',
});

export const verifyFigmaSignature = createHmacVerifier({
  provider: 'Figma',
  headerName: 'X-Figma-Signature',
  envVar: 'FIGMA_WEBHOOK_SECRET',
});

export const verifyDatadogSignature = createHmacVerifier({
  provider: 'Datadog',
  headerName: 'X-Datadog-Signature',
  envVar: 'DATADOG_WEBHOOK_SECRET',
});
