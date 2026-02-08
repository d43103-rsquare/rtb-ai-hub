import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const updateIssueTool = {
  name: 'updateIssue',
  description: 'Update fields on a Jira issue',
  schema: {
    issueKey: z.string().describe('Issue key (e.g., PROJ-123)'),
    fields: z
      .object({
        summary: z.string().optional().describe('New summary'),
        description: z.string().optional().describe('New description'),
        priority: z.string().optional().describe('New priority name'),
        labels: z.array(z.string()).optional().describe('New labels'),
      })
      .describe('Fields to update'),
  },
  handler: async ({
    issueKey,
    fields,
  }: {
    issueKey: string;
    fields: { summary?: string; description?: string; priority?: string; labels?: string[] };
  }) => {
    const updateFields: Record<string, unknown> = {};

    if (fields.summary) updateFields.summary = fields.summary;
    if (fields.description) {
      updateFields.description = {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: fields.description }] }],
      };
    }
    if (fields.priority) updateFields.priority = { name: fields.priority };
    if (fields.labels) updateFields.labels = fields.labels;

    await jiraRequest(`/issue/${issueKey}`, 'PUT', { fields: updateFields });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ issueKey, updated: true }) }],
    };
  },
};
