import http from 'http';
import { createLogger } from '@rtb-ai-hub/shared';
import { runE2ETests } from '../utils/e2e-runner';
import { database } from '../clients/database';
import { handleHubApiRequest, getHubApiRoutes } from './hub-api';

const logger = createLogger('internal-api');

export async function handleInternalRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  if (req.method === 'POST' && req.url === '/trigger-e2e') {
    await handleE2ETrigger(req, res);
    return true;
  }

  // Delegate to hub-api for /api/* routes (knowledge, infra, etc.)
  const handled = await handleHubApiRequest(req, res);
  if (handled) return true;

  return false;
}

export async function getInternalRoutes(): Promise<string[]> {
  const hubRoutes = getHubApiRoutes();
  return ['POST /trigger-e2e', ...hubRoutes];
}

async function handleE2ETrigger(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { branchName, workflowId, jiraKey } = JSON.parse(body);

    if (!branchName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'branchName is required' }));
      return;
    }

    logger.info({ branchName, workflowId, jiraKey }, 'Running E2E tests');

    const e2eResult = await runE2ETests(branchName);

    if (workflowId) {
      await database.query('UPDATE workflow_executions SET e2e_test_result = $1 WHERE id = $2', [
        JSON.stringify(e2eResult),
        workflowId,
      ]);

      logger.info(
        {
          workflowId,
          success: e2eResult.success,
          passedTests: e2eResult.passedTests,
          failedTests: e2eResult.failedTests,
        },
        'E2E test results saved to DB'
      );
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, result: e2eResult }));
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to run E2E tests'
    );

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}
