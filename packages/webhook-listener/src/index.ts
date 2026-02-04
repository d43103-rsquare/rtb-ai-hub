import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createLogger, QUEUE_NAMES, requireEnv } from '@rtb-ai-hub/shared';
import { createRoutes } from './routes';

const logger = createLogger('webhook-listener');
const app = express();
const port = process.env.WEBHOOK_PORT || 4000;

const redisConnection = new Redis({
  host: requireEnv('REDIS_HOST'),
  port: parseInt(requireEnv('REDIS_PORT')),
  maxRetriesPerRequest: null,
});

const figmaQueue = new Queue(QUEUE_NAMES.FIGMA, { connection: redisConnection });
const jiraQueue = new Queue(QUEUE_NAMES.JIRA, { connection: redisConnection });
const githubQueue = new Queue(QUEUE_NAMES.GITHUB, { connection: redisConnection });
const datadogQueue = new Queue(QUEUE_NAMES.DATADOG, { connection: redisConnection });

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger: logger as any }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'webhook-listener', timestamp: new Date().toISOString() });
});

app.use(createRoutes({ figmaQueue, jiraQueue, githubQueue, datadogQueue }));

app.listen(port, () => {
  logger.info(`Webhook listener running on port ${port}`);
});
