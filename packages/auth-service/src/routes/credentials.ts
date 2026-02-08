import { Router } from 'express';
import {
  createLogger,
  ServiceType,
  apiKeyInputSchema,
  oauthServiceSchema,
  credentialServiceSchema,
  validateBody,
} from '@rtb-ai-hub/shared';
import { CredentialManager } from '../credential/credential-manager';
import { OAuthManager } from '../oauth/oauth-providers';
import { AuthRequest } from '../middleware/auth';

const logger = createLogger('credential-routes');

export function createCredentialRoutes(
  credentialManager: CredentialManager,
  oauthManager: OAuthManager
) {
  const router = Router();

  router.post(
    '/credentials/api-key',
    validateBody(apiKeyInputSchema),
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const { service, apiKey } = req.body;

        await credentialManager.saveApiKey(req.user.userId, service, apiKey, {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        res.json({ success: true, service });
      } catch (error) {
        logger.error({ error }, 'Failed to save API key');
        res.status(500).json({ error: 'Failed to save API key' });
      }
    }
  );

  router.get('/credentials', async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const credentials = await credentialManager.getUserCredentials(req.user.userId);

      const sanitized = credentials.map((cred) => ({
        service: cred.service,
        authType: cred.authType,
        isConnected: cred.isActive,
        expiresAt: cred.tokenExpiresAt,
        scope: cred.scope,
        connectedAt: cred.createdAt,
      }));

      res.json({ credentials: sanitized });
    } catch (error) {
      logger.error({ error }, 'Failed to get credentials');
      res.status(500).json({ error: 'Failed to get credentials' });
    }
  });

  router.delete('/credentials/:service', async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parsed = credentialServiceSchema.safeParse(req.params.service);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ path: 'service', message: 'Invalid service' }],
        });
        return;
      }
      const service = parsed.data;

      await credentialManager.deleteCredential(req.user.userId, service as ServiceType);

      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete credential');
      res.status(500).json({ error: 'Failed to delete credential' });
    }
  });

  router.get('/oauth/:service/connect', async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parsed = oauthServiceSchema.safeParse(req.params.service);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ path: 'service', message: 'Invalid service' }],
        });
        return;
      }
      const service = parsed.data;

      const authUrl = oauthManager.getAuthorizationUrl(service, req.user.userId);

      res.json({ authUrl });
    } catch (error) {
      logger.error({ error, service: req.params.service }, 'OAuth connect failed');
      res.status(500).json({ error: 'Failed to initiate OAuth' });
    }
  });

  router.get('/oauth/:service/callback', async (req, res) => {
    try {
      const parsedService = oauthServiceSchema.safeParse(req.params.service);
      if (!parsedService.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ path: 'service', message: 'Invalid service' }],
        });
        return;
      }
      const service = parsedService.data;

      const { code, state } = req.query;

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        res.status(400).json({ error: 'code and state required' });
        return;
      }

      await oauthManager.handleCallback(service, code, state);

      const redirectUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
      res.redirect(`${redirectUrl}/settings?oauth=${service}&status=success`);
    } catch (error) {
      logger.error({ error, service: req.params.service }, 'OAuth callback failed');
      const redirectUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
      res.redirect(`${redirectUrl}/settings?oauth=${req.params.service}&status=error`);
    }
  });

  return router;
}
