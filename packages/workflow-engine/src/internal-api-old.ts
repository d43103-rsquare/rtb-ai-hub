import http from 'http';
import { createLogger, getEnv, FEATURE_FLAGS, type Environment } from '@rtb-ai-hub/shared';
import {
  createLocalBranch,
  generateBranchName,
  resolveBaseBranch,
  writeAndCommit,
  pushBranch,
  type BranchType,
  type FileToWrite,
} from './utils/local-git-ops';
import { runTargetCi } from './utils/target-ci';
import { createGitHubPullRequest, getGitHubRepo } from './clients/mcp-helper';

const logger = createLogger('internal-api');

// ─── Types ──────────────────────────────────────────────────────────────────

type RouteHandler = (body: Record<string, unknown>) => Promise<{ status: number; data: unknown }>;

type Routes = Record<string, RouteHandler>;

// ─── JSON Body Parser ───────────────────────────────────────────────────────

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw) {
          resolve({});
          return;
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(new Error('Request body must be a JSON object'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWorkDir(): string {
  return getEnv('WORK_REPO_LOCAL_PATH', '');
}

const VALID_BRANCH_TYPES = ['feature', 'bugfix', 'hotfix'] as const;
const VALID_ENVS = ['int', 'stg', 'prd'] as const;

function isValidBranchType(value: unknown): value is BranchType {
  return typeof value === 'string' && VALID_BRANCH_TYPES.includes(value as BranchType);
}

function isValidEnv(value: unknown): value is Environment {
  return typeof value === 'string' && VALID_ENVS.includes(value as Environment);
}

function errorResponse(status: number, message: string): { status: number; data: unknown } {
  return { status, data: { error: message } };
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

async function handleGitBranch(
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const { jiraKey, type, description, env } = body;

  if (!jiraKey || typeof jiraKey !== 'string') {
    return errorResponse(400, 'jiraKey string is required');
  }
  if (!isValidBranchType(type)) {
    return errorResponse(400, `type must be one of: ${VALID_BRANCH_TYPES.join(', ')}`);
  }
  if (!description || typeof description !== 'string') {
    return errorResponse(400, 'description string is required');
  }
  if (!isValidEnv(env)) {
    return errorResponse(400, `env must be one of: ${VALID_ENVS.join(', ')}`);
  }

  const workDir = getWorkDir();
  if (!workDir) {
    return errorResponse(503, 'WORK_REPO_LOCAL_PATH not configured');
  }

  try {
    const baseBranch = await resolveBaseBranch(env, workDir);

    const branchName = generateBranchName(
      {
        source: 'jira',
        type: 'issue_updated',
        issueKey: jiraKey,
        summary: description,
        issueType: type === 'bugfix' ? 'Bug' : type === 'hotfix' ? 'Hotfix' : 'Story',
        projectKey: jiraKey.split('-')[0] || 'PROJ',
        status: 'In Progress',
        timestamp: new Date().toISOString(),
        payload: {},
      },
      env,
      type
    );

    const result = await createLocalBranch(branchName, baseBranch, workDir);

    if (result.success) {
      logger.info({ branchName, baseBranch }, 'Internal API: branch created');
      return { status: 200, data: result };
    } else {
      logger.error({ branchName, error: result.error }, 'Internal API: branch creation failed');
      return { status: 500, data: result };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Internal API: git branch handler failed');
    return errorResponse(500, msg);
  }
}

async function handleGitCommitPush(
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const { branchName, files, message } = body;

  if (!branchName || typeof branchName !== 'string') {
    return errorResponse(400, 'branchName string is required');
  }
  if (!Array.isArray(files) || files.length === 0) {
    return errorResponse(400, 'files array is required and must not be empty');
  }
  if (!message || typeof message !== 'string') {
    return errorResponse(400, 'message string is required');
  }

  const workDir = getWorkDir();
  if (!workDir) {
    return errorResponse(503, 'WORK_REPO_LOCAL_PATH not configured');
  }

  try {
    const typedFiles: FileToWrite[] = files.map((f: unknown) => {
      const file = f as Record<string, unknown>;
      if (!file.path || typeof file.path !== 'string') {
        throw new Error('Each file must have a "path" string');
      }
      if (typeof file.content !== 'string') {
        throw new Error('Each file must have a "content" string');
      }
      return {
        path: file.path,
        content: file.content,
        action: typeof file.action === 'string' ? file.action : 'create',
      };
    });

    const commitResult = await writeAndCommit(typedFiles, message, workDir);
    if (!commitResult.success) {
      logger.error({ error: commitResult.error }, 'Internal API: commit failed');
      return { status: 500, data: { commit: commitResult, push: null } };
    }

    const pushResult = await pushBranch(branchName, workDir);
    if (!pushResult.success) {
      logger.error({ error: pushResult.error }, 'Internal API: push failed');
      return { status: 500, data: { commit: commitResult, push: pushResult } };
    }

    logger.info(
      { branchName, commitSha: commitResult.commitSha },
      'Internal API: commit-push succeeded'
    );
    return { status: 200, data: { commit: commitResult, push: pushResult } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Internal API: commit-push handler failed');
    return errorResponse(500, msg);
  }
}

async function handleCiRun(
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const { branchName } = body;

  if (!branchName || typeof branchName !== 'string') {
    return errorResponse(400, 'branchName string is required');
  }

  if (!FEATURE_FLAGS.TARGET_CI_ENABLED) {
    return errorResponse(503, 'TARGET_CI_ENABLED is disabled');
  }

  try {
    const result = await runTargetCi(branchName);

    if (result.success) {
      logger.info(
        { branchName, totalDurationMs: result.totalDurationMs },
        'Internal API: CI passed'
      );
      return { status: 200, data: result };
    } else {
      logger.warn({ branchName, failedStep: result.failedStep?.name }, 'Internal API: CI failed');
      return { status: 200, data: result };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Internal API: CI handler failed');
    return errorResponse(500, msg);
  }
}

async function handleDeployPreview(
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const { branchName, jiraKey, env } = body;

  if (!branchName || typeof branchName !== 'string') {
    return errorResponse(400, 'branchName string is required');
  }
  if (!jiraKey || typeof jiraKey !== 'string') {
    return errorResponse(400, 'jiraKey string is required');
  }
  if (!isValidEnv(env)) {
    return errorResponse(400, `env must be one of: ${VALID_ENVS.join(', ')}`);
  }

  if (!FEATURE_FLAGS.PREVIEW_ENABLED) {
    return errorResponse(503, 'PREVIEW_ENABLED is disabled');
  }

  try {
    const { createRedisConnection } = await import('./queue/connection');
    const { getPreviewManager } = await import('./utils/preview-manager');

    const redis = createRedisConnection();
    try {
      const manager = getPreviewManager(redis);
      const result = await manager.startPreview({ branchName, issueKey: jiraKey, env });

      if (result.success) {
        logger.info(
          { branchName, jiraKey, preview: result.preview?.id },
          'Internal API: preview started'
        );
        return { status: 200, data: result };
      } else {
        logger.error({ branchName, error: result.error }, 'Internal API: preview failed');
        return { status: 500, data: result };
      }
    } finally {
      await redis.quit().catch(() => {});
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Internal API: preview handler failed');
    return errorResponse(500, msg);
  }
}

async function handlePrCreate(
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const { branchName, title, body: prBody, base, env } = body;

  if (!branchName || typeof branchName !== 'string') {
    return errorResponse(400, 'branchName string is required');
  }
  if (!title || typeof title !== 'string') {
    return errorResponse(400, 'title string is required');
  }

  const prBodyStr = typeof prBody === 'string' ? prBody : '';
  const baseBranch = typeof base === 'string' ? base : 'develop';
  const prEnv = isValidEnv(env) ? env : 'int';

  try {
    const { owner, repo } = getGitHubRepo(prEnv);
    if (!owner || !repo) {
      return errorResponse(503, 'GITHUB_REPO not configured');
    }

    const result = await createGitHubPullRequest(prEnv, {
      owner,
      repo,
      title,
      body: prBodyStr,
      head: branchName,
      base: baseBranch,
    });

    if (result.success) {
      logger.info(
        { branchName, prNumber: result.data.number, url: result.data.url },
        'Internal API: PR created'
      );
      return { status: 200, data: { success: true, pr: result.data } };
    } else {
      logger.error({ branchName, error: result.error }, 'Internal API: PR creation failed');
      return { status: 500, data: { success: false, error: result.error } };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Internal API: PR handler failed');
    return errorResponse(500, msg);
  }
}

// ─── Route Registry ─────────────────────────────────────────────────────────

const routes: Routes = {
  '/internal/git/branch': handleGitBranch,
  '/internal/git/commit-push': handleGitCommitPush,
  '/internal/ci/run': handleCiRun,
  '/internal/deploy/preview': handleDeployPreview,
  '/internal/pr/create': handlePrCreate,
};

// ─── Request Handler ────────────────────────────────────────────────────────

export async function handleInternalRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || '';

  if (method !== 'POST' || !url.startsWith('/internal/')) {
    return false;
  }

  const handler = routes[url];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown internal endpoint: ${url}` }));
    return true;
  }

  try {
    const body = await parseJsonBody(req);
    const result = await handler(body);

    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.data));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ url, error: msg }, 'Internal API request failed');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }

  return true;
}

export function getInternalRoutes(): string[] {
  return Object.keys(routes);
}
