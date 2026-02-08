import rateLimit from 'express-rate-limit';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('rate-limit');

export const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('user-agent'),
      },
      'Webhook rate limit exceeded'
    );

    const resetTime = res.getHeader('RateLimit-Reset');
    const retryAfter = resetTime ? Math.ceil(Number(resetTime) - Date.now() / 1000) : 900;

    res.status(429).json({
      error: 'Too many requests',
      retryAfter,
    });
  },
});

export const healthRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('user-agent'),
      },
      'Health check rate limit exceeded'
    );

    const resetTime = res.getHeader('RateLimit-Reset');
    const retryAfter = resetTime ? Math.ceil(Number(resetTime) - Date.now() / 1000) : 60;

    res.status(429).json({
      error: 'Too many requests',
      retryAfter,
    });
  },
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('user-agent'),
      },
      'API rate limit exceeded'
    );

    const resetTime = res.getHeader('RateLimit-Reset');
    const retryAfter = resetTime ? Math.ceil(Number(resetTime) - Date.now() / 1000) : 60;

    res.status(429).json({
      error: 'Too many requests',
      retryAfter,
    });
  },
});
