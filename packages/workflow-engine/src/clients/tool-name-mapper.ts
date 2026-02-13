import type { McpService } from './mcp-client-interface';

// ─── Mapping Types ──────────────────────────────────────────────────────────

export type SimpleMapping = string;

export type ComplexMapping = {
  tool: string;
  pathTemplate?: string;
  path?: string;
};

export type ToolMapping = SimpleMapping | ComplexMapping;

// ─── Per-Service Mapping Tables ─────────────────────────────────────────────

const GITHUB_MAPPINGS: Record<string, ToolMapping> = {
  createBranch: 'create_branch',
  createPullRequest: 'create_pull_request',
  getPullRequest: 'get_pull_request',
  getPullRequestDiff: 'get_pull_request_files',
  createReview: 'create_pull_request_review',
  mergePullRequest: 'merge_pull_request',
  createCommit: 'push_files',
  createReviewComment: 'create_pull_request_review',
  createIssueComment: 'add_issue_comment',
  searchIssues: 'search_issues',
};

const JIRA_MAPPINGS: Record<string, ToolMapping> = {
  getIssue: { tool: 'jira_get', pathTemplate: '/rest/api/3/issue/{issueKey}' },
  searchIssues: { tool: 'jira_get', pathTemplate: '/rest/api/3/search/jql' },
  createIssue: { tool: 'jira_post', path: '/rest/api/3/issue' },
  createEpic: { tool: 'jira_post', path: '/rest/api/3/issue' },
  createSubtask: { tool: 'jira_post', path: '/rest/api/3/issue' },
  updateIssue: { tool: 'jira_put', pathTemplate: '/rest/api/3/issue/{issueKey}' },
  transitionIssue: {
    tool: 'jira_post',
    pathTemplate: '/rest/api/3/issue/{issueKey}/transitions',
  },
  addComment: { tool: 'jira_post', pathTemplate: '/rest/api/3/issue/{issueKey}/comment' },
};

const FIGMA_MAPPINGS: Record<string, ToolMapping> = {
  getFile: 'get_metadata',
  getFileNodes: 'get_design_context',
  getFileComponents: 'get_code_connect_map',
  getFileStyles: 'get_variable_defs',
  getFileVariables: 'get_variable_defs',
  getComments: 'UNSUPPORTED',
};

const DATADOG_MAPPINGS: Record<string, ToolMapping> = {
  getLogs: 'get_logs',
  queryMetrics: 'query_metrics',
  getTraces: 'list_traces',
  getAlerts: 'list_incidents',
  getMonitors: 'get_monitors',
  createMonitor: 'CUSTOM_EXTENSION',
};

const SERVICE_MAPPINGS: Record<McpService, Record<string, ToolMapping>> = {
  GITHUB: GITHUB_MAPPINGS,
  JIRA: JIRA_MAPPINGS,
  FIGMA: FIGMA_MAPPINGS,
  DATADOG: DATADOG_MAPPINGS,
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function mapToolName(service: McpService, toolName: string): ToolMapping {
  const mappings = SERVICE_MAPPINGS[service];
  const mapping = mappings[toolName];

  if (!mapping) {
    throw new Error(`Unknown tool "${toolName}" for service ${service}`);
  }

  if (mapping === 'UNSUPPORTED') {
    throw new Error(`Tool "${toolName}" is not supported by the native ${service} MCP server`);
  }

  if (mapping === 'CUSTOM_EXTENSION') {
    throw new Error(
      `Tool "${toolName}" requires a custom extension — not available in native ${service} MCP server`
    );
  }

  return mapping;
}

export function mapToolCall(
  service: McpService,
  toolName: string,
  input: Record<string, unknown>
): { toolName: string; input: Record<string, unknown> } {
  const mapping = mapToolName(service, toolName);

  if (typeof mapping === 'string') {
    return { toolName: mapping, input };
  }

  return mapComplexCall(service, toolName, mapping, input);
}

// ─── Jira Complex Mapping ───────────────────────────────────────────────────

function mapComplexCall(
  service: McpService,
  originalToolName: string,
  mapping: ComplexMapping,
  input: Record<string, unknown>
): { toolName: string; input: Record<string, unknown> } {
  if (service !== 'JIRA') {
    const resolvedPath = resolvePath(mapping, input);
    return { toolName: mapping.tool, input: { path: resolvedPath, ...input } };
  }

  return mapJiraCall(originalToolName, mapping, input);
}

function mapJiraCall(
  originalToolName: string,
  mapping: ComplexMapping,
  input: Record<string, unknown>
): { toolName: string; input: Record<string, unknown> } {
  const resolvedPath = resolvePath(mapping, input);

  switch (originalToolName) {
    case 'getIssue':
      return { toolName: mapping.tool, input: { path: resolvedPath } };

    case 'searchIssues': {
      const { jql, maxResults, startAt, ...rest } = input as Record<string, unknown>;
      const queryParams: Record<string, unknown> = {};
      if (jql !== undefined) queryParams.jql = jql;
      if (maxResults !== undefined) queryParams.maxResults = maxResults;
      if (startAt !== undefined) queryParams.startAt = startAt;
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, queryParams: { ...queryParams, ...rest } },
      };
    }

    case 'createIssue': {
      const { projectKey, issueType, summary, description, priority, labels, parentKey, ...rest } =
        input as Record<string, unknown>;
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        issuetype: { name: issueType || 'Task' },
        summary,
      };
      if (description !== undefined) fields.description = description;
      if (priority !== undefined) fields.priority = { name: priority };
      if (labels !== undefined) fields.labels = labels;
      if (parentKey !== undefined) fields.parent = { key: parentKey };
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, body: { fields: { ...fields, ...rest } } },
      };
    }

    case 'createEpic': {
      const { projectKey, summary, description, ...rest } = input as Record<string, unknown>;
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        issuetype: { name: 'Epic' },
        summary,
      };
      if (description !== undefined) fields.description = description;
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, body: { fields: { ...fields, ...rest } } },
      };
    }

    case 'createSubtask': {
      const { parentKey, summary, description, projectKey, ...rest } = input as Record<
        string,
        unknown
      >;
      const fields: Record<string, unknown> = {
        issuetype: { name: 'Sub-task' },
        summary,
        parent: { key: parentKey },
      };
      if (projectKey !== undefined) fields.project = { key: projectKey };
      if (description !== undefined) fields.description = description;
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, body: { fields: { ...fields, ...rest } } },
      };
    }

    case 'updateIssue': {
      const { issueKey: _issueKey, ...fieldsToUpdate } = input as Record<string, unknown>;
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, body: { fields: fieldsToUpdate } },
      };
    }

    case 'transitionIssue': {
      const { issueKey: _issueKey, transitionId, ...rest } = input as Record<string, unknown>;
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, body: { transition: { id: transitionId }, ...rest } },
      };
    }

    case 'addComment': {
      const { issueKey: _issueKey, body: commentBody, ...rest } = input as Record<string, unknown>;
      return {
        toolName: mapping.tool,
        input: { path: resolvedPath, body: { body: commentBody, ...rest } },
      };
    }

    default:
      return { toolName: mapping.tool, input: { path: resolvedPath, body: input } };
  }
}

function resolvePath(mapping: ComplexMapping, input: Record<string, unknown>): string {
  if (mapping.path) {
    return mapping.path;
  }

  if (!mapping.pathTemplate) {
    throw new Error('ComplexMapping must have either path or pathTemplate');
  }

  return mapping.pathTemplate.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = input[key];
    if (value === undefined || value === null) {
      throw new Error(
        `Missing required path parameter "${key}" for template "${mapping.pathTemplate}"`
      );
    }
    return String(value);
  });
}
