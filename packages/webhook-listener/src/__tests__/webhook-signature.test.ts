import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

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
  };
});

function createMockReq(overrides: Partial<Request & { rawBody?: Buffer }> = {}): Request & {
  rawBody?: Buffer;
} {
  return {
    headers: {},
    rawBody: undefined,
    ...overrides,
  } as Request & { rawBody?: Buffer };
}

function createMockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('Webhook Signature Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verifyGitHubSignature', () => {
    it('passes with valid HMAC-SHA256 signature (sha256= prefix)', async () => {
      const secret = 'github-test-secret';
      process.env.GITHUB_WEBHOOK_SECRET = secret;

      const { verifyGitHubSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from(JSON.stringify({ action: 'opened' }));
      const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
      const signature = `sha256=${hmac}`;

      const req = createMockReq({
        headers: { 'x-hub-signature-256': signature },
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyGitHubSignature(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
    });

    it('rejects invalid signature', async () => {
      process.env.GITHUB_WEBHOOK_SECRET = 'github-test-secret';

      const { verifyGitHubSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from(JSON.stringify({ action: 'opened' }));

      const req = createMockReq({
        headers: { 'x-hub-signature-256': 'sha256=invalidsignature' },
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyGitHubSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid webhook signature' });
    });

    it('skips verification when env var is not set', async () => {
      delete process.env.GITHUB_WEBHOOK_SECRET;

      const { verifyGitHubSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      verifyGitHubSignature(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when signature header is missing', async () => {
      process.env.GITHUB_WEBHOOK_SECRET = 'github-test-secret';

      const { verifyGitHubSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from('{}');
      const req = createMockReq({
        headers: {},
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyGitHubSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid webhook signature' });
    });

    it('returns 401 when rawBody is missing', async () => {
      process.env.GITHUB_WEBHOOK_SECRET = 'github-test-secret';

      const { verifyGitHubSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq({
        headers: { 'x-hub-signature-256': 'sha256=abc' },
        rawBody: undefined,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyGitHubSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid webhook signature' });
    });
  });

  describe('verifyJiraSignature', () => {
    it('passes with valid HMAC-SHA256 signature (no prefix)', async () => {
      const secret = 'jira-test-secret';
      process.env.JIRA_WEBHOOK_SECRET = secret;

      const { verifyJiraSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from(JSON.stringify({ webhookEvent: 'issue_updated' }));
      const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');

      const req = createMockReq({
        headers: { 'x-hub-signature': hmac },
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyJiraSignature(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid signature', async () => {
      process.env.JIRA_WEBHOOK_SECRET = 'jira-test-secret';

      const { verifyJiraSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from('{}');
      const req = createMockReq({
        headers: { 'x-hub-signature': 'invalidsignature' },
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyJiraSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('skips verification when env var is not set', async () => {
      delete process.env.JIRA_WEBHOOK_SECRET;

      const { verifyJiraSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      verifyJiraSignature(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when signature header is missing', async () => {
      process.env.JIRA_WEBHOOK_SECRET = 'jira-test-secret';

      const { verifyJiraSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from('{}');
      const req = createMockReq({
        headers: {},
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyJiraSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });
  });

  describe('verifyFigmaSignature', () => {
    it('passes when header matches secret directly (simple comparison)', async () => {
      const secret = 'figma-webhook-secret-value';
      process.env.FIGMA_WEBHOOK_SECRET = secret;

      const { verifyFigmaSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq({
        headers: { 'x-figma-signature': secret },
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyFigmaSignature(req as unknown as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects when header does not match secret', async () => {
      process.env.FIGMA_WEBHOOK_SECRET = 'figma-webhook-secret-value';

      const { verifyFigmaSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq({
        headers: { 'x-figma-signature': 'wrong-value' },
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyFigmaSignature(req as unknown as Request, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid webhook signature' });
    });

    it('skips verification when env var is not set', async () => {
      delete process.env.FIGMA_WEBHOOK_SECRET;

      const { verifyFigmaSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      verifyFigmaSignature(req as unknown as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when signature header is missing', async () => {
      process.env.FIGMA_WEBHOOK_SECRET = 'figma-webhook-secret-value';

      const { verifyFigmaSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq({
        headers: {},
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyFigmaSignature(req as unknown as Request, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid webhook signature' });
    });
  });

  describe('verifyDatadogSignature', () => {
    it('passes with valid HMAC-SHA256 signature (no prefix)', async () => {
      const secret = 'datadog-test-secret';
      process.env.DATADOG_WEBHOOK_SECRET = secret;

      const { verifyDatadogSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from(JSON.stringify({ title: 'Alert' }));
      const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');

      const req = createMockReq({
        headers: { 'x-datadog-signature': hmac },
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyDatadogSignature(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid signature', async () => {
      process.env.DATADOG_WEBHOOK_SECRET = 'datadog-test-secret';

      const { verifyDatadogSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from('{}');
      const req = createMockReq({
        headers: { 'x-datadog-signature': 'invalidsignature' },
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyDatadogSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('skips verification when env var is not set', async () => {
      delete process.env.DATADOG_WEBHOOK_SECRET;

      const { verifyDatadogSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      verifyDatadogSignature(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when signature header is missing', async () => {
      process.env.DATADOG_WEBHOOK_SECRET = 'datadog-test-secret';

      const { verifyDatadogSignature } = await import('../middleware/webhook-signature');

      const body = Buffer.from('{}');
      const req = createMockReq({
        headers: {},
        rawBody: body,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyDatadogSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when rawBody is missing', async () => {
      process.env.DATADOG_WEBHOOK_SECRET = 'datadog-test-secret';

      const { verifyDatadogSignature } = await import('../middleware/webhook-signature');

      const req = createMockReq({
        headers: { 'x-datadog-signature': 'somesig' },
        rawBody: undefined,
      });
      const res = createMockRes();
      const next = vi.fn();

      verifyDatadogSignature(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });
  });
});
