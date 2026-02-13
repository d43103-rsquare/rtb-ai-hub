import { Request, Response, NextFunction } from 'express';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';

const logger = createLogger('internal-auth');

export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getEnv('RTB_INTERNAL_API_TOKEN', '');

  if (!token) {
    logger.debug('RTB_INTERNAL_API_TOKEN not set — skipping internal auth');
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const providedToken = authHeader.substring(7);

  if (providedToken !== token) {
    logger.warn({ path: req.path }, 'Invalid internal API token');
    res.status(403).json({ error: 'Invalid API token' });
    return;
  }

  next();
}
