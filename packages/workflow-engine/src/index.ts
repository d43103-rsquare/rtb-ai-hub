import { createLogger } from '@rtb-ai-hub/shared';
import { createWorkers } from './queue';
import http from 'http';

const logger = createLogger('workflow-engine');

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'workflow-engine',
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(3001, () => {
  logger.info('Workflow engine health endpoint running on port 3001');
});

logger.info('Starting workflow engine workers...');
const workers = createWorkers();

logger.info('Workflow engine workers started successfully');

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workers...');
  await Promise.all([
    workers.figmaWorker.close(),
    workers.jiraWorker.close(),
    workers.githubWorker.close(),
    workers.datadogWorker.close(),
  ]);
  process.exit(0);
});
