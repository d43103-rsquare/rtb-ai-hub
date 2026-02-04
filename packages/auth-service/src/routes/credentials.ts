import { Router } from 'express';
import { createLogger, ServiceType } from '@rtb-ai-hub/shared';
import { CredentialManager } from '../credential/credential-manager';
import { OAuthManager } from '../oauth/oauth-providers';
import { AuthRequest } from '../middleware/auth';

const logger = createLogger('credential-routes');

export function createCredentialRoutes(
  credentialManager: CredentialManager,
  oauthManager: OAuthManager
) {
  const router = Router();

  router.post('/credentials/api-key', async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { service, apiKey } = req.body;

      if (!service || !apiKey) {
        res.status(400).json({ error: 'service and apiKey required' });
        return;
      }

      if (service !== 'anthropic' && service !== 'openai') {
        res
          .status(400)
          .json({
            error: 'This service requires OAuth instead of API key',
          });
        return;
      }

      await credentialManager.saveApiKey(req.user.userId, service, apiKey, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, service });
    } catch (error) {
      logger.error({ error }, 'Failed to save API key');
      res.status(500).json({ error: 'Failed to save API key' });
    }
  });

  router.get('/credentials', async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const credentials = await credentialManager.getUserCredentials(
        req.user.userId
      );

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

  router.delete(
    '/credentials/:service',
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const { service } = req.params;

        await credentialManager.deleteCredential(
          req.user.userId,
          service as ServiceType
        );

        res.json({ success: true });
      } catch (error) {
        logger.error({ error }, 'Failed to delete credential');
        res.status(500).json({ error: 'Failed to delete credential' });
      }
    }
  );

  router.get('/oauth/:service/connect', async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { service } = req.params;

      if (
        service !== 'jira' &&
        service !== 'github' &&
        service !== 'figma' &&
        service !== 'datadog'
      ) {
        res.status(400).json({ error: 'Invalid service' });
        return;
      }

      const authUrl = oauthManager.getAuthorizationUrl(
        service,
        req.user.userId
      );

      res.json({ authUrl });
    } catch (error) {
      logger.error({ error, service: req.params.service }, 'OAuth connect failed');
      res.status(500).json({ error: 'Failed to initiate OAuth' });
    }
  });

  router.get('/oauth/:service/callback', async (req, res) => {
    try {
      const { service } = req.params;
      const { code, state } = req.query;

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        res.status(400).json({ error: 'code and state required' });
        return;
      }

      if (
        service !== 'jira' &&
        service !== 'github' &&
        service !== 'figma' &&
        service !== 'datadog'
      ) {
        res.status(400).json({ error: 'Invalid service' });
        return;
      }

      await oauthManager.handleCallback(service, code, state);

      const redirectUrl =
        process.env.DASHBOARD_URL || 'http://localhost:3000';
      res.redirect(`${redirectUrl}/settings?oauth=${service}&status=success`);
    } catch (error) {
      logger.error({ error, service: req.params.service }, 'OAuth callback failed');
      const redirectUrl =
        process.env.DASHBOARD_URL || 'http://localhost:3000';
      res.redirect(`${redirectUrl}/settings?oauth=${req.params.service}&status=error`);
    }
  });

  return router;
}
