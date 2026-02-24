import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createLogger } from '@rtb-ai-hub/shared';
import { createRoutes } from './routes';
import { healthRateLimit, webhookRateLimit } from './middleware/rate-limit';
import { getQueueClient, stopQueueClient } from './queue-client';

const logger = createLogger('webhook-listener');
const app = express();
const port = process.env.WEBHOOK_PORT || 4000;
const server = createServer(app);

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
  createRoutes()
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

async function main() {
  await getQueueClient();
  logger.info('pg-boss queue client initialized');

  server.listen(port, () => {
    logger.info(`Webhook listener running on port ${port} with WebSocket support`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await stopQueueClient();
    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Startup failed');
  process.exit(1);
});
