import Redis from 'ioredis';
import { requireEnv } from '@rtb-ai-hub/shared';

export function createRedisConnection() {
  return new Redis({
    host: requireEnv('REDIS_HOST'),
    port: parseInt(requireEnv('REDIS_PORT')),
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });
}
