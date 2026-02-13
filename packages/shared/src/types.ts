/**
 * Shared Types for RTB AI Hub
 */

// Environment Types
export const ENVIRONMENTS = ['int', 'stg', 'prd'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];
export const DEFAULT_ENVIRONMENT: Environment = 'int';

// Webhook Event Types
export type FigmaWebhookEvent = {
  source: 'figma';
  type: 'FILE_UPDATE' | 'FILE_VERSION_UPDATE' | 'FILE_COMMENT';
  fileKey: string;
  fileName: string;
  fileUrl: string;
  timestamp: string;
  payload: Record<string, any>;
};

export enum JiraIssueType {
  STORY = 'Story',
  TASK = 'Task',
  SUBTASK = 'Sub-task',
  BUG = 'Bug',
  EPIC = 'Epic',
}

export type JiraComponent = {
  id: string;
  name: string;
  description?: string;
};

export type JiraWebhookEvent = {
  source: 'jira';
  type: 'issue_updated' | 'issue_created';
  issueKey: string;
  issueType: string;
  status: string;
  summary: string;
  description?: string;
  projectKey?: string;
  components?: JiraComponent[];
  labels?: string[];
  customFields?: Record<string, any>;
  timestamp: string;
  payload: Record<string, any>;
};

export type GitHubWebhookEvent = {
  source: 'github';
  type: 'pull_request' | 'push' | 'deployment';
  repository: string;
  prNumber?: number;
  prTitle?: string;
  branch?: string;
  sha?: string;
  timestamp: string;
  payload: Record<string, any>;
};

export type DatadogWebhookEvent = {
  source: 'datadog';
  type: 'alert' | 'monitor';
  alertId: string;
  title: string;
  message: string;
  priority: 'P1' | 'P2' | 'P3';
  service?: string;
  timestamp: string;
  payload: Record<string, any>;
};

export type WebhookEvent =
  | FigmaWebhookEvent
  | JiraWebhookEvent
  | GitHubWebhookEvent
  | DatadogWebhookEvent;

// Workflow Types
export enum WorkflowType {
  FIGMA_TO_JIRA = 'figma-to-jira',
  JIRA_AUTO_DEV = 'jira-auto-dev',
  AUTO_REVIEW = 'auto-review',
  DEPLOY_MONITOR = 'deploy-monitor',
  INCIDENT_TO_JIRA = 'incident-to-jira',
}

export enum WorkflowStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type WorkflowExecution = {
  id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  input: WebhookEvent;
  output?: any;
  error?: string;
  userId?: string | null;
  env?: Environment;
  aiModel?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  costUsd?: number;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
};

// AI Client Types
export enum AIModel {
  CLAUDE_OPUS = 'claude-3-opus-20240229',
  CLAUDE_SONNET = 'claude-3-5-sonnet-20240620',
  CLAUDE_HAIKU = 'claude-3-haiku-20240307',
  CLAUDE_SONNET_4 = 'claude-sonnet-4-20250514',
  CLAUDE_HAIKU_4 = 'claude-haiku-4-20250414',
}

export enum AITier {
  HEAVY = 'heavy', // Complex analysis, code generation
  MEDIUM = 'medium', // Standard tasks, code review
  LIGHT = 'light', // Quick operations, monitoring
}

export interface AIClient {
  model: AIModel;
  tier: AITier;
  generateText(prompt: string, options?: AIGenerateOptions): Promise<AIResponse>;
  generateWithTools(
    prompt: string,
    tools: MCPTool[],
    options?: AIGenerateOptions
  ): Promise<AIResponseWithTools>;
}

export type AIGenerateOptions = {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
};

export type AIResponse = {
  text: string;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  finishReason: string;
};

export type AIResponseWithTools = AIResponse & {
  toolCalls?: MCPToolCall[];
};

// MCP Tool Types
export type MCPTool = {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
};

export type MCPToolCall = {
  toolName: string;
  input: Record<string, any>;
  output?: any;
  error?: string;
};

// Dashboard Metrics Types
export type TodayMetrics = {
  date: string;
  figmaToJira: number;
  jiraAutoDev: number;
  autoReview: number;
  incidentResponse: number;
  successRate: number;
  failureCount: number;
};

export type InProgressWorkflow = {
  id: string;
  type: WorkflowType;
  startedAt: Date;
  progress: number; // 0-100
  description: string;
};

export type AICostMetrics = {
  date: string;
  heavy: number;
  medium: number;
  light: number;
  total: number;
};

export type WeeklyProductivityMetrics = {
  week: string;
  storyPointsCompleted: number;
  reviewTimeSaved: number; // hours
  avgFigmaToPRTime: number; // hours
  avgIncidentResponseTime: number; // minutes
};

export type DashboardMetrics = {
  today: TodayMetrics;
  inProgress: InProgressWorkflow[];
  aiCosts: AICostMetrics;
  weekly: WeeklyProductivityMetrics;
};
