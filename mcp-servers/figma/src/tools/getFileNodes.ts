import { z } from 'zod';
import { figmaRequest } from '../client.js';

export const getFileNodesTool = {
  name: 'getFileNodes',
  description: 'Get specific nodes from a Figma file',
  schema: {
    fileKey: z.string().describe('Figma file key'),
    nodeIds: z.array(z.string()).describe('Node IDs to retrieve'),
  },
  handler: async ({ fileKey, nodeIds }: { fileKey: string; nodeIds: string[] }) => {
    const ids = nodeIds.join(',');
    const result = await figmaRequest(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
