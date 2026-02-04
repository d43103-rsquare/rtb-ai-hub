import {
  createLogger,
  generateId,
  ServiceType,
  UserCredential,
  OAuthTokenSet,
  CredentialUsageLog,
} from '@rtb-ai-hub/shared';
import { query, transaction } from '../utils/database';
import { encryptApiKey, decryptApiKey } from './encryption';

const logger = createLogger('credential-manager');

export class CredentialManager {
  async saveApiKey(
    userId: string,
    service: ServiceType,
    apiKey: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const encrypted = encryptApiKey(apiKey);
    const credentialId = generateId('cred');

    await query(
      `
      INSERT INTO user_credentials 
        (id, user_id, service, auth_type, api_key_encrypted, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, 'api_key', $4, true, NOW(), NOW())
      ON CONFLICT (user_id, service) 
      DO UPDATE SET 
        api_key_encrypted = $4,
        auth_type = 'api_key',
        is_active = true,
        updated_at = NOW()
      `,
      [credentialId, userId, service, encrypted]
    );

    await this.logCredentialAction({
      userId,
      service,
      action: 'create',
      success: true,
      ...metadata,
    });

    logger.info({ userId, service }, 'API key saved');
  }

  async getApiKey(userId: string, service: ServiceType): Promise<string> {
    const rows = await query<{ api_key_encrypted: string }>(
      `
      SELECT api_key_encrypted
      FROM user_credentials
      WHERE user_id = $1 AND service = $2 AND auth_type = 'api_key' AND is_active = true
      `,
      [userId, service]
    );

    if (!rows[0]) {
      throw new Error(`API key for ${service} not found`);
    }

    await this.logCredentialAction({
      userId,
      service,
      action: 'use',
      success: true,
    });

    return decryptApiKey(rows[0].api_key_encrypted);
  }

  async saveOAuthTokens(
    userId: string,
    service: ServiceType,
    tokens: OAuthTokenSet,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const credentialId = generateId('cred');
    const expiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : null;

    await query(
      `
      INSERT INTO user_credentials 
        (id, user_id, service, auth_type, access_token, refresh_token, token_expires_at, scope, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, 'oauth', $4, $5, $6, $7, true, NOW(), NOW())
      ON CONFLICT (user_id, service) 
      DO UPDATE SET 
        access_token = $4,
        refresh_token = $5,
        token_expires_at = $6,
        scope = $7,
        auth_type = 'oauth',
        is_active = true,
        updated_at = NOW()
      `,
      [
        credentialId,
        userId,
        service,
        tokens.accessToken,
        tokens.refreshToken || null,
        expiresAt,
        tokens.scope || null,
      ]
    );

    await this.logCredentialAction({
      userId,
      service,
      action: 'create',
      success: true,
      ...metadata,
    });

    logger.info({ userId, service }, 'OAuth tokens saved');
  }

  async getOAuthTokens(
    userId: string,
    service: ServiceType
  ): Promise<OAuthTokenSet | null> {
    const rows = await query<{
      access_token: string;
      refresh_token: string | null;
      token_expires_at: Date | null;
      scope: string | null;
    }>(
      `
      SELECT access_token, refresh_token, token_expires_at, scope
      FROM user_credentials
      WHERE user_id = $1 AND service = $2 AND auth_type = 'oauth' AND is_active = true
      `,
      [userId, service]
    );

    if (!rows[0]) {
      return null;
    }

    const { access_token, refresh_token, token_expires_at, scope } = rows[0];

    await this.logCredentialAction({
      userId,
      service,
      action: 'use',
      success: true,
    });

    return {
      accessToken: access_token,
      refreshToken: refresh_token || undefined,
      expiresIn: token_expires_at
        ? Math.floor((token_expires_at.getTime() - Date.now()) / 1000)
        : undefined,
      scope: scope || undefined,
    };
  }

  async updateOAuthAccessToken(
    userId: string,
    service: ServiceType,
    newAccessToken: string,
    expiresIn?: number
  ): Promise<void> {
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await query(
      `
      UPDATE user_credentials
      SET access_token = $1, token_expires_at = $2, updated_at = NOW()
      WHERE user_id = $3 AND service = $4 AND auth_type = 'oauth'
      `,
      [newAccessToken, expiresAt, userId, service]
    );

    await this.logCredentialAction({
      userId,
      service,
      action: 'refresh',
      success: true,
    });

    logger.info({ userId, service }, 'OAuth access token refreshed');
  }

  async deleteCredential(userId: string, service: ServiceType): Promise<void> {
    await query(
      `
      UPDATE user_credentials
      SET is_active = false, updated_at = NOW()
      WHERE user_id = $1 AND service = $2
      `,
      [userId, service]
    );

    await this.logCredentialAction({
      userId,
      service,
      action: 'delete',
      success: true,
    });

    logger.info({ userId, service }, 'Credential deleted');
  }

  async getUserCredentials(userId: string): Promise<UserCredential[]> {
    const rows = await query<UserCredential>(
      `
      SELECT id, user_id as "userId", service, auth_type as "authType",
             token_expires_at as "tokenExpiresAt", scope, is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM user_credentials
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return rows;
  }

  private async logCredentialAction(log: {
    userId: string;
    service: ServiceType;
    action: CredentialUsageLog['action'];
    success: boolean;
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await query(
        `
        INSERT INTO credential_usage_log 
          (id, user_id, service, action, ip_address, user_agent, success, error_message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `,
        [
          generateId('log'),
          log.userId,
          log.service,
          log.action,
          log.ipAddress || null,
          log.userAgent || null,
          log.success,
          log.errorMessage || null,
        ]
      );
    } catch (error) {
      logger.error({ error, log }, 'Failed to log credential action');
    }
  }
}
