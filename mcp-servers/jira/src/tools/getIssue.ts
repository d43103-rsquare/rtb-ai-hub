import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const getIssueTool = {
  name: 'getIssue',
  description: 'Get details of a Jira issue',
  schema: {
    issueKey: z.string().describe('Issue key (e.g., PROJ-123)'),
    fields: z.array(z.string()).optional().describe('Specific fields to return'),
    expand: z.string().optional().describe('Expand options (e.g., changelog, renderedFields)'),
  },
  handler: async ({
    issueKey,
    fields,
    expand,
  }: {
    issueKey: string;
    fields?: string[];
    expand?: string;
  }) => {
    const params = new URLSearchParams();
    if (fields) params.set('fields', fields.join(','));
    if (expand) params.set('expand', expand);

    const query = params.toString();
    const path = `/issue/${issueKey}${query ? `?${query}` : ''}`;

    const result = await jiraRequest<Record<string, unknown>>(path);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
