import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';
import { GoogleAuthManager } from './google/google-auth';
import { CredentialManager } from './credential/credential-manager';
import { OAuthManager } from './oauth/oauth-providers';
import { SessionManager } from './utils/session';
import { createAuthMiddleware } from './middleware/auth';
import { createGoogleRoutes } from './routes/google';
import { createCredentialRoutes } from './routes/credentials';

const logger = createLogger('auth-service');

async function main() {
  const app = express();
  const port = parseInt(getEnv('AUTH_SERVICE_PORT', '4001'));

  app.use(helmet());
  app.use(
    cors({
      origin: getEnv('DASHBOARD_URL', 'http://localhost:3000'),
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  const googleAuth = new GoogleAuthManager();
  const credentialManager = new CredentialManager();
  const oauthManager = new OAuthManager(credentialManager);
  const sessionManager = new SessionManager();

  const authMiddleware = createAuthMiddleware(sessionManager);

  // Health check must be before any auth middleware
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'auth-service' });
  });

  app.use(createGoogleRoutes(googleAuth, sessionManager));
  app.use(authMiddleware, createCredentialRoutes(credentialManager, oauthManager));

  app.get('/api/me', authMiddleware, async (req: any, res) => {
    try {
      const user = await googleAuth.getUserById(req.user.userId);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        workspaceDomain: user.workspaceDomain,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get user info');
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  setInterval(() => {
    sessionManager.cleanupExpiredSessions().catch((error) => {
      logger.error({ error }, 'Failed to cleanup expired sessions');
    });
  }, 60 * 60 * 1000);

  app.listen(port, () => {
    logger.info({ port }, 'Auth service started');
  });
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start auth service');
  process.exit(1);
});
