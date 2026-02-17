import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { pinoHttp } from 'pino-http';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createLogger, QUEUE_NAMES, requireEnv, FEATURE_FLAGS } from '@rtb-ai-hub/shared';
import { createRoutes } from './routes';
import { healthRateLimit, webhookRateLimit } from './middleware/rate-limit';

const WORKFLOW_ENGINE_DIR = path.resolve(__dirname, '../../workflow-engine/dist');

function loadWorkflowModule(modulePath: string): any {
  return require(path.join(WORKFLOW_ENGINE_DIR, modulePath));
}

const logger = createLogger('rtb-hub');
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: [
      `http://localhost:${process.env.DASHBOARD_PORT || '3000'}`,
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

app.get('/health', healthRateLimit, async (_req, res) => {
  let internalRoutes: string[] = [];
  try {
    const { getInternalRoutes } = loadWorkflowModule('internal-api');
    internalRoutes = await getInternalRoutes();
  } catch {
    // workflow-engine unavailable
  }

  res.json({
    status: 'ok',
    service: 'rtb-hub',
    timestamp: new Date().toISOString(),
    components: {
      webhookListener: true,
      workflowEngine: !!process.env.ENABLE_WORKFLOW_ENGINE,
      dashboard: !!process.env.ENABLE_DASHBOARD,
    },
    internalRoutes,
  });
});

app.use(
  webhookRateLimit,
  createRoutes({ figmaQueue, jiraQueue, githubQueue, datadogQueue, redis: redisConnection })
);

async function mountWorkflowEngineApi() {
  try {
    const { handleInternalRequest } = loadWorkflowModule('internal-api');

    const internalApiHandler: express.RequestHandler = async (req, res, next) => {
      const handled = await handleInternalRequest(req, res);
      if (!handled) next();
    };

    app.use('/api/knowledge', internalApiHandler);
    app.use('/api/infra', internalApiHandler);
    app.post('/trigger-e2e', internalApiHandler);

    logger.info('Workflow engine internal API mounted');
  } catch (error) {
    logger.warn({ error }, 'Workflow engine internal API not available');
  }
}

function mountDashboard() {
  const dashboardDir =
    process.env.DASHBOARD_STATIC_DIR || path.resolve(__dirname, '../../dashboard/dist');

  if (!fs.existsSync(path.join(dashboardDir, 'index.html'))) {
    logger.warn({ dashboardDir }, 'Dashboard build not found — static serving disabled');
    return;
  }

  app.use(express.static(dashboardDir));

  app.get('*', (_req, res, next) => {
    const p = _req.path;
    if (p.startsWith('/api/') || p.startsWith('/webhooks/') || p === '/health' || p === '/ws') {
      return next();
    }
    res.sendFile(path.join(dashboardDir, 'index.html'));
  });

  logger.info({ dashboardDir }, 'Dashboard static serving enabled');
}

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

async function startWorkflowEngine(): Promise<any> {
  try {
    const { getRepoManager } = loadWorkflowModule('utils/repo-manager');
    const { createWorkers } = loadWorkflowModule('queue');
    const { startBranchPoller } = loadWorkflowModule('utils/branch-poller');

    logger.info('Initializing repositories...');
    const repoManager = getRepoManager();
    await repoManager.initialize();

    logger.info('Starting workflow engine workers...');
    const workers = createWorkers();

    if (FEATURE_FLAGS.LOCAL_POLLING_ENABLED) {
      logger.info('Starting branch poller...');
      startBranchPoller();
    }

    logger.info('Workflow engine workers started');
    return workers;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Workflow engine not available — webhook-only mode'
    );
    return null;
  }
}

async function main() {
  const enableWorkflow = process.env.ENABLE_WORKFLOW_ENGINE !== 'false';
  const enableDashboard = process.env.ENABLE_DASHBOARD !== 'false';

  let workers: any = null;

  if (enableWorkflow) {
    await mountWorkflowEngineApi();
    workers = await startWorkflowEngine();
  }

  if (enableDashboard) {
    mountDashboard();
  }

  server.listen(port, () => {
    logger.info({ port, enableWorkflow, enableDashboard }, 'RTB AI Hub started');
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');

    if (workers) {
      try {
        const { stopBranchPoller } = loadWorkflowModule('utils/branch-poller');
        await Promise.all([
          workers.figmaWorker?.close(),
          workers.jiraWorker?.close(),
          workers.githubWorker?.close(),
          workers.datadogWorker?.close(),
          stopBranchPoller(),
        ]);
      } catch {
        // cleanup best-effort
      }
    }

    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Startup failed');
  process.exit(1);
});
