import { z } from 'zod';
import { datadogRequest } from '../client.js';

export const getLogsTool = {
  name: 'getLogs',
  description: 'Search logs in Datadog',
  schema: {
    query: z.string().describe('Log search query'),
    from: z.string().describe('Start time (ISO 8601 format)'),
    to: z.string().describe('End time (ISO 8601 format)'),
    limit: z.number().optional().describe('Maximum number of logs to return (default 50)'),
    sort: z.enum(['timestamp', '-timestamp']).optional().describe('Sort order'),
  },
  handler: async ({
    query,
    from,
    to,
    limit,
    sort,
  }: {
    query: string;
    from: string;
    to: string;
    limit?: number;
    sort?: 'timestamp' | '-timestamp';
  }) => {
    const result = await datadogRequest(
      '/logs/events/search',
      'POST',
      {
        filter: {
          query,
          from,
          to,
        },
        page: { limit: limit ?? 50 },
        sort: sort ?? '-timestamp',
      },
      'v2'
    );

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
