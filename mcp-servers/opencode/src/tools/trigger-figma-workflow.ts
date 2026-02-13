import type { RTBWorkflowClient } from '../client.js';

export const triggerFigmaWorkflowSchema = {
  name: 'trigger_figma_workflow',
  description:
    'Convert Figma design to Jira tasks. Analyzes components, generates technical specs, creates Epic with subtasks in Jira.',
  inputSchema: {
    type: 'object',
    properties: {
      fileKey: {
        type: 'string',
        description: 'Figma file key',
      },
      fileName: {
        type: 'string',
        description: 'Figma file name',
      },
      env: {
        type: 'string',
        enum: ['int', 'stg', 'prd'],
        description: 'Target environment (default: int)',
      },
    },
    required: ['fileKey'],
  },
};

export async function triggerFigmaWorkflow(
  client: RTBWorkflowClient,
  args: { fileKey: string; fileName?: string; env?: 'int' | 'stg' | 'prd' }
) {
  const result = await client.triggerWorkflow({
    type: 'figma-to-jira',
    event: {
      file_key: args.fileKey,
      file_name: args.fileName || 'Figma Design',
      event_type: 'FILE_UPDATE',
    },
    env: args.env || 'int',
  });

  return {
    executionId: result.executionId,
    status: result.status,
    message: `Figma → Jira workflow triggered for file ${args.fileKey}`,
    details: result,
  };
}
