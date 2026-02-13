import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createLogger, QUEUE_NAMES, requireEnv } from '@rtb-ai-hub/shared';
import { createRoutes } from './routes';
import { healthRateLimit, webhookRateLimit } from './middleware/rate-limit';

const logger = createLogger('webhook-listener');
const app = express();
const port = process.env.WEBHOOK_PORT || 4000;
const server = createServer(app);

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
app.use(
  cors({
    origin: [
      `http://localhost:${process.env.DASHBOARD_PORT || '6000'}`,
      'http://localhost:4001',
      'http://localhost:3000',
    ],
    credentials: true,
  })
);
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(pinoHttp({ logger: logger as any }));

app.get('/health', healthRateLimit, (req, res) => {
  res.json({ status: 'ok', service: 'webhook-listener', timestamp: new Date().toISOString() });
});

app.use(
  webhookRateLimit,
  createRoutes({ figmaQueue, jiraQueue, githubQueue, datadogQueue, redis: redisConnection })
);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.debug({ data }, 'Received WebSocket message');

      if (data.type === 'subscribe') {
        ws.send(JSON.stringify({ type: 'subscribed', message: 'Connected to workflow updates' }));
      }
    } catch (error) {
      logger.error({ error }, 'Failed to parse WebSocket message');
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    logger.error({ error }, 'WebSocket error');
  });
});

server.listen(port, () => {
  logger.info(`Webhook listener running on port ${port} with WebSocket support`);
});
