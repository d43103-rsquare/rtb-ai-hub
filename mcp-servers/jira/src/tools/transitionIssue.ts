import { z } from 'zod';
import { jiraRequest } from '../client.js';

export const transitionIssueTool = {
  name: 'transitionIssue',
  description: 'Change the status of a Jira issue via transition',
  schema: {
    issueKey: z.string().describe('Issue key (e.g., PROJ-123)'),
    transitionId: z.string().optional().describe('Transition ID'),
    transitionName: z
      .string()
      .optional()
      .describe('Transition name (used if transitionId not provided)'),
  },
  handler: async ({
    issueKey,
    transitionId,
    transitionName,
  }: {
    issueKey: string;
    transitionId?: string;
    transitionName?: string;
  }) => {
    let resolvedId = transitionId;

    if (!resolvedId && transitionName) {
      const { transitions } = await jiraRequest<{
        transitions: Array<{ id: string; name: string }>;
      }>(`/issue/${issueKey}/transitions`);

      const match = transitions.find((t) => t.name.toLowerCase() === transitionName.toLowerCase());
      if (!match) {
        const available = transitions.map((t) => t.name).join(', ');
        throw new Error(`Transition "${transitionName}" not found. Available: ${available}`);
      }
      resolvedId = match.id;
    }

    if (!resolvedId) {
      throw new Error('Either transitionId or transitionName is required');
    }

    await jiraRequest(`/issue/${issueKey}/transitions`, 'POST', {
      transition: { id: resolvedId },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ issueKey, transitioned: true, transitionId: resolvedId }),
        },
      ],
    };
  },
};
