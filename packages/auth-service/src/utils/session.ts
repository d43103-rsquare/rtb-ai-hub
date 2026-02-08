import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createLogger, requireEnv, generateId, JWTPayload, UserSession } from '@rtb-ai-hub/shared';
import { query } from './database';

const logger = createLogger('session');

const SESSION_DURATION = 7 * 24 * 60 * 60;
const _REFRESH_TOKEN_DURATION = 30 * 24 * 60 * 60;

export class SessionManager {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = requireEnv('JWT_SECRET');
  }

  async createSession(
    userId: string,
    email: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ sessionToken: string; refreshToken: string }> {
    const sessionId = generateId('session');

    const sessionToken = jwt.sign(
      {
        userId,
        email,
        sessionId,
      } as JWTPayload,
      this.jwtSecret,
      {
        expiresIn: SESSION_DURATION,
      }
    );

    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION * 1000);

    await query(
      `
      INSERT INTO user_sessions 
        (id, user_id, session_token, refresh_token, ip_address, user_agent, expires_at, created_at, last_activity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `,
      [
        sessionId,
        userId,
        sessionToken,
        refreshToken,
        metadata?.ipAddress || null,
        metadata?.userAgent || null,
        expiresAt,
      ]
    );

    logger.info({ userId, sessionId }, 'Session created');

    return { sessionToken, refreshToken };
  }

  async verifySession(sessionToken: string): Promise<JWTPayload> {
    try {
      const payload = jwt.verify(sessionToken, this.jwtSecret) as JWTPayload;

      const session = await query<UserSession>(
        `
        SELECT id, user_id as "userId", expires_at as "expiresAt"
        FROM user_sessions
        WHERE session_token = $1
        `,
        [sessionToken]
      );

      if (!session[0]) {
        throw new Error('Session not found');
      }

      if (new Date(session[0].expiresAt) < new Date()) {
        throw new Error('Session expired');
      }

      await query(
        `
        UPDATE user_sessions
        SET last_activity = NOW()
        WHERE id = $1
        `,
        [session[0].id]
      );

      return payload;
    } catch (error) {
      logger.error({ error }, 'Session verification failed');
      throw new Error('Invalid session');
    }
  }

  async refreshSession(refreshToken: string): Promise<{
    sessionToken: string;
    refreshToken: string;
  }> {
    const session = await query<{
      id: string;
      user_id: string;
      email: string;
    }>(
      `
      SELECT s.id, s.user_id, u.email
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.refresh_token = $1 AND s.expires_at > NOW()
      `,
      [refreshToken]
    );

    if (!session[0]) {
      throw new Error('Invalid or expired refresh token');
    }

    await this.deleteSession(session[0].id);

    const newSession = await this.createSession(session[0].user_id, session[0].email);

    logger.info({ userId: session[0].user_id }, 'Session refreshed');

    return newSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await query(
      `
      DELETE FROM user_sessions
      WHERE id = $1
      `,
      [sessionId]
    );

    logger.info({ sessionId }, 'Session deleted');
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await query(
      `
      DELETE FROM user_sessions
      WHERE user_id = $1
      `,
      [userId]
    );

    logger.info({ userId }, 'All user sessions deleted');
  }

  async cleanupExpiredSessions(): Promise<void> {
    const result = await query(
      `
      DELETE FROM user_sessions
      WHERE expires_at < NOW()
      `
    );

    logger.info({ count: result.length }, 'Expired sessions cleaned up');
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('base64url');
  }
}
