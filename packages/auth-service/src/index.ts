import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';
import { GoogleAuthManager } from './google/google-auth';
import { SessionManager } from './utils/session';
import { createAuthMiddleware } from './middleware/auth';
import { createGoogleRoutes } from './routes/google';

const logger = createLogger('auth-service');

async function main() {
  const app = express();
  const port = parseInt(getEnv('AUTH_SERVICE_PORT', '4001'));

  app.use(helmet());
  app.use(
    cors({
      origin: [
        getEnv('DASHBOARD_URL', 'http://localhost:3000'),
        'http://localhost:3001',
        'http://localhost:3002',
      ],
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  const googleAuth = new GoogleAuthManager();
  const sessionManager = new SessionManager();
  const authMiddleware = createAuthMiddleware(sessionManager);

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'auth-service',
      devMode: getEnv('DEV_MODE', 'false') === 'true',
    });
  });

  app.get('/auth/dev/login', (req, res) => {
    const devSession = SessionManager.createDevSession();
    if (!devSession) {
      res.status(403).json({ error: 'DEV_MODE is not enabled' });
      return;
    }

    res.cookie('session_token', devSession.sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.cookie('refresh_token', devSession.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    const redirectUrl = getEnv('DASHBOARD_URL', 'http://localhost:3000');
    res.redirect(`${redirectUrl}/dashboard?login=dev`);
  });

  app.use(createGoogleRoutes(googleAuth, sessionManager));

  app.get('/api/me', authMiddleware, async (req: any, res) => {
    try {
      const payload = req.user;
      res.json({
        id: payload.userId,
        email: payload.email,
        name: (payload as any).name || payload.email.split('@')[0],
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get user info');
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  app.listen(port, () => {
    const devMode = getEnv('DEV_MODE', 'false') === 'true';
    logger.info({ port, devMode }, 'Auth service started');
    if (devMode) {
      logger.info(
        { loginUrl: `http://localhost:${port}/auth/dev/login` },
        'DEV_MODE enabled — use /auth/dev/login for auto-login'
      );
    }
  });
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start auth service');
  process.exit(1);
});
