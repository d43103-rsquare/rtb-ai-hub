import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { internalAuth } from '../middleware/internal-auth';

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

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/test', internalAuth, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('internalAuth middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('passes through when RTB_INTERNAL_API_TOKEN is not set', async () => {
    delete process.env.RTB_INTERNAL_API_TOKEN;
    const app = createTestApp();

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 401 when token is set but no Authorization header provided', async () => {
    process.env.RTB_INTERNAL_API_TOKEN = 'secret-token';
    const app = createTestApp();

    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing Authorization header');
  });

  it('returns 403 when token does not match', async () => {
    process.env.RTB_INTERNAL_API_TOKEN = 'secret-token';
    const app = createTestApp();

    const res = await request(app).get('/test').set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid API token');
  });

  it('passes through when token matches', async () => {
    process.env.RTB_INTERNAL_API_TOKEN = 'secret-token';
    const app = createTestApp();

    const res = await request(app).get('/test').set('Authorization', 'Bearer secret-token');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 401 when Authorization header is not Bearer format', async () => {
    process.env.RTB_INTERNAL_API_TOKEN = 'secret-token';
    const app = createTestApp();

    const res = await request(app).get('/test').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing Authorization header');
  });
});
