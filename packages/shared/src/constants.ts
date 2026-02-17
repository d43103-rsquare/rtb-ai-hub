/**
 * Shared Constants for RTB AI Hub
 */

import { WorkflowType, Environment } from './types';

// Queue Names
export const QUEUE_NAMES = {
  FIGMA: 'figma-queue',
  JIRA: 'jira-queue',
  GITHUB: 'github-queue',
  DATADOG: 'datadog-queue',
} as const;

// Workflow to Queue Mapping
export const WORKFLOW_QUEUE_MAP: Record<WorkflowType, string> = {
  [WorkflowType.FIGMA_TO_JIRA]: QUEUE_NAMES.FIGMA,
  [WorkflowType.JIRA_AUTO_DEV]: QUEUE_NAMES.JIRA,
  [WorkflowType.AUTO_REVIEW]: QUEUE_NAMES.GITHUB,
  [WorkflowType.DEPLOY_MONITOR]: QUEUE_NAMES.GITHUB,
  [WorkflowType.INCIDENT_TO_JIRA]: QUEUE_NAMES.DATADOG,
};

// Job Options
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 50,
};

// Database Tables
export const DB_TABLES = {
  WORKFLOW_EXECUTIONS: 'workflow_executions',
  WEBHOOK_EVENTS: 'webhook_events',
  METRICS: 'metrics',
  AI_COSTS: 'ai_costs',
} as const;

// AI Model Costs (per 1M tokens, USD) — Claude only
export const AI_MODEL_COSTS = {
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-20250414': { input: 0.8, output: 4.0 },
} as const;

export type McpServiceKey = 'JIRA' | 'FIGMA' | 'GITHUB' | 'DATADOG';

export const NATIVE_MCP_ENDPOINTS: Record<McpServiceKey, string> = {
  GITHUB: process.env.NATIVE_MCP_GITHUB_ENDPOINT || 'https://api.githubcopilot.com/mcp/',
  JIRA: process.env.NATIVE_MCP_JIRA_ENDPOINT || 'http://localhost:3000',
  FIGMA: process.env.NATIVE_MCP_FIGMA_ENDPOINT || 'https://mcp.figma.com/mcp',
  DATADOG: process.env.NATIVE_MCP_DATADOG_ENDPOINT || 'http://localhost:3000',
};

// ─── Native MCP Authentication Tokens ──────────────────────────────────────────

function loadNativeMcpToken(service: McpServiceKey, env?: string): string | undefined {
  if (env) {
    const prefix = env.toUpperCase();
    const envToken =
      process.env[
        `${prefix}_${service === 'GITHUB' ? 'GITHUB_TOKEN' : service === 'JIRA' ? 'JIRA_API_TOKEN' : service === 'FIGMA' ? 'FIGMA_ACCESS_TOKEN' : 'DD_API_KEY'}`
      ];
    if (envToken) return envToken;
  }

  switch (service) {
    case 'GITHUB':
      return process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    case 'JIRA':
      return process.env.JIRA_API_TOKEN;
    case 'FIGMA':
      return process.env.FIGMA_ACCESS_TOKEN;
    case 'DATADOG':
      return process.env.DD_API_KEY;
    default:
      return undefined;
  }
}

export function getNativeMcpToken(service: McpServiceKey, env?: string): string | undefined {
  return loadNativeMcpToken(service, env);
}

export function getNativeMcpEndpoint(service: McpServiceKey, env?: string): string {
  if (env) {
    const prefix = env.toUpperCase();
    const envEndpoint = process.env[`NATIVE_MCP_${service}_${prefix}_ENDPOINT`];
    if (envEndpoint) return envEndpoint;
  }
  return NATIVE_MCP_ENDPOINTS[service];
}

// ─── Repo Routing (Jira Component → GitHub Repo, Environment → Branch) ──────

export type RepoRoutingConfig = {
  repos: Record<string, string>;
  branches: Record<Environment, string>;
  fallbackRepo: string;
};

function loadRepoRouting(): RepoRoutingConfig {
  const reposRaw = process.env.REPO_ROUTING_REPOS;
  const branchesRaw = process.env.REPO_ROUTING_BRANCHES;

  const repos: Record<string, string> = {};
  if (reposRaw) {
    for (const entry of reposRaw.split(',')) {
      const [component, repo] = entry.split('=').map((s) => s.trim());
      if (component && repo) {
        repos[component] = repo;
      }
    }
  }

  const defaultBranches: Record<Environment, string> = {
    int: 'develop',
    stg: 'release/*',
    prd: 'main',
  };

  if (branchesRaw) {
    for (const entry of branchesRaw.split(',')) {
      const [env, branch] = entry.split('=').map((s) => s.trim());
      if (env && branch && (env === 'int' || env === 'stg' || env === 'prd')) {
        defaultBranches[env] = branch;
      }
    }
  }

  return {
    repos,
    branches: defaultBranches,
    fallbackRepo: process.env.GITHUB_REPO || '',
  };
}

export const REPO_ROUTING = loadRepoRouting();

// ─── Label-Based Repo Routing ─────────────────────────────────────────────────

/**
 * Maps a Jira label to a GitHub "owner/repo" string.
 * Env var format: LABEL_REPO_ROUTING=RTB-NEW=dev-rsquare/rtb-v2-mvp,RTB-LEGACY=dev-rsquare/rtb-legacy
 *
 * Usage (two-tier label system):
 *   1. Gate label (e.g. RTB-AI-HUB) — configured via JIRA_POLLING_TRIGGER_LABEL — filters which
 *      issues are polled at all.
 *   2. Repo labels (this config) — among the polled issues, a secondary label determines the
 *      target repository.
 */
export type LabelRepoMapping = Record<string, string>;

export type LabelRepoRoutingConfig = {
  mappings: LabelRepoMapping;
};

function loadLabelRepoRouting(): LabelRepoRoutingConfig {
  const raw = process.env.LABEL_REPO_ROUTING;
  const mappings: LabelRepoMapping = {};

  if (raw) {
    for (const entry of raw.split(',')) {
      const [label, repo] = entry.split('=').map((s) => s.trim());
      if (label && repo && repo.includes('/')) {
        mappings[label] = repo;
      }
    }
  }

  return { mappings };
}

export const LABEL_REPO_ROUTING = loadLabelRepoRouting();

// Feature Flags
export const FEATURE_FLAGS = {
  TARGET_CI_ENABLED: process.env.TARGET_CI_ENABLED !== 'false',
  TARGET_CD_ENABLED: process.env.TARGET_CD_ENABLED === 'true',
  LOCAL_POLLING_ENABLED:
    process.env.LOCAL_POLLING_ENABLED === 'true' || process.env.DEV_MODE === 'true',
  PREVIEW_ENABLED: process.env.PREVIEW_ENABLED === 'true',
  IMPACT_ANALYSIS_ENABLED: process.env.IMPACT_ANALYSIS_ENABLED === 'true',
  DECISION_JOURNAL_ENABLED: process.env.DECISION_JOURNAL_ENABLED === 'true',
  // v2: Debate + Claude Code + Worktree pipeline
  DEBATE_ENABLED: process.env.DEBATE_ENABLED !== 'false',
  CLAUDE_CODE_ENABLED: process.env.CLAUDE_CODE_ENABLED !== 'false',
  WORKTREE_ENABLED: process.env.WORKTREE_ENABLED === 'true',
} as const;

// ─── Branch Polling Configuration ────────────────────────────────────────────

export type PollingConfig = {
  enabled: boolean;
  intervalMs: number;
  workDir: string;
  trackedBranches: TrackedBranch[];
};

export type TrackedBranch = {
  /** Environment this branch maps to */
  env: Environment;
  /** Exact branch name ('develop', 'main') or glob pattern ('release/*') */
  pattern: string;
  /** Whether to auto-deploy on push (false = notify only) */
  autoDeploy: boolean;
};

export function loadPollingConfig(): PollingConfig {
  return {
    enabled: FEATURE_FLAGS.LOCAL_POLLING_ENABLED,
    intervalMs: Number(process.env.POLLING_INTERVAL_MS) || 10000,
    workDir: process.env.WORK_REPO_LOCAL_PATH || '',
    trackedBranches: [
      { env: 'int', pattern: 'develop', autoDeploy: true },
      { env: 'stg', pattern: 'release/*', autoDeploy: true },
      { env: 'prd', pattern: 'main', autoDeploy: false },
    ],
  };
}

// ─── Target Repo CI/CD Configuration ─────────────────────────────────────────

export type CiStepConfig = {
  name: string;
  command: string;
  required: boolean;
};

export type TargetCiConfig = {
  steps: CiStepConfig[];
  maxRetries: number;
  workDir: string;
};

export type TargetCdConfig = {
  composeFile: string;
  services: string[];
  healthTimeout: number;
  healthInterval: number;
  workDir: string;
};

function parseCiSteps(): CiStepConfig[] {
  const steps: CiStepConfig[] = [];

  const install = process.env.TARGET_CI_INSTALL_CMD;
  if (install) steps.push({ name: 'install', command: install, required: true });

  const lint = process.env.TARGET_CI_LINT_CMD;
  if (lint) steps.push({ name: 'lint', command: lint, required: true });

  const typecheck = process.env.TARGET_CI_TYPECHECK_CMD;
  if (typecheck) steps.push({ name: 'typecheck', command: typecheck, required: true });

  const test = process.env.TARGET_CI_TEST_CMD;
  if (test) steps.push({ name: 'test', command: test, required: true });

  const build = process.env.TARGET_CI_BUILD_CMD;
  if (build) steps.push({ name: 'build', command: build, required: true });

  return steps;
}

function parseCsvList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadTargetCiConfig(): TargetCiConfig {
  return {
    steps: parseCiSteps(),
    maxRetries: Number(process.env.TARGET_CI_MAX_RETRIES) || 2,
    workDir: process.env.WORK_REPO_LOCAL_PATH || '',
  };
}

export function loadTargetCdConfig(): TargetCdConfig {
  return {
    composeFile: process.env.TARGET_CD_COMPOSE_FILE || 'docker-compose.yml',
    services: parseCsvList(process.env.TARGET_CD_SERVICES),
    healthTimeout: Number(process.env.TARGET_CD_HEALTH_TIMEOUT) || 60,
    healthInterval: Number(process.env.TARGET_CD_HEALTH_INTERVAL) || 3,
    workDir: process.env.WORK_REPO_LOCAL_PATH || '',
  };
}

// ─── Preview Environment Configuration ────────────────────────────────────────

export type PreviewStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export type PreviewInstance = {
  /** Unique preview ID (e.g., "prev_PROJ-123") */
  id: string;
  /** Jira issue key (e.g., "PROJ-123") */
  issueKey: string;
  /** Git branch name (e.g., "feature/PROJ-123-login-page") */
  branchName: string;
  /** Environment */
  env: Environment;
  /** Current status */
  status: PreviewStatus;
  /** Web server port (Next.js) */
  webPort: number;
  /** API server port (Fastify) */
  apiPort: number;
  /** Database name for this preview */
  dbName: string;
  /** Git worktree path */
  worktreePath: string;
  /** Preview URL for web */
  webUrl: string;
  /** Preview URL for API */
  apiUrl: string;
  /** PID of web process */
  webPid?: number;
  /** PID of API process */
  apiPid?: number;
  /** When the preview was created */
  createdAt: string;
  /** When the preview was last accessed */
  lastAccessedAt?: string;
  /** Error message if failed */
  error?: string;
};

export type PreviewConfig = {
  /** Whether preview environments are enabled */
  enabled: boolean;
  /** Base port for web servers (increments by 100 per preview) */
  webBasePort: number;
  /** Base port for API servers (webBasePort + 1) */
  apiBasePort: number;
  /** Base path for git worktrees */
  worktreeBasePath: string;
  /** Work repo local path (source for worktrees) */
  workDir: string;
  /** Database URL for the dev/template database */
  templateDbUrl: string;
  /** Database connection URL (without database name, for CREATE/DROP) */
  dbAdminUrl: string;
  /** Template database name to use for CREATE DATABASE ... TEMPLATE */
  templateDbName: string;
  /** Maximum number of concurrent previews */
  maxInstances: number;
  /** Auto-cleanup after N hours (0 = disabled) */
  ttlHours: number;
  /** Host for preview URLs */
  host: string;
  /** Install command to run in worktree (e.g., "pnpm install") */
  installCmd: string;
  /** DB migration command (e.g., "pnpm db:migrate") */
  migrateCmd: string;
  /** Web dev command (e.g., "pnpm dev:web") */
  webCmd: string;
  /** API dev command (e.g., "pnpm dev:api") */
  apiCmd: string;
};

export function loadPreviewConfig(): PreviewConfig {
  return {
    enabled: FEATURE_FLAGS.PREVIEW_ENABLED,
    webBasePort: Number(process.env.PREVIEW_WEB_BASE_PORT) || 5100,
    apiBasePort: Number(process.env.PREVIEW_API_BASE_PORT) || 5101,
    worktreeBasePath: process.env.PREVIEW_WORKTREE_PATH || '/tmp/previews',
    workDir: process.env.WORK_REPO_LOCAL_PATH || '',
    templateDbUrl: process.env.PREVIEW_TEMPLATE_DB_URL || process.env.DATABASE_URL || '',
    dbAdminUrl:
      process.env.PREVIEW_DB_ADMIN_URL ||
      process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/postgres') ||
      '',
    templateDbName: process.env.PREVIEW_TEMPLATE_DB_NAME || 'rtb_dev',
    maxInstances: Number(process.env.PREVIEW_MAX_INSTANCES) || 5,
    ttlHours: Number(process.env.PREVIEW_TTL_HOURS) || 24,
    host: process.env.PREVIEW_HOST || 'localhost',
    installCmd: process.env.PREVIEW_INSTALL_CMD || 'pnpm install --frozen-lockfile',
    migrateCmd: process.env.PREVIEW_MIGRATE_CMD || 'pnpm db:migrate',
    webCmd: process.env.PREVIEW_WEB_CMD || 'pnpm dev:web',
    apiCmd: process.env.PREVIEW_API_CMD || 'pnpm dev:api',
  };
}

// ─── Impact Analysis Configuration ──────────────────────────────────────────

export type ImpactAnalysisConfig = {
  enabled: boolean;
  similarChangeLimit: number;
  highThreshold: number;
  mediumThreshold: number;
};

export function loadImpactAnalysisConfig(): ImpactAnalysisConfig {
  return {
    enabled: FEATURE_FLAGS.IMPACT_ANALYSIS_ENABLED,
    similarChangeLimit: Number(process.env.IMPACT_SIMILAR_CHANGE_LIMIT) || 10,
    highThreshold: Number(process.env.IMPACT_HIGH_THRESHOLD) || 10,
    mediumThreshold: Number(process.env.IMPACT_MEDIUM_THRESHOLD) || 3,
  };
}

// ─── Decision Journal Configuration ──────────────────────────────────────────

export type DecisionJournalConfig = {
  enabled: boolean;
  confidenceThreshold: number;
  weeklyDigestDay: number;
};

export function loadDecisionJournalConfig(): DecisionJournalConfig {
  return {
    enabled: FEATURE_FLAGS.DECISION_JOURNAL_ENABLED,
    confidenceThreshold: Number(process.env.DECISION_CONFIDENCE_THRESHOLD) || 0.7,
    weeklyDigestDay: Number(process.env.DECISION_WEEKLY_DIGEST_DAY) || 1,
  };
}

// Timeouts (milliseconds)
export const TIMEOUTS = {
  AI_REQUEST: 120000, // 2 minutes
  MCP_TOOL_CALL: 30000, // 30 seconds
  WEBHOOK_PROCESSING: 300000, // 5 minutes
  DATABASE_QUERY: 5000, // 5 seconds
} as const;
