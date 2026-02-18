import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createInfraRouter } from '../routes/infra';

vi.mock('@rtb-ai-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rtb-ai-hub/shared')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
    getEnv: (key: string, defaultValue: string) => process.env[key] ?? defaultValue,
  };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(createInfraRouter());
  return app;
}

function mockFetchResponse(status: number, data: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    status,
    json: () => Promise.resolve(data),
  });
}

describe('Infra API', () => {
  let app: express.Express;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RTB_INTERNAL_API_TOKEN;
    app = createTestApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/infra/git/branch', () => {
    it('proxies valid request to workflow engine', async () => {
      mockFetchResponse(200, {
        branchName: 'feature/PROJ-123-add-login',
        baseBranch: 'develop',
        success: true,
      });

      const res = await request(app).post('/api/infra/git/branch').send({
        jiraKey: 'PROJ-123',
        type: 'feature',
        description: 'add login',
        env: 'int',
      });

      expect(res.status).toBe(200);
      expect(res.body.branchName).toBe('feature/PROJ-123-add-login');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/infra/git/branch',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('returns 400 when jiraKey is missing', async () => {
      const res = await request(app).post('/api/infra/git/branch').send({
        type: 'feature',
        description: 'test',
        env: 'int',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('jiraKey string is required');
    });

    it('returns 400 for invalid branch type', async () => {
      const res = await request(app).post('/api/infra/git/branch').send({
        jiraKey: 'PROJ-123',
        type: 'invalid',
        description: 'test',
        env: 'int',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type must be one of');
    });

    it('returns 400 for invalid env', async () => {
      const res = await request(app).post('/api/infra/git/branch').send({
        jiraKey: 'PROJ-123',
        type: 'feature',
        description: 'test',
        env: 'invalid',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('env must be one of');
    });

    it('returns 502 when workflow engine is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app).post('/api/infra/git/branch').send({
        jiraKey: 'PROJ-123',
        type: 'feature',
        description: 'test',
        env: 'int',
      });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Workflow engine unreachable');
    });
  });

  describe('POST /api/infra/git/commit-push', () => {
    it('proxies valid request', async () => {
      mockFetchResponse(200, { commitHash: 'abc123', pushed: true, success: true });

      const res = await request(app)
        .post('/api/infra/git/commit-push')
        .send({
          branchName: 'feature/PROJ-123-test',
          files: [{ path: 'src/index.ts', content: 'console.log("hi")', action: 'create' }],
          message: '[PROJ-123] Add index file',
        });

      expect(res.status).toBe(200);
      expect(res.body.commitHash).toBe('abc123');
    });

    it('returns 400 when branchName is missing', async () => {
      const res = await request(app)
        .post('/api/infra/git/commit-push')
        .send({
          files: [{ path: 'test.ts', content: '', action: 'create' }],
          message: 'test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('branchName string is required');
    });

    it('returns 400 when files is empty', async () => {
      const res = await request(app).post('/api/infra/git/commit-push').send({
        branchName: 'feature/test',
        files: [],
        message: 'test',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('files array is required');
    });

    it('returns 400 when message is missing', async () => {
      const res = await request(app)
        .post('/api/infra/git/commit-push')
        .send({
          branchName: 'feature/test',
          files: [{ path: 'test.ts', content: '', action: 'create' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('message string is required');
    });
  });

  describe('POST /api/infra/ci/run', () => {
    it('proxies valid request', async () => {
      mockFetchResponse(200, {
        success: true,
        steps: [{ name: 'lint', success: true, durationMs: 1000 }],
        totalDurationMs: 1000,
      });

      const res = await request(app)
        .post('/api/infra/ci/run')
        .send({ branchName: 'feature/PROJ-123-test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when branchName is missing', async () => {
      const res = await request(app).post('/api/infra/ci/run').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('branchName string is required');
    });
  });


  describe('POST /api/infra/deploy/preview', () => {
    it('proxies valid request', async () => {
      mockFetchResponse(200, {
        url: 'http://localhost:5001',
        status: 'running',
        previewId: 'prev_PROJ-123',
      });

      const res = await request(app).post('/api/infra/deploy/preview').send({
        branchName: 'feature/PROJ-123-test',
        jiraKey: 'PROJ-123',
        env: 'int',
      });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('http://localhost:5001');
    });

    it('returns 400 when branchName is missing', async () => {
      const res = await request(app).post('/api/infra/deploy/preview').send({
        jiraKey: 'PROJ-123',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('branchName string is required');
    });

    it('returns 400 when jiraKey is missing', async () => {
      const res = await request(app).post('/api/infra/deploy/preview').send({
        branchName: 'feature/test',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('jiraKey string is required');
    });

    it('defaults env to int when not provided', async () => {
      mockFetchResponse(200, { url: 'http://localhost:5001', status: 'running' });

      await request(app).post('/api/infra/deploy/preview').send({
        branchName: 'feature/test',
        jiraKey: 'PROJ-123',
      });

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.env).toBe('int');
    });
  });

  describe('POST /api/infra/pr/create', () => {
    it('proxies valid request', async () => {
      mockFetchResponse(200, { prNumber: 42, url: 'https://github.com/org/repo/pull/42' });

      const res = await request(app).post('/api/infra/pr/create').send({
        branchName: 'feature/PROJ-123-test',
        title: '[PROJ-123] Add login page',
        body: 'Implements login functionality',
      });

      expect(res.status).toBe(200);
      expect(res.body.prNumber).toBe(42);
    });

    it('returns 400 when branchName is missing', async () => {
      const res = await request(app).post('/api/infra/pr/create').send({
        title: 'test',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('branchName string is required');
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app).post('/api/infra/pr/create').send({
        branchName: 'feature/test',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('title string is required');
    });

    it('defaults base to develop and body to empty string', async () => {
      mockFetchResponse(200, { prNumber: 1, url: 'https://github.com/org/repo/pull/1' });

      await request(app).post('/api/infra/pr/create').send({
        branchName: 'feature/test',
        title: 'test PR',
      });

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.base).toBe('develop');
      expect(fetchBody.body).toBe('');
    });
  });

  describe('Auth integration', () => {
    it('blocks requests when token is set but not provided', async () => {
      process.env.RTB_INTERNAL_API_TOKEN = 'secret';
      app = createTestApp();

      const res = await request(app).post('/api/infra/ci/run').send({ branchName: 'test' });

      expect(res.status).toBe(401);
    });

    it('allows requests with valid token', async () => {
      process.env.RTB_INTERNAL_API_TOKEN = 'secret';
      app = createTestApp();
      mockFetchResponse(200, { success: true, steps: [], totalDurationMs: 0 });

      const res = await request(app)
        .post('/api/infra/ci/run')
        .set('Authorization', 'Bearer secret')
        .send({ branchName: 'test' });

      expect(res.status).toBe(200);
    });
  });
});
