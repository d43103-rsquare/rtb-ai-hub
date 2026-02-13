import { describe, it, expect, vi } from 'vitest';
import http from 'http';
import { handleInternalRequest, getInternalRoutes } from '../internal-api';

vi.mock('../utils/local-git-ops', () => ({
  resolveBaseBranch: vi.fn().mockResolvedValue('develop'),
  generateBranchName: vi.fn().mockReturnValue('feature/PROJ-123-test-desc'),
  createLocalBranch: vi.fn().mockResolvedValue({
    success: true,
    branchName: 'feature/PROJ-123-test-desc',
    baseBranch: 'develop',
  }),
  writeAndCommit: vi.fn().mockResolvedValue({
    success: true,
    commitSha: 'abc123',
    message: 'test commit',
    filesWritten: 1,
  }),
  pushBranch: vi.fn().mockResolvedValue({
    success: true,
    branchName: 'feature/PROJ-123-test-desc',
  }),
}));

vi.mock('../utils/target-ci', () => ({
  runTargetCi: vi.fn().mockResolvedValue({
    success: true,
    steps: [],
    totalDurationMs: 1000,
    failedStep: null,
  }),
}));

vi.mock('../clients/mcp-helper', () => ({
  getGitHubRepo: vi.fn().mockReturnValue({ owner: 'test-org', repo: 'test-repo' }),
  createGitHubPullRequest: vi.fn().mockResolvedValue({
    success: true,
    data: { number: 42, url: 'https://github.com/test/42', title: 'Test PR', state: 'open' },
  }),
}));

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    getEnv: (key: string, defaultVal: string) => {
      if (key === 'WORK_REPO_LOCAL_PATH') return '/fake/work/dir';
      return process.env[key] || defaultVal;
    },
    FEATURE_FLAGS: {
      TARGET_CI_ENABLED: true,
      TARGET_CD_ENABLED: false,
      LOCAL_POLLING_ENABLED: false,
      OPENCLAW_NOTIFY_ENABLED: false,
      PREVIEW_ENABLED: true,
      IMPACT_ANALYSIS_ENABLED: false,
      DECISION_JOURNAL_ENABLED: false,
    },
  };
});

function createMockReq(
  method: string,
  url: string,
  body?: Record<string, unknown>
): http.IncomingMessage {
  const { Readable } = require('stream');
  const readable = new Readable();
  if (body) {
    readable.push(JSON.stringify(body));
  }
  readable.push(null);
  readable.method = method;
  readable.url = url;
  readable.headers = { 'content-type': 'application/json' };
  return readable as unknown as http.IncomingMessage;
}

function createMockRes(): http.ServerResponse & {
  _statusCode: number;
  _body: string;
  _headers: Record<string, string>;
} {
  const chunks: string[] = [];
  const res = {
    _statusCode: 0,
    _body: '',
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._statusCode = status;
      if (headers) {
        Object.assign(res._headers, headers);
      }
    },
    end(data?: string) {
      if (data) chunks.push(data);
      res._body = chunks.join('');
    },
    write(data: string) {
      chunks.push(data);
    },
  };
  return res as unknown as http.ServerResponse & {
    _statusCode: number;
    _body: string;
    _headers: Record<string, string>;
  };
}

function parseResBody(res: { _body: string }): Record<string, unknown> {
  return JSON.parse(res._body) as Record<string, unknown>;
}

describe('getInternalRoutes', () => {
  it('returns all 5 registered route paths', () => {
    const routes = getInternalRoutes();
    expect(routes).toHaveLength(5);
    expect(routes).toContain('/internal/git/branch');
    expect(routes).toContain('/internal/git/commit-push');
    expect(routes).toContain('/internal/ci/run');
    expect(routes).toContain('/internal/deploy/preview');
    expect(routes).toContain('/internal/pr/create');
  });
});

describe('handleInternalRequest routing', () => {
  it('returns false for GET requests', async () => {
    const req = createMockReq('GET', '/internal/git/branch');
    const res = createMockRes();
    const handled = await handleInternalRequest(req, res);
    expect(handled).toBe(false);
  });

  it('returns false for non-internal paths', async () => {
    const req = createMockReq('POST', '/health');
    const res = createMockRes();
    const handled = await handleInternalRequest(req, res);
    expect(handled).toBe(false);
  });

  it('returns 404 for unknown internal route', async () => {
    const req = createMockReq('POST', '/internal/unknown');
    const res = createMockRes();
    const handled = await handleInternalRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(404);
    expect(parseResBody(res)).toHaveProperty('error');
  });
});

describe('POST /internal/git/branch', () => {
  it('validates missing jiraKey', async () => {
    const req = createMockReq('POST', '/internal/git/branch', {
      type: 'feature',
      description: 'test',
      env: 'int',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'jiraKey string is required' });
  });

  it('validates invalid branch type', async () => {
    const req = createMockReq('POST', '/internal/git/branch', {
      jiraKey: 'PROJ-123',
      type: 'invalid',
      description: 'test',
      env: 'int',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    const body = parseResBody(res);
    expect(body.error as string).toContain('type must be one of');
  });

  it('validates missing env', async () => {
    const req = createMockReq('POST', '/internal/git/branch', {
      jiraKey: 'PROJ-123',
      type: 'feature',
      description: 'test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'env must be one of: int, stg, prd' });
  });

  it('creates branch successfully', async () => {
    const req = createMockReq('POST', '/internal/git/branch', {
      jiraKey: 'PROJ-123',
      type: 'feature',
      description: 'implement login page',
      env: 'int',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res);
    expect(body.success).toBe(true);
    expect(body.branchName).toBe('feature/PROJ-123-test-desc');
  });

  it('returns 500 when createLocalBranch fails', async () => {
    const { createLocalBranch } = await import('../utils/local-git-ops');
    vi.mocked(createLocalBranch).mockResolvedValueOnce({
      success: false,
      branchName: 'feature/PROJ-123-test-desc',
      baseBranch: 'develop',
      error: 'branch already exists',
    });

    const req = createMockReq('POST', '/internal/git/branch', {
      jiraKey: 'PROJ-123',
      type: 'feature',
      description: 'test',
      env: 'int',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(500);
    expect(parseResBody(res)).toHaveProperty('error', 'branch already exists');
  });
});

describe('POST /internal/git/commit-push', () => {
  it('validates missing branchName', async () => {
    const req = createMockReq('POST', '/internal/git/commit-push', {
      files: [{ path: 'test.ts', content: 'hello' }],
      message: 'test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'branchName string is required' });
  });

  it('validates empty files array', async () => {
    const req = createMockReq('POST', '/internal/git/commit-push', {
      branchName: 'feature/test',
      files: [],
      message: 'test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({
      error: 'files array is required and must not be empty',
    });
  });

  it('commits and pushes successfully', async () => {
    const req = createMockReq('POST', '/internal/git/commit-push', {
      branchName: 'feature/test',
      files: [{ path: 'src/test.ts', content: 'export {}' }],
      message: '[PROJ-123] test commit',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res) as {
      commit: Record<string, unknown>;
      push: Record<string, unknown>;
    };
    expect(body.commit.success).toBe(true);
    expect(body.push.success).toBe(true);
  });

  it('returns 500 when commit fails', async () => {
    const { writeAndCommit } = await import('../utils/local-git-ops');
    vi.mocked(writeAndCommit).mockResolvedValueOnce({
      success: false,
      commitSha: '',
      message: 'test',
      filesWritten: 0,
      error: 'nothing to commit',
    });

    const req = createMockReq('POST', '/internal/git/commit-push', {
      branchName: 'feature/test',
      files: [{ path: 'test.ts', content: 'hello' }],
      message: 'test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(500);
    const body = parseResBody(res) as { commit: Record<string, unknown> };
    expect(body.commit.success).toBe(false);
  });

  it('returns 500 when push fails', async () => {
    const { pushBranch } = await import('../utils/local-git-ops');
    vi.mocked(pushBranch).mockResolvedValueOnce({
      success: false,
      branchName: 'feature/test',
      error: 'permission denied',
    });

    const req = createMockReq('POST', '/internal/git/commit-push', {
      branchName: 'feature/test',
      files: [{ path: 'test.ts', content: 'hello' }],
      message: 'test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(500);
    const body = parseResBody(res) as { push: Record<string, unknown> };
    expect(body.push.success).toBe(false);
  });
});

describe('POST /internal/ci/run', () => {
  it('validates missing branchName', async () => {
    const req = createMockReq('POST', '/internal/ci/run', {});
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'branchName string is required' });
  });

  it('runs CI successfully', async () => {
    const req = createMockReq('POST', '/internal/ci/run', {
      branchName: 'feature/test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res);
    expect(body.success).toBe(true);
  });

  it('returns CI failure as 200 with success=false', async () => {
    const { runTargetCi } = await import('../utils/target-ci');
    vi.mocked(runTargetCi).mockResolvedValueOnce({
      success: false,
      steps: [
        {
          name: 'lint',
          command: 'npm run lint',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'lint error',
          durationMs: 500,
        },
      ],
      totalDurationMs: 500,
      failedStep: {
        name: 'lint',
        command: 'npm run lint',
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'lint error',
        durationMs: 500,
      },
    });

    const req = createMockReq('POST', '/internal/ci/run', { branchName: 'feature/test' });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    expect(parseResBody(res).success).toBe(false);
  });
});

describe('POST /internal/deploy/preview', () => {
  it('validates missing branchName', async () => {
    const req = createMockReq('POST', '/internal/deploy/preview', {
      jiraKey: 'PROJ-123',
      env: 'int',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'branchName string is required' });
  });

  it('validates missing jiraKey', async () => {
    const req = createMockReq('POST', '/internal/deploy/preview', {
      branchName: 'feature/test',
      env: 'int',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'jiraKey string is required' });
  });

  it('validates invalid env', async () => {
    const req = createMockReq('POST', '/internal/deploy/preview', {
      branchName: 'feature/test',
      jiraKey: 'PROJ-123',
      env: 'invalid',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'env must be one of: int, stg, prd' });
  });
});

describe('POST /internal/pr/create', () => {
  it('validates missing branchName', async () => {
    const req = createMockReq('POST', '/internal/pr/create', {
      title: 'Test PR',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'branchName string is required' });
  });

  it('validates missing title', async () => {
    const req = createMockReq('POST', '/internal/pr/create', {
      branchName: 'feature/test',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(400);
    expect(parseResBody(res)).toEqual({ error: 'title string is required' });
  });

  it('creates PR successfully', async () => {
    const req = createMockReq('POST', '/internal/pr/create', {
      branchName: 'feature/PROJ-123-test',
      title: '[PROJ-123] Test PR',
      body: 'PR description',
      base: 'develop',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res) as { success: boolean; pr: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.pr.number).toBe(42);
  });

  it('uses default base branch and env when not provided', async () => {
    const { createGitHubPullRequest } = await import('../clients/mcp-helper');
    const req = createMockReq('POST', '/internal/pr/create', {
      branchName: 'feature/test',
      title: 'Test PR',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    expect(vi.mocked(createGitHubPullRequest)).toHaveBeenCalledWith(
      'int',
      expect.objectContaining({
        base: 'develop',
        body: '',
      })
    );
  });

  it('returns 500 when MCP PR creation fails', async () => {
    const { createGitHubPullRequest } = await import('../clients/mcp-helper');
    vi.mocked(createGitHubPullRequest).mockResolvedValueOnce({
      success: false,
      error: 'MCP tool returned error',
    });

    const req = createMockReq('POST', '/internal/pr/create', {
      branchName: 'feature/test',
      title: 'Test PR',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(500);
    const body = parseResBody(res) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('MCP tool returned error');
  });

  it('returns 503 when GITHUB_REPO is not configured', async () => {
    const { getGitHubRepo } = await import('../clients/mcp-helper');
    vi.mocked(getGitHubRepo).mockReturnValueOnce({ owner: '', repo: '' });

    const req = createMockReq('POST', '/internal/pr/create', {
      branchName: 'feature/test',
      title: 'Test PR',
    });
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(503);
    expect(parseResBody(res)).toEqual({ error: 'GITHUB_REPO not configured' });
  });
});
