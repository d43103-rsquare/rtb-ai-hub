import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger, JWTPayload, requireEnv } from '@rtb-ai-hub/shared';

const logger = createLogger('webhook-auth');

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = requireEnv('JWT_SECRET');

    const payload = jwt.verify(token, jwtSecret) as JWTPayload;
    req.user = payload;

    logger.debug({ userId: payload.userId }, 'Authenticated webhook request');
    next();
  } catch (error) {
    logger.warn({ error }, 'Optional auth failed, continuing without auth');
    next();
  }
}
