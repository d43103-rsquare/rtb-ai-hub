import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const searchIssuesTool = {
  name: 'searchIssues',
  description: 'Search Jira issues using JQL',
  schema: {
    jql: z.string().describe('JQL query string'),
    maxResults: z.number().optional().describe('Maximum results to return (default 50)'),
    startAt: z.number().optional().describe('Start index for pagination'),
    fields: z.array(z.string()).optional().describe('Fields to return'),
  },
  handler: async ({
    jql,
    maxResults,
    startAt,
    fields,
  }: {
    jql: string;
    maxResults?: number;
    startAt?: number;
    fields?: string[];
  }) => {
    const result = await jiraRequest<{
      total: number;
      startAt: number;
      maxResults: number;
      issues: Array<{ key: string; fields: Record<string, unknown> }>;
    }>('/search', 'POST', {
      jql,
      maxResults: maxResults ?? 50,
      startAt: startAt ?? 0,
      fields: fields ?? ['summary', 'status', 'assignee', 'priority', 'issuetype'],
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            total: result.total,
            startAt: result.startAt,
            maxResults: result.maxResults,
            issues: result.issues,
          }),
        },
      ],
    };
  },
};
