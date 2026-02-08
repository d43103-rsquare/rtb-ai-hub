import { z } from 'zod';
import { datadogRequest } from '../client.js';

export const queryMetricsTool = {
  name: 'queryMetrics',
  description: 'Query time-series metrics from Datadog',
  schema: {
    query: z.string().describe('Metrics query string (e.g., avg:system.cpu.user{*})'),
    from: z.number().describe('Start time as UNIX epoch seconds'),
    to: z.number().describe('End time as UNIX epoch seconds'),
  },
  handler: async ({ query, from, to }: { query: string; from: number; to: number }) => {
    const params = new URLSearchParams({
      query,
      from: String(from),
      to: String(to),
    });

    const result = await datadogRequest(`/query?${params.toString()}`);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
