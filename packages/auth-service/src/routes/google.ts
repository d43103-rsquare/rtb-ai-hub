import { Router } from 'express';
import { createLogger } from '@rtb-ai-hub/shared';
import { GoogleAuthManager } from '../google/google-auth';
import { SessionManager } from '../utils/session';

const logger = createLogger('google-routes');

export function createGoogleRoutes(
  googleAuth: GoogleAuthManager,
  sessionManager: SessionManager
) {
  const router = Router();

  router.get('/auth/google/login', (req, res) => {
    try {
      const authUrl = googleAuth.getAuthorizationUrl();
      res.json({ authUrl });
    } catch (error) {
      logger.error({ error }, 'Failed to generate Google auth URL');
      res.status(500).json({ error: 'Failed to initiate login' });
    }
  });

  router.get('/auth/google/callback', async (req, res) => {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Authorization code required' });
        return;
      }

      const googleInfo = await googleAuth.handleCallback(code);
      const user = await googleAuth.findOrCreateUser(googleInfo);

      const { sessionToken, refreshToken } = await sessionManager.createSession(
        user.id,
        user.email,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      res.cookie('session_token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      const redirectUrl =
        process.env.DASHBOARD_URL || 'http://localhost:3000';
      res.redirect(`${redirectUrl}/dashboard?login=success`);
    } catch (error) {
      logger.error({ error }, 'Google callback failed');
      const redirectUrl =
        process.env.DASHBOARD_URL || 'http://localhost:3000';
      res.redirect(`${redirectUrl}/login?error=auth_failed`);
    }
  });

  router.post('/auth/google/logout', async (req, res) => {
    try {
      const sessionToken = req.cookies?.session_token;

      if (sessionToken) {
        const payload = await sessionManager.verifySession(sessionToken);
        await sessionManager.deleteSession(payload.sessionId);
      }

      res.clearCookie('session_token');
      res.clearCookie('refresh_token');

      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Logout failed');
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  router.post('/auth/refresh', async (req, res) => {
    try {
      const refreshToken = req.cookies?.refresh_token;

      if (!refreshToken) {
        res.status(401).json({ error: 'No refresh token provided' });
        return;
      }

      const { sessionToken: newSessionToken, refreshToken: newRefreshToken } =
        await sessionManager.refreshSession(refreshToken);

      res.cookie('session_token', newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      res.status(401).json({ error: 'Token refresh failed' });
    }
  });

  return router;
}
