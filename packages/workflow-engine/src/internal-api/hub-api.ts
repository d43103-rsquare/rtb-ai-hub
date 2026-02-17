import http from 'http';
import { createLogger } from '@rtb-ai-hub/shared';
import type { Environment, JiraWebhookEvent } from '@rtb-ai-hub/shared';
import { WikiKnowledge } from '../utils/wiki-knowledge.js';
import {
  createLocalBranch,
  generateBranchName,
  resolveBaseBranch,
  writeAndCommit,
  pushBranch,
} from '../utils/local-git-ops.js';
import { runTargetCi } from '../utils/target-ci.js';
import { PreviewManager } from '../utils/preview-manager.js';
import { createRedisConnection } from '../queue/connection.js';
import { getMcpClient } from '../clients/mcp-client.js';

const logger = createLogger('hub-api');

function authMiddleware(token: string | undefined): boolean {
  const expectedToken = process.env.RTB_API_TOKEN;
  return !!(expectedToken && token && token === expectedToken);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function sendJson(res: http.ServerResponse, data: any): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export async function handleKnowledgeSearch(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { query, maxDocs = 4 } = JSON.parse(body);

    const wikiKnowledge = new WikiKnowledge();
    if (!wikiKnowledge.isAvailable) {
      return sendError(res, 503, 'Wiki knowledge not configured');
    }

    await wikiKnowledge.buildIndex();
    const context = await wikiKnowledge.searchForContext(query, maxDocs);

    sendJson(res, {
      context,
      tables: [],
      domains: [],
      found: context.length > 0,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleKnowledgeRefine(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { requirement, jiraKey } = JSON.parse(body);

    const wikiKnowledge = new WikiKnowledge();
    if (!wikiKnowledge.isAvailable) {
      return sendError(res, 503, 'Wiki knowledge not configured');
    }

    await wikiKnowledge.buildIndex();
    const wikiContext = await wikiKnowledge.searchForContext(requirement, 4);

    const refinedSpec = `[${jiraKey}] Refined Requirement:\n\n${requirement}\n\n**Domain Knowledge Applied:**\n${wikiContext.substring(0, 200)}...`;

    sendJson(res, {
      refinedSpec,
      wikiContext,
      suggestedTables: [],
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleKnowledgeTable(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  tableName: string
): Promise<void> {
  try {
    const wikiKnowledge = new WikiKnowledge();
    if (!wikiKnowledge.isAvailable) {
      return sendError(res, 503, 'Wiki knowledge not configured');
    }

    await wikiKnowledge.buildIndex();
    const content = await wikiKnowledge.getTableDoc(tableName);

    sendJson(res, {
      content: content || '',
      found: !!content && content.length > 0,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleKnowledgeDomain(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  domainKey: string
): Promise<void> {
  try {
    const wikiKnowledge = new WikiKnowledge();
    if (!wikiKnowledge.isAvailable) {
      return sendError(res, 503, 'Wiki knowledge not configured');
    }

    await wikiKnowledge.buildIndex();
    const content = await wikiKnowledge.getDomainOverview(domainKey);

    sendJson(res, {
      content: content || '',
      found: !!content && content.length > 0,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleGitBranch(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { jiraKey, type = 'feature', description, env = 'int' } = JSON.parse(body);

    const mockEvent: JiraWebhookEvent = {
      source: 'jira',
      type: 'issue_updated',
      issueKey: jiraKey,
      summary: description,
      issueType: type === 'bugfix' ? 'Bug' : 'Story',
      status: 'In Progress',
      timestamp: new Date().toISOString(),
      payload: {},
    };

    const branchName = generateBranchName(mockEvent, env as Environment, type as any);
    const workDir = process.env.WORK_REPO_LOCAL_PATH || process.cwd();
    const baseBranch = await resolveBaseBranch(env as Environment, workDir);
    const result = await createLocalBranch(branchName, baseBranch, workDir);

    if (!result.success) {
      return sendError(res, 500, result.error || 'Branch creation failed');
    }

    sendJson(res, {
      branchName: result.branchName,
      baseBranch: result.baseBranch,
      created: true,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleGitCommitPush(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { branchName, files, message } = JSON.parse(body);

    const fileList = files.map((f: any) => ({
      path: f.path,
      content: f.content,
      action: 'create',
    }));

    const workDir = process.env.WORK_REPO_LOCAL_PATH || process.cwd();
    const commitResult = await writeAndCommit(fileList, message, workDir);
    if (!commitResult.success) {
      return sendError(res, 500, commitResult.error || 'Commit failed');
    }

    const pushResult = await pushBranch(branchName, workDir);
    if (!pushResult.success) {
      return sendError(res, 500, pushResult.error || 'Push failed');
    }

    sendJson(res, {
      commitHash: commitResult.commitSha,
      pushed: true,
      filesCommitted: commitResult.filesWritten,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleCiRun(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { branchName } = JSON.parse(body);

    const result = await runTargetCi(branchName);

    sendJson(res, {
      success: result.success,
      steps: result.steps,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleDeployPreview(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { branchName, jiraKey, env = 'int' } = JSON.parse(body);

    const redis = createRedisConnection();
    const previewManager = new PreviewManager(redis);

    const result = await previewManager.startPreview({
      branchName,
      issueKey: jiraKey,
      env: env as Environment,
    });

    if (!result.success) {
      return sendError(res, 500, result.error || 'Preview deployment failed');
    }

    sendJson(res, {
      url: result.preview?.webUrl,
      apiUrl: result.preview?.apiUrl,
      status: result.preview?.status,
      ports: {
        web: result.preview?.webPort,
        api: result.preview?.apiPort,
      },
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handlePrCreate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  env: Environment
): Promise<void> {
  try {
    const body = await readBody(req);
    const { branchName, title, body: prBody } = JSON.parse(body);

    const githubClient = getMcpClient('GITHUB', env);

    const prResult = await githubClient.callTool('create_pull_request', {
      title,
      body: prBody,
      head: branchName,
      base: env === 'prd' ? 'main' : env === 'stg' ? 'release/1.0' : 'develop',
    });

    const prData: any = typeof prResult === 'string' ? JSON.parse(prResult) : prResult;

    sendJson(res, {
      prNumber: prData.number,
      url: prData.html_url || prData.url,
      created: true,
    });
  } catch (error: any) {
    sendError(res, 500, error.message);
  }
}

export async function handleHubApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

  if (!authMiddleware(token)) {
    sendError(res, 401, 'Unauthorized');
    return true;
  }

  const url = req.url || '';

  if (req.method === 'POST' && url === '/api/knowledge/search') {
    await handleKnowledgeSearch(req, res);
    return true;
  }

  if (req.method === 'POST' && url === '/api/knowledge/refine') {
    await handleKnowledgeRefine(req, res);
    return true;
  }

  const tableMatch = url.match(/^\/api\/knowledge\/table\/([^/]+)$/);
  if (req.method === 'GET' && tableMatch) {
    await handleKnowledgeTable(req, res, tableMatch[1]);
    return true;
  }

  const domainMatch = url.match(/^\/api\/knowledge\/domain\/([^/]+)$/);
  if (req.method === 'GET' && domainMatch) {
    await handleKnowledgeDomain(req, res, domainMatch[1]);
    return true;
  }

  if (req.method === 'POST' && url === '/api/infra/git/branch') {
    await handleGitBranch(req, res);
    return true;
  }

  if (req.method === 'POST' && url === '/api/infra/git/commit-push') {
    await handleGitCommitPush(req, res);
    return true;
  }

  if (req.method === 'POST' && url === '/api/infra/ci/run') {
    await handleCiRun(req, res);
    return true;
  }

if (req.method === 'POST' && url === '/api/infra/deploy/preview') {
    await handleDeployPreview(req, res);
    return true;
  }

  const prMatch = url.match(/^\/api\/infra\/pr\/create(\?env=(int|stg|prd))?$/);
  if (req.method === 'POST' && prMatch) {
    const env = (prMatch[2] as Environment) || 'int';
    await handlePrCreate(req, res, env);
    return true;
  }

  return false;
}

export function getHubApiRoutes(): string[] {
  return [
    'POST /api/knowledge/search',
    'POST /api/knowledge/refine',
    'GET /api/knowledge/table/:tableName',
    'GET /api/knowledge/domain/:domainKey',
    'POST /api/infra/git/branch',
    'POST /api/infra/git/commit-push',
    'POST /api/infra/ci/run',
    'POST /api/infra/deploy/preview',
    'POST /api/infra/pr/create',
  ];
}
