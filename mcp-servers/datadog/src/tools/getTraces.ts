import { z } from 'zod';
import { datadogRequest } from '../client.js';

export const getTracesTool = {
  name: 'getTraces',
  description: 'Search APM traces in Datadog',
  schema: {
    query: z.string().describe('Trace search query'),
    from: z.string().describe('Start time (ISO 8601 format)'),
    to: z.string().describe('End time (ISO 8601 format)'),
    limit: z.number().optional().describe('Maximum number of traces to return (default 50)'),
  },
  handler: async ({
    query,
    from,
    to,
    limit,
  }: {
    query: string;
    from: string;
    to: string;
    limit?: number;
  }) => {
    const result = await datadogRequest(
      '/spans/events/search',
      'POST',
      {
        filter: {
          query,
          from,
          to,
        },
        page: { limit: limit ?? 50 },
        sort: '-timestamp',
      },
      'v2'
    );

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
