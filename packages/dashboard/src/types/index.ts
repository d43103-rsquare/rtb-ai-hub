export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  workspaceDomain: string;
  createdAt: string;
  lastLogin: string;
}

export interface Credential {
  id: string;
  userId: string;
  service: ServiceType;
  isActive: boolean;
  createdAt: string;
  lastUsed?: string;
  metadata?: Record<string, unknown>;
}

export type ServiceType = 
  | 'anthropic'
  | 'openai'
  | 'jira'
  | 'github'
  | 'figma'
  | 'datadog';

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Workflow {
  id: string;
  userId: string;
  type: string;
  status: WorkflowStatus;
  cost?: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export interface ApiKeyInput {
  service: 'anthropic' | 'openai';
  apiKey: string;
}

export interface OAuthService {
  name: ServiceType;
  displayName: string;
  icon: string;
  connected: boolean;
}
