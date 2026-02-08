import { z } from 'zod';
import { datadogRequest } from '../client.js';

export const getAlertsTool = {
  name: 'getAlerts',
  description: 'Get currently triggered alerts from Datadog',
  schema: {},
  handler: async () => {
    const result = await datadogRequest('/monitor?monitor_tags=*&with_downtimes=true');

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  },
};
