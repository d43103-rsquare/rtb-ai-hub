import type { RTBWorkflowClient } from '../client.js';

export const triggerJiraWorkflowSchema = {
  name: 'trigger_jira_workflow',
  description:
    'Trigger automated development workflow for a Jira issue. Analyzes requirements, generates code, creates GitHub PR with implementation.',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: {
        type: 'string',
        description: 'Jira issue key (e.g., PROJ-123)',
      },
      env: {
        type: 'string',
        enum: ['int', 'stg', 'prd'],
        description: 'Target environment (default: int)',
      },
    },
    required: ['issueKey'],
  },
};

export async function triggerJiraWorkflow(
  client: RTBWorkflowClient,
  args: { issueKey: string; env?: 'int' | 'stg' | 'prd' }
) {
  const result = await client.triggerWorkflow({
    type: 'jira-auto-dev',
    event: {
      issue: {
        key: args.issueKey,
      },
    },
    env: args.env || 'int',
  });

  return {
    executionId: result.executionId,
    status: result.status,
    message: `Workflow triggered for ${args.issueKey}`,
    details: result,
  };
}
