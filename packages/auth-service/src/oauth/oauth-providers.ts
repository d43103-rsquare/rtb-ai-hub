import {
  createLogger,
  getEnv,
  requireEnv,
  OAuthProviderConfig,
  ServiceType,
  OAuthTokenSet,
} from '@rtb-ai-hub/shared';
import { CredentialManager } from '../credential/credential-manager';

const logger = createLogger('oauth-providers');

const PROVIDERS: Record<
  Exclude<ServiceType, 'anthropic' | 'openai'>,
  Omit<OAuthProviderConfig, 'clientId' | 'clientSecret' | 'redirectUri'>
> = {
  jira: {
    name: 'Jira',
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: [
      'read:jira-work',
      'write:jira-work',
      'read:jira-user',
      'offline_access',
    ],
  },
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:user', 'read:org'],
  },
  figma: {
    name: 'Figma',
    authUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
    scopes: ['file_read'],
  },
  datadog: {
    name: 'Datadog',
    authUrl: 'https://app.datadoghq.com/oauth2/v1/authorize',
    tokenUrl: 'https://api.datadoghq.com/oauth2/v1/token',
    scopes: ['monitors_read', 'events_read'],
  },
};

export class OAuthManager {
  private credentialManager: CredentialManager;
  private stateStore: Map<string, { userId: string; service: ServiceType }> =
    new Map();

  constructor(credentialManager: CredentialManager) {
    this.credentialManager = credentialManager;
  }

  private getProviderConfig(
    service: Exclude<ServiceType, 'anthropic' | 'openai'>
  ): OAuthProviderConfig {
    const baseConfig = PROVIDERS[service];
    const serviceUpper = service.toUpperCase();

    return {
      ...baseConfig,
      clientId: requireEnv(`${serviceUpper}_CLIENT_ID`),
      clientSecret: requireEnv(`${serviceUpper}_CLIENT_SECRET`),
      redirectUri: getEnv(
        `${serviceUpper}_REDIRECT_URI`,
        `${requireEnv('APP_URL')}/auth/${service}/callback`
      ),
    };
  }

  getAuthorizationUrl(
    service: Exclude<ServiceType, 'anthropic' | 'openai'>,
    userId: string
  ): string {
    const config = this.getProviderConfig(service);
    const state = this.generateState(userId, service);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
    });

    if (service === 'jira') {
      params.append('audience', 'api.atlassian.com');
      params.append('prompt', 'consent');
    }

    logger.info({ service, userId }, 'Authorization URL generated');
    return `${config.authUrl}?${params}`;
  }

  async handleCallback(
    service: Exclude<ServiceType, 'anthropic' | 'openai'>,
    code: string,
    state: string
  ): Promise<{ userId: string; service: ServiceType }> {
    const stateData = this.verifyState(state);

    if (stateData.service !== service) {
      throw new Error('Service mismatch in state');
    }

    const config = this.getProviderConfig(service);
    const tokens = await this.exchangeCodeForTokens(service, code, config);

    await this.credentialManager.saveOAuthTokens(
      stateData.userId,
      service,
      tokens
    );

    logger.info({ service, userId: stateData.userId }, 'OAuth callback handled');
    return stateData;
  }

  private async exchangeCodeForTokens(
    service: Exclude<ServiceType, 'anthropic' | 'openai'>,
    code: string,
    config: OAuthProviderConfig
  ): Promise<OAuthTokenSet> {
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (service === 'github') {
      headers['Accept'] = 'application/json';
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { service, status: response.status, error: errorText },
        'Token exchange failed'
      );
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const data = await response.json() as any;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
      tokenType: data.token_type,
    };
  }

  async refreshAccessToken(
    userId: string,
    service: Exclude<ServiceType, 'anthropic' | 'openai'>
  ): Promise<string> {
    const tokens = await this.credentialManager.getOAuthTokens(userId, service);

    if (!tokens || !tokens.refreshToken) {
      throw new Error(`No refresh token available for ${service}`);
    }

    const config = this.getProviderConfig(service);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed for ${service}`);
    }

    const data = await response.json() as any;

    await this.credentialManager.updateOAuthAccessToken(
      userId,
      service,
      data.access_token,
      data.expires_in
    );

    logger.info({ service, userId }, 'Access token refreshed');
    return data.access_token;
  }

  async getAccessToken(
    userId: string,
    service: Exclude<ServiceType, 'anthropic' | 'openai'>
  ): Promise<string> {
    const tokens = await this.credentialManager.getOAuthTokens(userId, service);

    if (!tokens) {
      throw new Error(`No OAuth tokens found for ${service}`);
    }

    if (tokens.expiresIn && tokens.expiresIn < 300) {
      return await this.refreshAccessToken(userId, service);
    }

    return tokens.accessToken;
  }

  private generateState(userId: string, service: ServiceType): string {
    const state = `${userId}:${service}:${Date.now()}:${Math.random()
      .toString(36)
      .substring(2)}`;
    const encoded = Buffer.from(state).toString('base64url');

    this.stateStore.set(encoded, { userId, service });

    setTimeout(() => {
      this.stateStore.delete(encoded);
    }, 10 * 60 * 1000);

    return encoded;
  }

  private verifyState(
    state: string
  ): { userId: string; service: ServiceType } {
    const data = this.stateStore.get(state);

    if (!data) {
      throw new Error('Invalid or expired state parameter');
    }

    this.stateStore.delete(state);
    return data;
  }
}
