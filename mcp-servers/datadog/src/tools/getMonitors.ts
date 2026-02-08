import { z } from 'zod';
import { datadogRequest } from '../client.js';

export const getMonitorsTool = {
  name: 'getMonitors',
  description: 'List Datadog monitors',
  schema: {
    name: z.string().optional().describe('Filter by monitor name'),
    tags: z.string().optional().describe('Comma-separated list of tags to filter by'),
    monitorType: z
      .string()
      .optional()
      .describe('Filter by monitor type (e.g., metric, service check)'),
  },
  handler: async ({
    name,
    tags,
    monitorType,
  }: {
    name?: string;
    tags?: string;
    monitorType?: string;
  }) => {
    const params = new URLSearchParams();
    if (name) params.set('name', name);
    if (tags) params.set('monitor_tags', tags);
    if (monitorType) params.set('type', monitorType);

    const query = params.toString();
    const result = await datadogRequest(`/monitor${query ? `?${query}` : ''}`);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
