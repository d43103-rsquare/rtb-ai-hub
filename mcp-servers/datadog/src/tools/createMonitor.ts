import { z } from 'zod';
import { datadogRequest } from '../client.js';

export const createMonitorTool = {
  name: 'createMonitor',
  description: 'Create a Datadog monitor',
  schema: {
    name: z.string().describe('Monitor name'),
    type: z.string().describe('Monitor type (e.g., metric alert, service check)'),
    query: z.string().describe('Monitor query'),
    message: z.string().describe('Notification message'),
    tags: z.array(z.string()).optional().describe('Tags for the monitor'),
    priority: z.number().optional().describe('Monitor priority (1-5)'),
  },
  handler: async ({
    name,
    type,
    query,
    message,
    tags,
    priority,
  }: {
    name: string;
    type: string;
    query: string;
    message: string;
    tags?: string[];
    priority?: number;
  }) => {
    const body: Record<string, unknown> = {
      name,
      type,
      query,
      message,
    };
    if (tags) body.tags = tags;
    if (priority) body.priority = priority;

    const result = await datadogRequest('/monitor', 'POST', body);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
