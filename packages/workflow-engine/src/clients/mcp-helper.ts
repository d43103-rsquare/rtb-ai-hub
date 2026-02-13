import { createLogger, getEnv, REPO_ROUTING, LABEL_REPO_ROUTING } from '@rtb-ai-hub/shared';
import type { Environment, MCPToolCall, JiraWebhookEvent } from '@rtb-ai-hub/shared';
import type { IMCPClient } from './mcp-client-interface';
import { getMcpClient } from './mcp-client';

const logger = createLogger('mcp-helper');

// ─── MCP Response Parsing ──────────────────────────────────────────────────

/**
 * MCP tools return `{ content: [{ type: "text", text: JSON.stringify(data) }] }`.
 * This helper extracts and parses the actual data.
 */
function parseMcpResponse<T = unknown>(toolCall: MCPToolCall): T | null {
  if (toolCall.error) {
    return null;
  }

  try {
    const output = toolCall.output;
    if (output?.content?.[0]?.text) {
      return JSON.parse(output.content[0].text) as T;
    }
    return output as T;
  } catch (err) {
    logger.warn(
      { tool: toolCall.toolName, error: err instanceof Error ? err.message : String(err) },
      'Failed to parse MCP tool response'
    );
    return null;
  }
}

// ─── MCP Tool Call Wrapper ─────────────────────────────────────────────────

export type McpCallResult<T> =
  | { success: true; data: T; toolCall: MCPToolCall }
  | { success: false; error: string; toolCall?: MCPToolCall };

/**
 * Call an MCP tool with structured error handling and response parsing.
 * Returns a discriminated union — callers check `result.success` to branch.
 */
export async function callMcpTool<T = unknown>(
  client: IMCPClient,
  toolName: string,
  input: Record<string, unknown>
): Promise<McpCallResult<T>> {
  try {
    const toolCall = await client.callTool(toolName, input);

    if (toolCall.error) {
      logger.error({ tool: toolName, error: toolCall.error }, 'MCP tool returned error');
      return { success: false, error: toolCall.error, toolCall };
    }

    const data = parseMcpResponse<T>(toolCall);
    if (data === null) {
      return {
        success: false,
        error: 'Failed to parse MCP tool response',
        toolCall,
      };
    }

    return { success: true, data, toolCall };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ tool: toolName, error: message }, 'MCP tool call threw exception');
    return { success: false, error: message };
  }
}

// ─── Batch MCP Tool Calls (graceful) ───────────────────────────────────────

export type McpBatchResult = {
  /** Results keyed by a caller-defined label */
  results: Record<string, McpCallResult<unknown>>;
  /** Number of successful calls */
  successCount: number;
  /** Number of failed calls */
  failureCount: number;
  /** All errors collected */
  errors: string[];
};

/**
 * Execute multiple MCP tool calls. Failures are collected, not thrown.
 * Useful for workflows that need to call multiple tools and want graceful degradation.
 */
export async function callMcpToolsBatch(
  calls: Array<{
    label: string;
    client: IMCPClient;
    toolName: string;
    input: Record<string, unknown>;
  }>
): Promise<McpBatchResult> {
  const results: Record<string, McpCallResult<unknown>> = {};
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const call of calls) {
    const result = await callMcpTool(call.client, call.toolName, call.input);
    results[call.label] = result;

    if (result.success) {
      successCount++;
    } else {
      failureCount++;
      errors.push(`${call.label}: ${result.error}`);
    }
  }

  return { results, successCount, failureCount, errors };
}

// ─── Environment Config Helpers ────────────────────────────────────────────

/**
 * Get the Jira project key for a given environment.
 * Checks `{ENV}_JIRA_PROJECT_KEY` first, falls back to `JIRA_PROJECT_KEY`.
 */
export function getJiraProjectKey(env: Environment): string {
  const envKey = `${env.toUpperCase()}_JIRA_PROJECT_KEY`;
  return getEnv(envKey, getEnv('JIRA_PROJECT_KEY', 'PROJ'));
}

/**
 * Get GitHub owner/repo for a given environment.
 * Returns `{ owner, repo }` parsed from `{ENV}_GITHUB_REPO` or `GITHUB_REPO`.
 * Format: "owner/repo" (e.g., "my-org/my-repo").
 */
export function getGitHubRepo(env: Environment): { owner: string; repo: string } {
  const envKey = `${env.toUpperCase()}_GITHUB_REPO`;
  const repoStr = getEnv(envKey, getEnv('GITHUB_REPO', ''));

  if (!repoStr || !repoStr.includes('/')) {
    logger.warn(
      { env, envKey },
      'GITHUB_REPO not configured or invalid format (expected "owner/repo")'
    );
    return { owner: '', repo: '' };
  }

  const [owner, repo] = repoStr.split('/');
  return { owner, repo };
}

// ─── Repo Routing ───────────────────────────────────────────────────────────

export type GitHubTarget = {
  owner: string;
  repo: string;
  baseBranch: string;
};

export function resolveGitHubTarget(event: JiraWebhookEvent, env: Environment): GitHubTarget {
  const baseBranch = REPO_ROUTING.branches[env] || 'main';

  // Priority 1: Label-based routing (LABEL_REPO_ROUTING env var)
  const labels = event.labels || [];
  const labelMappings = LABEL_REPO_ROUTING.mappings;

  for (const label of labels) {
    const repoStr = labelMappings[label];
    if (repoStr && repoStr.includes('/')) {
      const [owner, repo] = repoStr.split('/');
      logger.info({ label, owner, repo, baseBranch, env }, 'Resolved repo from label routing');
      return { owner, repo, baseBranch };
    }
  }

  // Priority 2: Component-based routing (REPO_ROUTING_REPOS env var)
  const primaryComponent = event.components?.[0]?.name;
  if (primaryComponent && REPO_ROUTING.repos[primaryComponent]) {
    const repoStr = REPO_ROUTING.repos[primaryComponent];
    if (repoStr.includes('/')) {
      const [owner, repo] = repoStr.split('/');
      logger.info(
        { component: primaryComponent, owner, repo, baseBranch, env },
        'Resolved repo from component routing'
      );
      return { owner, repo, baseBranch };
    }
  }

  // Priority 3: Fallback to GITHUB_REPO env var
  const { owner, repo } = getGitHubRepo(env);
  if (!owner || !repo) {
    logger.warn(
      { env, event: event.issueKey },
      'No repo resolved — label/component routing miss and no fallback configured'
    );
  }
  return { owner, repo, baseBranch };
}

// ─── Workflow-Specific MCP Operations ──────────────────────────────────────

// Jira Operations

export type JiraIssueResult = {
  id: string;
  key: string;
  self: string;
};

export async function createJiraEpic(
  env: Environment,
  params: { projectKey: string; summary: string; description?: string }
): Promise<McpCallResult<JiraIssueResult>> {
  const client = getMcpClient('JIRA', env);
  return callMcpTool<JiraIssueResult>(client, 'createEpic', params);
}

export async function createJiraStory(
  env: Environment,
  params: { projectKey: string; summary: string; description?: string; labels?: string[] }
): Promise<McpCallResult<JiraIssueResult>> {
  return createJiraIssue(env, {
    ...params,
    issueType: 'Story',
  });
}

export async function createJiraTask(
  env: Environment,
  params: {
    projectKey: string;
    summary: string;
    description?: string;
    parentKey?: string;
    labels?: string[];
  }
): Promise<McpCallResult<JiraIssueResult>> {
  const client = getMcpClient('JIRA', env);

  if (params.parentKey) {
    const input = {
      projectKey: params.projectKey,
      issueType: 'Task',
      summary: params.summary,
      description: params.description,
      labels: params.labels,
      parentKey: params.parentKey,
    };
    return callMcpTool<JiraIssueResult>(client, 'createIssue', input);
  }

  return createJiraIssue(env, {
    projectKey: params.projectKey,
    issueType: 'Task',
    summary: params.summary,
    description: params.description,
    labels: params.labels,
  });
}

export async function createJiraSubtask(
  env: Environment,
  params: { parentKey: string; summary: string; description?: string }
): Promise<McpCallResult<JiraIssueResult>> {
  const client = getMcpClient('JIRA', env);
  return callMcpTool<JiraIssueResult>(client, 'createSubtask', params);
}

export async function createJiraIssue(
  env: Environment,
  params: {
    projectKey: string;
    issueType: string;
    summary: string;
    description?: string;
    priority?: string;
    labels?: string[];
  }
): Promise<McpCallResult<JiraIssueResult>> {
  const client = getMcpClient('JIRA', env);
  return callMcpTool<JiraIssueResult>(client, 'createIssue', params);
}

export async function addJiraComment(
  env: Environment,
  params: { issueKey: string; body: string }
): Promise<McpCallResult<unknown>> {
  const client = getMcpClient('JIRA', env);
  return callMcpTool(client, 'addComment', params);
}

// GitHub Operations

export type GitHubBranchResult = {
  branch: string;
  sha: string;
  baseBranch: string;
};

export type GitHubCommitResult = {
  sha: string;
  message: string;
  filesChanged: number;
};

export type GitHubPRResult = {
  number: number;
  url: string;
  title: string;
  state: string;
};

export type GitHubReviewResult = {
  id: number;
  state: string;
  htmlUrl: string;
};

export async function createGitHubBranch(
  env: Environment,
  params: { owner: string; repo: string; branch: string; fromBranch?: string }
): Promise<McpCallResult<GitHubBranchResult>> {
  const client = getMcpClient('GITHUB', env);
  return callMcpTool<GitHubBranchResult>(client, 'createBranch', params);
}

export async function createGitHubCommit(
  env: Environment,
  params: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: Array<{ path: string; content: string }>;
  }
): Promise<McpCallResult<GitHubCommitResult>> {
  const client = getMcpClient('GITHUB', env);
  return callMcpTool<GitHubCommitResult>(client, 'createCommit', params);
}

export async function createGitHubPullRequest(
  env: Environment,
  params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }
): Promise<McpCallResult<GitHubPRResult>> {
  const client = getMcpClient('GITHUB', env);
  return callMcpTool<GitHubPRResult>(client, 'createPullRequest', params);
}

export async function createGitHubReview(
  env: Environment,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    body: string;
  }
): Promise<McpCallResult<GitHubReviewResult>> {
  const client = getMcpClient('GITHUB', env);
  return callMcpTool<GitHubReviewResult>(client, 'createReview', params);
}

export async function createGitHubReviewComment(
  env: Environment,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    path: string;
    line: number;
  }
): Promise<McpCallResult<unknown>> {
  const client = getMcpClient('GITHUB', env);
  return callMcpTool(client, 'createReviewComment', params);
}

export async function createGitHubIssueComment(
  env: Environment,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }
): Promise<McpCallResult<unknown>> {
  const client = getMcpClient('GITHUB', env);
  return callMcpTool(client, 'createIssueComment', params);
}

// Figma Operations

export type FigmaFileResult = {
  name: string;
  lastModified: string;
  version: string;
  document: Record<string, unknown>;
  components: Record<string, unknown>;
  styles: Record<string, unknown>;
};

export type FigmaNodeResult = {
  nodes: Record<string, { document: Record<string, unknown>; components: Record<string, unknown> }>;
};

export type FigmaComponentMeta = {
  key: string;
  name: string;
  description: string;
  node_id: string;
  containing_frame?: { name: string };
};

export type FigmaComponentResult = {
  meta: { components: FigmaComponentMeta[] };
};

export type FigmaStyleMeta = {
  key: string;
  name: string;
  style_type: string;
  description: string;
  node_id: string;
};

export type FigmaStyleResult = {
  meta: { styles: FigmaStyleMeta[] };
};

export type FigmaVariablesResult = {
  meta: { variables: Record<string, unknown>; variableCollections: Record<string, unknown> };
};

export async function getFigmaFile(
  env: Environment,
  params: { fileKey: string; version?: string; depth?: number }
): Promise<McpCallResult<FigmaFileResult>> {
  const client = getMcpClient('FIGMA', env);
  return callMcpTool<FigmaFileResult>(client, 'getFile', params);
}

export async function getFigmaFileNodes(
  env: Environment,
  params: { fileKey: string; nodeIds: string[] }
): Promise<McpCallResult<FigmaNodeResult>> {
  const client = getMcpClient('FIGMA', env);
  return callMcpTool<FigmaNodeResult>(client, 'getFileNodes', params);
}

export async function getFigmaFileComponents(
  env: Environment,
  params: { fileKey: string }
): Promise<McpCallResult<FigmaComponentResult>> {
  const client = getMcpClient('FIGMA', env);
  return callMcpTool<FigmaComponentResult>(client, 'getFileComponents', params);
}

export async function getFigmaFileStyles(
  env: Environment,
  params: { fileKey: string }
): Promise<McpCallResult<FigmaStyleResult>> {
  const client = getMcpClient('FIGMA', env);
  return callMcpTool<FigmaStyleResult>(client, 'getFileStyles', params);
}

export async function getFigmaFileVariables(
  env: Environment,
  params: { fileKey: string }
): Promise<McpCallResult<FigmaVariablesResult>> {
  const client = getMcpClient('FIGMA', env);
  return callMcpTool<FigmaVariablesResult>(client, 'getFileVariables', params);
}

// Datadog Operations

export async function createDatadogMonitor(
  env: Environment,
  params: {
    name: string;
    type: string;
    query: string;
    message: string;
    tags?: string[];
    priority?: number;
  }
): Promise<McpCallResult<unknown>> {
  const client = getMcpClient('DATADOG', env);
  return callMcpTool(client, 'createMonitor', params);
}
