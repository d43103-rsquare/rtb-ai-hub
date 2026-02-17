import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('../clients/mcp-client', () => ({
  getMcpClient: vi.fn().mockReturnValue({
    callTool: vi.fn().mockResolvedValue({ number: 42, html_url: 'https://github.com/test/42' }),
  }),
}));

vi.mock('../clients/database', () => ({
  database: {
    saveWorkflowExecution: vi.fn().mockResolvedValue(undefined),
    saveAICost: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('../utils/e2e-runner', () => ({
  runE2ETests: vi.fn().mockResolvedValue({
    success: true,
    passedTests: 5,
    failedTests: 0,
    totalTests: 5,
    results: [],
  }),
}));

vi.mock('../utils/wiki-knowledge', () => ({
  WikiKnowledge: vi.fn().mockImplementation(() => ({
    isAvailable: false,
    buildIndex: vi.fn(),
    searchForContext: vi.fn().mockResolvedValue(''),
    getTableDoc: vi.fn().mockResolvedValue(''),
    getDomainOverview: vi.fn().mockResolvedValue(''),
  })),
}));

vi.mock('../queue/connection', () => ({
  createRedisConnection: vi.fn().mockReturnValue({}),
}));

vi.mock('../utils/preview-manager', () => ({
  PreviewManager: vi.fn().mockImplementation(() => ({
    startPreview: vi.fn().mockResolvedValue({
      success: true,
      preview: { webUrl: 'http://localhost:5001', apiUrl: 'http://localhost:5002', status: 'running', webPort: 5001, apiPort: 5002 },
    }),
  })),
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
      PREVIEW_ENABLED: true,
      IMPACT_ANALYSIS_ENABLED: false,
      DECISION_JOURNAL_ENABLED: false,
      DEBATE_ENABLED: true,
      CLAUDE_CODE_ENABLED: true,
      WORKTREE_ENABLED: false,
    },
  };
});

const TEST_TOKEN = 'test-api-token';

function createMockReq(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  authToken?: string
): http.IncomingMessage {
  const { Readable } = require('stream');
  const readable = new Readable();
  if (body) {
    readable.push(JSON.stringify(body));
  }
  readable.push(null);
  readable.method = method;
  readable.url = url;
  readable.headers = {
    'content-type': 'application/json',
    ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
  };
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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RTB_API_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns all registered route paths including hub-api routes', async () => {
    const routes = await getInternalRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(5);
    expect(routes).toContain('POST /trigger-e2e');
    expect(routes).toContain('POST /api/infra/git/branch');
    expect(routes).toContain('POST /api/infra/git/commit-push');
    expect(routes).toContain('POST /api/infra/ci/run');
    expect(routes).toContain('POST /api/infra/pr/create');
  });
});

describe('handleInternalRequest routing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RTB_API_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false for GET requests to unknown paths', async () => {
    const req = createMockReq('GET', '/unknown', undefined, TEST_TOKEN);
    const res = createMockRes();
    const handled = await handleInternalRequest(req, res);
    expect(handled).toBe(false);
  });

  it('returns false for non-matching paths', async () => {
    const req = createMockReq('POST', '/health', undefined, TEST_TOKEN);
    const res = createMockRes();
    const handled = await handleInternalRequest(req, res);
    expect(handled).toBe(false);
  });

  it('returns 401 for requests without auth token', async () => {
    const req = createMockReq('POST', '/api/infra/git/branch', { jiraKey: 'PROJ-1', type: 'feature', description: 'test', env: 'int' });
    const res = createMockRes();
    const handled = await handleInternalRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(401);
  });
});

describe('POST /api/infra/git/branch', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RTB_API_TOKEN = TEST_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates branch successfully', async () => {
    const req = createMockReq(
      'POST',
      '/api/infra/git/branch',
      { jiraKey: 'PROJ-123', type: 'feature', description: 'implement login page', env: 'int' },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res);
    expect(body.branchName).toBe('feature/PROJ-123-test-desc');
    expect(body.created).toBe(true);
  });

  it('returns 500 when createLocalBranch fails', async () => {
    const { createLocalBranch } = await import('../utils/local-git-ops');
    vi.mocked(createLocalBranch).mockResolvedValueOnce({
      success: false,
      branchName: 'feature/PROJ-123-test-desc',
      baseBranch: 'develop',
      error: 'branch already exists',
    });

    const req = createMockReq(
      'POST',
      '/api/infra/git/branch',
      { jiraKey: 'PROJ-123', type: 'feature', description: 'test', env: 'int' },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(500);
    expect(parseResBody(res)).toHaveProperty('error', 'branch already exists');
  });
});

describe('POST /api/infra/git/commit-push', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RTB_API_TOKEN = TEST_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('commits and pushes successfully', async () => {
    const req = createMockReq(
      'POST',
      '/api/infra/git/commit-push',
      {
        branchName: 'feature/test',
        files: [{ path: 'src/test.ts', content: 'export {}' }],
        message: '[PROJ-123] test commit',
      },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res);
    expect(body.commitHash).toBe('abc123');
    expect(body.pushed).toBe(true);
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

    const req = createMockReq(
      'POST',
      '/api/infra/git/commit-push',
      {
        branchName: 'feature/test',
        files: [{ path: 'test.ts', content: 'hello' }],
        message: 'test',
      },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(500);
  });
});

describe('POST /api/infra/ci/run', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RTB_API_TOKEN = TEST_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('runs CI successfully', async () => {
    const req = createMockReq(
      'POST',
      '/api/infra/ci/run',
      { branchName: 'feature/test' },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res);
    expect(body.success).toBe(true);
  });

  it('returns CI failure with success=false', async () => {
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

    const req = createMockReq(
      'POST',
      '/api/infra/ci/run',
      { branchName: 'feature/test' },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    expect(parseResBody(res).success).toBe(false);
  });
});

describe('POST /api/infra/pr/create', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RTB_API_TOKEN = TEST_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates PR successfully', async () => {
    const req = createMockReq(
      'POST',
      '/api/infra/pr/create',
      {
        branchName: 'feature/PROJ-123-test',
        title: '[PROJ-123] Test PR',
        body: 'PR description',
      },
      TEST_TOKEN
    );
    const res = createMockRes();
    await handleInternalRequest(req, res);
    expect(res._statusCode).toBe(200);
    const body = parseResBody(res);
    expect(body.prNumber).toBe(42);
    expect(body.created).toBe(true);
  });
});
