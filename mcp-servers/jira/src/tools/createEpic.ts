import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const createEpicTool = {
  name: 'createEpic',
  description: 'Create a Jira Epic',
  schema: {
    projectKey: z.string().describe('Project key (e.g., PROJ)'),
    summary: z.string().describe('Epic summary'),
    description: z.string().optional().describe('Epic description'),
  },
  handler: async ({
    projectKey,
    summary,
    description,
  }: {
    projectKey: string;
    summary: string;
    description?: string;
  }) => {
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      issuetype: { name: 'Epic' },
      summary,
    };

    if (description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      };
    }

    const result = await jiraRequest<{ id: string; key: string; self: string }>('/issue', 'POST', {
      fields,
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
