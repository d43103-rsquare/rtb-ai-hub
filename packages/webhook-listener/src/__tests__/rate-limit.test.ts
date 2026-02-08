import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

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

import { webhookRateLimit, healthRateLimit, apiRateLimit } from '../middleware/rate-limit';

function createApp(middleware: express.RequestHandler) {
  const app = express();
  app.use(middleware);
  app.get('/test', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('Rate Limit Middleware', () => {
  describe('webhookRateLimit', () => {
    it('exists as express middleware', () => {
      expect(typeof webhookRateLimit).toBe('function');
    });

    it('allows requests under the limit', async () => {
      const app = createApp(webhookRateLimit);
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('returns 429 with correct body when limit exceeded (100 req / 15 min)', async () => {
      const app = createApp(webhookRateLimit);

      for (let i = 0; i < 100; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests');
      expect(res.body).toHaveProperty('retryAfter');
      expect(typeof res.body.retryAfter).toBe('number');
    });
  });

  describe('healthRateLimit', () => {
    it('exists as express middleware', () => {
      expect(typeof healthRateLimit).toBe('function');
    });

    it('allows requests under the limit', async () => {
      const app = createApp(healthRateLimit);
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });

    it('returns 429 with correct body when limit exceeded (60 req / 1 min)', async () => {
      const app = createApp(healthRateLimit);

      for (let i = 0; i < 60; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests');
      expect(res.body).toHaveProperty('retryAfter');
      expect(typeof res.body.retryAfter).toBe('number');
    });
  });

  describe('apiRateLimit', () => {
    it('exists as express middleware', () => {
      expect(typeof apiRateLimit).toBe('function');
    });

    it('allows requests under the limit', async () => {
      const app = createApp(apiRateLimit);
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });

    it('returns 429 with correct body when limit exceeded (30 req / 1 min)', async () => {
      const app = createApp(apiRateLimit);

      for (let i = 0; i < 30; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests');
      expect(res.body).toHaveProperty('retryAfter');
      expect(typeof res.body.retryAfter).toBe('number');
    });
  });
});
