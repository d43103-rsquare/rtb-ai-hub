import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const addCommentTool = {
  name: 'addComment',
  description: 'Add a comment to a Jira issue',
  schema: {
    issueKey: z.string().describe('Issue key (e.g., PROJ-123)'),
    body: z.string().describe('Comment body text'),
  },
  handler: async ({ issueKey, body }: { issueKey: string; body: string }) => {
    const result = await jiraRequest<{ id: string; self: string }>(
      `/issue/${issueKey}/comment`,
      'POST',
      {
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
        },
      }
    );

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
