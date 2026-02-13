import { createLogger, FEATURE_FLAGS } from '@rtb-ai-hub/shared';
import { createWorkers } from './queue';
import { getRepoManager } from './utils/repo-manager';
import { startBranchPoller, stopBranchPoller } from './utils/branch-poller';
import { handleInternalRequest, getInternalRoutes } from './internal-api';
import http from 'http';

const logger = createLogger('workflow-engine');

const HEALTH_PORT = Number(process.env.WORKFLOW_ENGINE_HEALTH_PORT) || 3001;

const healthServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    const routes = await getInternalRoutes();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'workflow-engine',
        timestamp: new Date().toISOString(),
        internalRoutes: routes,
      })
    );
    return;
  }

  const handled = await handleInternalRequest(req, res);
  if (!handled) {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(HEALTH_PORT, () => {
  logger.info({ port: HEALTH_PORT }, 'Workflow engine health endpoint running');
});

async function startup() {
  logger.info('Initializing repositories...');
  const repoManager = getRepoManager();
  await repoManager.initialize();

  logger.info('Starting workflow engine workers...');
  const workers = createWorkers();

  if (FEATURE_FLAGS.LOCAL_POLLING_ENABLED) {
    logger.info('Starting branch poller...');
    startBranchPoller();
  }

  logger.info('Workflow engine workers started successfully');

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing workers...');
    await Promise.all([
      workers.figmaWorker.close(),
      workers.jiraWorker.close(),
      workers.githubWorker.close(),
      workers.datadogWorker.close(),
      stopBranchPoller(),
    ]);
    process.exit(0);
  });
}

startup().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Startup failed');
  process.exit(1);
});
