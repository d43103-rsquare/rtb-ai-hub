import { z } from 'zod';
import { figmaRequest } from '../client.js';

export const getFileVariablesTool = {
  name: 'getFileVariables',
  description: 'Get variables in a Figma file',
  schema: {
    fileKey: z.string().describe('Figma file key'),
  },
  handler: async ({ fileKey }: { fileKey: string }) => {
    const result = await figmaRequest(`/files/${fileKey}/variables/local`);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
