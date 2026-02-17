import type Redis from 'ioredis';
import { createLogger, queryRaw } from '@rtb-ai-hub/shared';

const logger = createLogger('chat-tools');

export const chatTools = [
  {
    name: 'list_previews',
    description: 'List all active preview environments with their URLs and status',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_preview',
    description: 'Get details of a specific preview environment by issue key',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'get_workflow_status',
    description: 'Get the status of recent workflow executions, optionally filtered by issue key',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey: {
          type: 'string',
          description: 'Optional Jira issue key to filter by',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 5)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_system_info',
    description:
      'Get current system status including active queues, connections, and feature flags',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_issue_context',
    description:
      'Get full cross-tool context for a Jira issue including Figma designs, GitHub PRs, preview environments, and deployment history',
    input_schema: {
      type: 'object' as const,
      properties: {
        jira_key: { type: 'string', description: 'Jira issue key (e.g., PROJ-123)' },
      },
      required: ['jira_key'],
    },
  },
  {
    name: 'search_decisions',
    description:
      '기술 의사결정 기록을 검색합니다. 태그, Jira 키, 또는 최근 기간으로 조회 가능합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '검색어 (태그, Jira 키, 키워드)',
        },
        days: {
          type: 'number',
          description: '최근 N일 이내 결정 조회 (기본: 30)',
        },
      },
      required: [] as string[],
    },
  },
];

export async function handleToolCall(
  toolName: string,
  input: Record<string, unknown>,
  redis: Redis
): Promise<Record<string, unknown>> {
  logger.info({ toolName, input }, 'Executing chat tool');

  try {
    switch (toolName) {
      case 'list_previews':
        return handleListPreviews(redis);

      case 'get_preview':
        return handleGetPreview(redis, input.issueKey as string);

      case 'get_workflow_status':
        return handleGetWorkflowStatus(
          input.issueKey as string | undefined,
          Number(input.limit) || 5
        );

      case 'get_system_info':
        return handleGetSystemInfo(redis);

      case 'get_issue_context':
        return handleGetIssueContext(input.jira_key as string);

      case 'search_decisions':
        return handleSearchDecisions(input.query as string | undefined, Number(input.days) || 30);

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ toolName, error: msg }, 'Tool execution failed');
    return { error: msg };
  }
}

async function handleListPreviews(redis: Redis): Promise<Record<string, unknown>> {
  const ids = await redis.smembers('preview:active-list');
  if (ids.length === 0) {
    return { previews: [], message: 'No active preview environments' };
  }

  const previews = [];
  for (const id of ids) {
    const raw = await redis.get(`preview:instance:${id}`);
    if (raw) {
      try {
        previews.push(JSON.parse(raw));
      } catch {
        /* skip corrupted entries */
      }
    }
  }

  return { previews, count: previews.length };
}

async function handleGetPreview(redis: Redis, issueKey: string): Promise<Record<string, unknown>> {
  const previewId = `prev_${issueKey}`;
  const raw = await redis.get(`preview:instance:${previewId}`);

  if (!raw) {
    return { error: `No preview found for ${issueKey}` };
  }

  try {
    return { preview: JSON.parse(raw) };
  } catch {
    return { error: 'Failed to parse preview data' };
  }
}

async function handleGetWorkflowStatus(
  issueKey?: string,
  limit = 5
): Promise<Record<string, unknown>> {
  // Return placeholder data — real implementation would query PostgreSQL
  // This is consistent with the project pattern where full DB integration is TODO
  return {
    message: issueKey
      ? `Workflow status for ${issueKey}: Query not yet wired to database`
      : `Recent workflow status: Query not yet wired to database`,
    note: 'Database query integration pending — see packages/workflow-engine/src/clients/database.ts',
    limit,
  };
}

async function handleGetSystemInfo(redis: Redis): Promise<Record<string, unknown>> {
  const info: Record<string, unknown> = {
    service: 'RTB AI Hub',
    timestamp: new Date().toISOString(),
    features: {
      debateEngine: process.env.DEBATE_ENABLED !== 'false',
      claudeCode: process.env.CLAUDE_CODE_ENABLED !== 'false',
      worktree: process.env.WORKTREE_ENABLED === 'true',
      preview: process.env.PREVIEW_ENABLED === 'true',
      localPolling: process.env.LOCAL_POLLING_ENABLED === 'true' || process.env.DEV_MODE === 'true',
    },
  };

  try {
    const pong = await redis.ping();
    info.redis = { connected: pong === 'PONG' };
  } catch {
    info.redis = { connected: false };
  }

  return info;
}

async function handleGetIssueContext(jiraKey: string): Promise<Record<string, unknown>> {
  try {
    const rows = await queryRaw('SELECT * FROM context_links WHERE jira_key = $1 LIMIT 1', [
      jiraKey,
    ]);

    if (rows.length === 0) {
      return { error: `No context found for ${jiraKey}` };
    }

    return { context: rows[0] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: msg, jiraKey }, 'Failed to fetch issue context');
    return { error: `Failed to fetch context: ${msg}` };
  }
}

async function handleSearchDecisions(query?: string, days = 30): Promise<Record<string, unknown>> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let sql = 'SELECT * FROM decision_journal WHERE created_at >= $1';
    const params: unknown[] = [since.toISOString()];

    if (query) {
      const jiraKeyMatch = query.match(/[A-Z][A-Z0-9]+-\d+/);
      if (jiraKeyMatch) {
        sql += ' AND $2 = ANY(related_jira_keys)';
        params.push(jiraKeyMatch[0]);
      } else {
        sql += ' AND ($2 = ANY(tags) OR title ILIKE $3)';
        params.push(query.toLowerCase());
        params.push(`%${query}%`);
      }
    }

    sql += ' ORDER BY created_at DESC LIMIT 10';

    const rows = await queryRaw(sql, params);

    if (rows.length === 0) {
      return {
        decisions: [],
        message: query
          ? `"${query}"에 대한 의사결정 기록이 없습니다.`
          : `최근 ${days}일 이내 의사결정 기록이 없습니다.`,
      };
    }

    return { decisions: rows, count: rows.length };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: msg, query }, 'Failed to search decisions');
    return { error: `Failed to search decisions: ${msg}` };
  }
}
