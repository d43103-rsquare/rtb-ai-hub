import type { RTBWorkflowClient } from '../client.js';

export const getWorkflowStatusSchema = {
  name: 'get_workflow_status',
  description: 'Check the status of a running workflow execution',
  inputSchema: {
    type: 'object',
    properties: {
      executionId: {
        type: 'string',
        description: 'Workflow execution ID returned from trigger_* tools',
      },
    },
    required: ['executionId'],
  },
};

export async function getWorkflowStatus(client: RTBWorkflowClient, args: { executionId: string }) {
  const result = await client.getWorkflowStatus(args.executionId);

  return {
    executionId: args.executionId,
    status: result.status,
    result: result.result,
    error: result.error,
  };
}
