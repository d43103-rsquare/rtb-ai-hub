import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const createSubtaskTool = {
  name: 'createSubtask',
  description: 'Create a sub-task under a parent issue',
  schema: {
    parentKey: z.string().describe('Parent issue key (e.g., PROJ-123)'),
    summary: z.string().describe('Sub-task summary'),
    description: z.string().optional().describe('Sub-task description'),
  },
  handler: async ({
    parentKey,
    summary,
    description,
  }: {
    parentKey: string;
    summary: string;
    description?: string;
  }) => {
    const projectKey = parentKey.split('-')[0];
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      parent: { key: parentKey },
      issuetype: { name: 'Sub-task' },
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
