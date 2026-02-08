import { z } from 'zod';
import { figmaRequest } from '../client.js';

export const getFileTool = {
  name: 'getFile',
  description: 'Get a Figma file by key',
  schema: {
    fileKey: z.string().describe('Figma file key'),
    version: z.string().optional().describe('File version ID'),
    depth: z.number().optional().describe('Depth of node tree to return'),
  },
  handler: async ({
    fileKey,
    version,
    depth,
  }: {
    fileKey: string;
    version?: string;
    depth?: number;
  }) => {
    const params = new URLSearchParams();
    if (version) params.set('version', version);
    if (depth !== undefined) params.set('depth', String(depth));

    const query = params.toString();
    const result = await figmaRequest(`/files/${fileKey}${query ? `?${query}` : ''}`);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
