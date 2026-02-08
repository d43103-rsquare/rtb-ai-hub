import {
  createLogger,
  generateId,
  ServiceType,
  UserCredential,
  OAuthTokenSet,
  CredentialUsageLog,
  dbSchema,
} from '@rtb-ai-hub/shared';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../utils/database';
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

    await db
      .insert(dbSchema.userCredentials)
      .values({
        id: credentialId,
        userId,
        service,
        authType: 'api_key',
        apiKeyEncrypted: encrypted,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [dbSchema.userCredentials.userId, dbSchema.userCredentials.service],
        set: {
          apiKeyEncrypted: encrypted,
          authType: 'api_key',
          isActive: true,
          updatedAt: new Date(),
        },
      });

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
    const rows = await db
      .select({ apiKeyEncrypted: dbSchema.userCredentials.apiKeyEncrypted })
      .from(dbSchema.userCredentials)
      .where(
        and(
          eq(dbSchema.userCredentials.userId, userId),
          eq(dbSchema.userCredentials.service, service),
          eq(dbSchema.userCredentials.authType, 'api_key'),
          eq(dbSchema.userCredentials.isActive, true)
        )
      );

    if (!rows[0]?.apiKeyEncrypted) {
      throw new Error(`API key for ${service} not found`);
    }

    await this.logCredentialAction({
      userId,
      service,
      action: 'use',
      success: true,
    });

    return decryptApiKey(rows[0].apiKeyEncrypted);
  }

  async saveOAuthTokens(
    userId: string,
    service: ServiceType,
    tokens: OAuthTokenSet,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const credentialId = generateId('cred');
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;

    await db
      .insert(dbSchema.userCredentials)
      .values({
        id: credentialId,
        userId,
        service,
        authType: 'oauth',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        tokenExpiresAt: expiresAt,
        scope: tokens.scope || null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [dbSchema.userCredentials.userId, dbSchema.userCredentials.service],
        set: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || null,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope || null,
          authType: 'oauth',
          isActive: true,
          updatedAt: new Date(),
        },
      });

    await this.logCredentialAction({
      userId,
      service,
      action: 'create',
      success: true,
      ...metadata,
    });

    logger.info({ userId, service }, 'OAuth tokens saved');
  }

  async getOAuthTokens(userId: string, service: ServiceType): Promise<OAuthTokenSet | null> {
    const rows = await db
      .select({
        accessToken: dbSchema.userCredentials.accessToken,
        refreshToken: dbSchema.userCredentials.refreshToken,
        tokenExpiresAt: dbSchema.userCredentials.tokenExpiresAt,
        scope: dbSchema.userCredentials.scope,
      })
      .from(dbSchema.userCredentials)
      .where(
        and(
          eq(dbSchema.userCredentials.userId, userId),
          eq(dbSchema.userCredentials.service, service),
          eq(dbSchema.userCredentials.authType, 'oauth'),
          eq(dbSchema.userCredentials.isActive, true)
        )
      );

    if (!rows[0]) {
      return null;
    }

    const { accessToken, refreshToken, tokenExpiresAt, scope } = rows[0];

    await this.logCredentialAction({
      userId,
      service,
      action: 'use',
      success: true,
    });

    return {
      accessToken: accessToken!,
      refreshToken: refreshToken || undefined,
      expiresIn: tokenExpiresAt
        ? Math.floor((tokenExpiresAt.getTime() - Date.now()) / 1000)
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
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await db
      .update(dbSchema.userCredentials)
      .set({
        accessToken: newAccessToken,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dbSchema.userCredentials.userId, userId),
          eq(dbSchema.userCredentials.service, service),
          eq(dbSchema.userCredentials.authType, 'oauth')
        )
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
    await db
      .update(dbSchema.userCredentials)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dbSchema.userCredentials.userId, userId),
          eq(dbSchema.userCredentials.service, service)
        )
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
    const rows = await db
      .select({
        id: dbSchema.userCredentials.id,
        userId: dbSchema.userCredentials.userId,
        service: dbSchema.userCredentials.service,
        authType: dbSchema.userCredentials.authType,
        tokenExpiresAt: dbSchema.userCredentials.tokenExpiresAt,
        scope: dbSchema.userCredentials.scope,
        isActive: dbSchema.userCredentials.isActive,
        createdAt: dbSchema.userCredentials.createdAt,
        updatedAt: dbSchema.userCredentials.updatedAt,
      })
      .from(dbSchema.userCredentials)
      .where(
        and(
          eq(dbSchema.userCredentials.userId, userId),
          eq(dbSchema.userCredentials.isActive, true)
        )
      )
      .orderBy(desc(dbSchema.userCredentials.createdAt));

    return rows as UserCredential[];
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
      await db.insert(dbSchema.credentialUsageLog).values({
        id: generateId('log'),
        userId: log.userId,
        service: log.service,
        action: log.action,
        ipAddress: log.ipAddress || null,
        userAgent: log.userAgent || null,
        success: log.success,
        errorMessage: log.errorMessage || null,
      });
    } catch (error) {
      logger.error({ error, log }, 'Failed to log credential action');
    }
  }
}
