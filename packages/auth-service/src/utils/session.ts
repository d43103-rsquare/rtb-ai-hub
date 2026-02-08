import jwt from 'jsonwebtoken';
import { createLogger, requireEnv, getEnv, JWTPayload } from '@rtb-ai-hub/shared';

const logger = createLogger('session');

const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days

export class SessionManager {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = requireEnv('JWT_SECRET');
  }

  async createSession(
    userId: string,
    email: string,
    _metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ sessionToken: string; refreshToken: string }> {
    const sessionId = `session_${Date.now()}`;

    const sessionToken = jwt.sign({ userId, email, sessionId } as JWTPayload, this.jwtSecret, {
      expiresIn: SESSION_DURATION,
    });

    const refreshToken = jwt.sign({ userId, email, sessionId, type: 'refresh' }, this.jwtSecret, {
      expiresIn: 30 * 24 * 60 * 60,
    });

    logger.info({ userId, sessionId }, 'Session created');
    return { sessionToken, refreshToken };
  }

  async verifySession(sessionToken: string): Promise<JWTPayload> {
    try {
      return jwt.verify(sessionToken, this.jwtSecret) as JWTPayload;
    } catch (error) {
      logger.error({ error }, 'Session verification failed');
      throw new Error('Invalid session');
    }
  }

  async refreshSession(refreshToken: string): Promise<{
    sessionToken: string;
    refreshToken: string;
  }> {
    try {
      const payload = jwt.verify(refreshToken, this.jwtSecret) as JWTPayload & { type?: string };
      if (payload.type !== 'refresh') {
        throw new Error('Not a refresh token');
      }
      return await this.createSession(payload.userId, payload.email);
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      throw new Error('Invalid or expired refresh token');
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    logger.info({ sessionId }, 'Session invalidated (client-side)');
  }

  /**
   * Create a dev session for DEV_MODE bypass.
   * When DEV_MODE=true and DEV_USER_EMAIL is set, returns a pre-signed JWT.
   */
  static createDevSession(): { sessionToken: string; refreshToken: string } | null {
    const devMode = getEnv('DEV_MODE', 'false') === 'true';
    const devEmail = getEnv('DEV_USER_EMAIL', '');
    const devName = getEnv('DEV_USER_NAME', 'Dev User');

    if (!devMode || !devEmail) {
      return null;
    }

    const jwtSecret = requireEnv('JWT_SECRET');
    const devUserId = `dev_${devEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const sessionToken = jwt.sign(
      {
        userId: devUserId,
        email: devEmail,
        sessionId: 'dev_session',
        name: devName,
      } as JWTPayload & { name: string },
      jwtSecret,
      { expiresIn: 30 * 24 * 60 * 60 }
    );

    const refreshToken = jwt.sign(
      { userId: devUserId, email: devEmail, sessionId: 'dev_session', type: 'refresh' },
      jwtSecret,
      { expiresIn: 365 * 24 * 60 * 60 }
    );

    logger.info({ devEmail, devUserId }, 'Dev session created');
    return { sessionToken, refreshToken };
  }
}
