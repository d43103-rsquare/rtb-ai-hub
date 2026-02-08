import { OAuth2Client } from 'google-auth-library';
import {
  createLogger,
  requireEnv,
  getEnv,
  GoogleUserInfo,
  User,
  generateId,
} from '@rtb-ai-hub/shared';
import { query } from '../utils/database';

const logger = createLogger('google-auth');

export class GoogleAuthManager {
  private oauth2Client: OAuth2Client;
  private allowedDomains: string[];

  constructor() {
    this.oauth2Client = new OAuth2Client(
      requireEnv('GOOGLE_CLIENT_ID'),
      requireEnv('GOOGLE_CLIENT_SECRET'),
      requireEnv('GOOGLE_REDIRECT_URI')
    );

    const domainsConfig = getEnv('ALLOWED_WORKSPACE_DOMAINS', '');
    this.allowedDomains = domainsConfig
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    logger.info({ allowedDomains: this.allowedDomains }, 'Google Auth Manager initialized');
  }

  getAuthorizationUrl(state?: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      hd: this.allowedDomains[0] || undefined,
      state,
      prompt: 'consent',
    });
  }

  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: requireEnv('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new Error('Invalid token payload');
      }

      if (this.allowedDomains.length > 0) {
        const domain = payload.hd;
        if (!domain || !this.allowedDomains.includes(domain)) {
          throw new Error(`Unauthorized workspace domain: ${domain || 'none'}`);
        }
      }

      return {
        sub: payload.sub,
        email: payload.email!,
        name: payload.name!,
        picture: payload.picture,
        hd: payload.hd,
        email_verified: payload.email_verified,
      };
    } catch (error) {
      logger.error({ error }, 'Token verification failed');
      throw error;
    }
  }

  async handleCallback(code: string): Promise<GoogleUserInfo> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    if (!tokens.id_token) {
      throw new Error('No ID token in response');
    }

    return await this.verifyIdToken(tokens.id_token);
  }

  async findOrCreateUser(googleInfo: GoogleUserInfo): Promise<User> {
    const existingUser = await query<User>(
      `
      SELECT id, google_id as "googleId", email, name, picture, 
             workspace_domain as "workspaceDomain", is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt", 
             last_login as "lastLogin"
      FROM users
      WHERE google_id = $1
      `,
      [googleInfo.sub]
    );

    if (existingUser[0]) {
      await query(
        `
        UPDATE users
        SET last_login = NOW(), updated_at = NOW()
        WHERE id = $1
        `,
        [existingUser[0].id]
      );

      logger.info({ userId: existingUser[0].id }, 'User logged in');
      return existingUser[0];
    }

    const userId = generateId('user');
    const newUser = await query<User>(
      `
      INSERT INTO users 
        (id, google_id, email, name, picture, workspace_domain, is_active, created_at, updated_at, last_login)
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW(), NOW())
      RETURNING id, google_id as "googleId", email, name, picture, 
                workspace_domain as "workspaceDomain", is_active as "isActive",
                created_at as "createdAt", updated_at as "updatedAt", 
                last_login as "lastLogin"
      `,
      [
        userId,
        googleInfo.sub,
        googleInfo.email,
        googleInfo.name,
        googleInfo.picture || null,
        googleInfo.hd || null,
      ]
    );

    logger.info({ userId: newUser[0].id }, 'New user created');
    return newUser[0];
  }

  async getUserById(userId: string): Promise<User | null> {
    const rows = await query<User>(
      `
      SELECT id, google_id as "googleId", email, name, picture, 
             workspace_domain as "workspaceDomain", is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt", 
             last_login as "lastLogin"
      FROM users
      WHERE id = $1 AND is_active = true
      `,
      [userId]
    );

    return rows[0] || null;
  }
}
