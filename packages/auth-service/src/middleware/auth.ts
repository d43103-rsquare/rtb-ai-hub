import { Request, Response, NextFunction } from 'express';
import { createLogger, JWTPayload } from '@rtb-ai-hub/shared';
import { SessionManager } from '../utils/session';

const logger = createLogger('auth-middleware');

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export function createAuthMiddleware(sessionManager: SessionManager) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.session_token;

      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : cookieToken;

      if (!token) {
        res.status(401).json({ error: 'No authentication token provided' });
        return;
      }

      const payload = await sessionManager.verifySession(token);
      req.user = payload;

      next();
    } catch (error) {
      logger.error({ error }, 'Authentication failed');
      res.status(401).json({ error: 'Invalid or expired session' });
    }
  };
}

export function optionalAuth(sessionManager: SessionManager) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.session_token;

      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : cookieToken;

      if (token) {
        const payload = await sessionManager.verifySession(token);
        req.user = payload;
      }

      next();
    } catch (error) {
      logger.warn({ error }, 'Optional auth failed, continuing without auth');
      next();
    }
  };
}
