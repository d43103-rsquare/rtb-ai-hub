export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  workspaceDomain?: string;
  createdAt?: string;
  lastLogin?: string;
}

export type ServiceType = 'anthropic' | 'openai' | 'jira' | 'github' | 'figma' | 'datadog';

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
