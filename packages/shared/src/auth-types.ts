export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  workspaceDomain: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

export interface UserCredential {
  id: string;
  userId: string;
  service: ServiceType;
  authType: 'api_key' | 'oauth';
  apiKeyEncrypted?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scope?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceType = 'anthropic' | 'openai' | 'jira' | 'github' | 'figma' | 'datadog';

export interface CredentialUsageLog {
  id: string;
  userId: string;
  service: ServiceType;
  action: 'create' | 'update' | 'delete' | 'use' | 'refresh';
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  sessionToken: string;
  refreshToken?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string;
  email_verified?: boolean;
}

export interface JWTPayload {
  userId: string;
  email: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
}

export interface OAuthProviderConfig {
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface ApiKeyInput {
  service: ServiceType;
  apiKey: string;
}

export interface ServiceConnectionStatus {
  service: ServiceType;
  authType: 'api_key' | 'oauth';
  isConnected: boolean;
  connectedAt?: Date;
  expiresAt?: Date;
  scope?: string;
}
