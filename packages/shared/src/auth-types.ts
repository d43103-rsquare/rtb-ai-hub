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

export type ServiceType = 'anthropic' | 'openai' | 'jira' | 'github' | 'figma' | 'datadog';

export interface JiraUserMapping {
  email: string;
  jiraAccountId?: string;
  displayName?: string;
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
