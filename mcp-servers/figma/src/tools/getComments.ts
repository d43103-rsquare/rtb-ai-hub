import { z } from 'zod';
import { figmaRequest } from '../client.js';

export const getCommentsTool = {
  name: 'getComments',
  description: 'Get comments on a Figma file',
  schema: {
    fileKey: z.string().describe('Figma file key'),
  },
  handler: async ({ fileKey }: { fileKey: string }) => {
    const result = await figmaRequest(`/files/${fileKey}/comments`);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
