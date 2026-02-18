import { Router } from 'express';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';
import { internalAuth } from '../middleware/internal-auth';

const logger = createLogger('infra-api');

const VALID_BRANCH_TYPES = ['feature', 'bugfix', 'hotfix'] as const;
const VALID_ENVS = ['int', 'stg', 'prd'] as const;

type BranchType = (typeof VALID_BRANCH_TYPES)[number];
type Env = (typeof VALID_ENVS)[number];

function getWorkflowEngineUrl(): string {
  return getEnv('WORKFLOW_ENGINE_URL', 'http://localhost:3001');
}

async function proxyToWorkflowEngine(
  path: string,
  body: Record<string, unknown>,
  authHeader?: string
): Promise<{ status: number; data: unknown }> {
  const url = `${getWorkflowEngineUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ url, error: msg }, 'Workflow engine proxy failed');
    return { status: 502, data: { error: `Workflow engine unreachable: ${msg}` } };
  }
}

function isValidBranchType(value: string): value is BranchType {
  return VALID_BRANCH_TYPES.includes(value as BranchType);
}

function isValidEnv(value: string): value is Env {
  return VALID_ENVS.includes(value as Env);
}

export function createInfraRouter(): Router {
  const router = Router();

  router.post('/api/infra/git/branch', internalAuth, async (req, res) => {
    try {
      const { jiraKey, type, description, env } = req.body;

      if (!jiraKey || typeof jiraKey !== 'string') {
        res.status(400).json({ error: 'jiraKey string is required' });
        return;
      }
      if (!type || !isValidBranchType(type)) {
        res.status(400).json({ error: `type must be one of: ${VALID_BRANCH_TYPES.join(', ')}` });
        return;
      }
      if (!description || typeof description !== 'string') {
        res.status(400).json({ error: 'description string is required' });
        return;
      }
      if (!env || !isValidEnv(env)) {
        res.status(400).json({ error: `env must be one of: ${VALID_ENVS.join(', ')}` });
        return;
      }

      const result = await proxyToWorkflowEngine(
        '/api/infra/git/branch',
        { jiraKey, type, description, env },
        req.headers.authorization
      );
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Git branch failed'
      );
      res.status(500).json({ error: 'Git branch creation failed' });
    }
  });

  router.post('/api/infra/git/commit-push', internalAuth, async (req, res) => {
    try {
      const { branchName, files, message } = req.body;

      if (!branchName || typeof branchName !== 'string') {
        res.status(400).json({ error: 'branchName string is required' });
        return;
      }
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'files array is required and must not be empty' });
        return;
      }
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message string is required' });
        return;
      }

      const result = await proxyToWorkflowEngine(
        '/api/infra/git/commit-push',
        { branchName, files, message },
        req.headers.authorization
      );
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Git commit-push failed'
      );
      res.status(500).json({ error: 'Git commit-push failed' });
    }
  });

  router.post('/api/infra/ci/run', internalAuth, async (req, res) => {
    try {
      const { branchName } = req.body;

      if (!branchName || typeof branchName !== 'string') {
        res.status(400).json({ error: 'branchName string is required' });
        return;
      }

      const result = await proxyToWorkflowEngine(
        '/api/infra/ci/run',
        { branchName },
        req.headers.authorization
      );
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'CI run failed'
      );
      res.status(500).json({ error: 'CI run failed' });
    }
  });

  router.post('/api/infra/deploy/preview', internalAuth, async (req, res) => {
    try {
      const { branchName, jiraKey, env } = req.body;

      if (!branchName || typeof branchName !== 'string') {
        res.status(400).json({ error: 'branchName string is required' });
        return;
      }
      if (!jiraKey || typeof jiraKey !== 'string') {
        res.status(400).json({ error: 'jiraKey string is required' });
        return;
      }
      if (env && !isValidEnv(env)) {
        res.status(400).json({ error: `env must be one of: ${VALID_ENVS.join(', ')}` });
        return;
      }

      const result = await proxyToWorkflowEngine(
        '/api/infra/deploy/preview',
        { branchName, jiraKey, env: env || 'int' },
        req.headers.authorization
      );
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Preview deploy failed'
      );
      res.status(500).json({ error: 'Preview deploy failed' });
    }
  });

  router.post('/api/infra/pr/create', internalAuth, async (req, res) => {
    try {
      const { branchName, title, body, base } = req.body;

      if (!branchName || typeof branchName !== 'string') {
        res.status(400).json({ error: 'branchName string is required' });
        return;
      }
      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'title string is required' });
        return;
      }
      if (body !== undefined && typeof body !== 'string') {
        res.status(400).json({ error: 'body must be a string' });
        return;
      }

      const result = await proxyToWorkflowEngine(
        '/api/infra/pr/create',
        { branchName, title, body: body || '', base: base || 'develop' },
        req.headers.authorization
      );
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'PR creation failed'
      );
      res.status(500).json({ error: 'PR creation failed' });
    }
  });

  return router;
}
