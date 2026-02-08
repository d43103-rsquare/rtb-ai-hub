import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const createIssueTool = {
  name: 'createIssue',
  description: 'Create a Jira issue',
  schema: {
    projectKey: z.string().describe('Project key (e.g., PROJ)'),
    issueType: z.string().describe('Issue type (e.g., Task, Bug, Story)'),
    summary: z.string().describe('Issue summary'),
    description: z.string().optional().describe('Issue description'),
    priority: z.string().optional().describe('Priority name (e.g., High, Medium, Low)'),
    labels: z.array(z.string()).optional().describe('Labels'),
    assignee: z.string().optional().describe('Assignee account ID'),
  },
  handler: async ({
    projectKey,
    issueType,
    summary,
    description,
    priority,
    labels,
    assignee,
  }: {
    projectKey: string;
    issueType: string;
    summary: string;
    description?: string;
    priority?: string;
    labels?: string[];
    assignee?: string;
  }) => {
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      issuetype: { name: issueType },
      summary,
    };

    if (description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      };
    }
    if (priority) fields.priority = { name: priority };
    if (labels) fields.labels = labels;
    if (assignee) fields.assignee = { accountId: assignee };

    const result = await jiraRequest<{ id: string; key: string; self: string }>('/issue', 'POST', {
      fields,
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
