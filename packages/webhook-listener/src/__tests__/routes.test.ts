import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createFigmaRouter } from '../routes/figma';
import { createJiraRouter } from '../routes/jira';
import { createGitHubRouter } from '../routes/github';
import { createDatadogRouter } from '../routes/datadog';

vi.mock('../middleware/auth', () => ({
  optionalAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  AuthRequest: {},
}));

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

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    name: 'test-queue',
  };
}

function createTestApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      log: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    });
    next();
  });
  app.use(router);
  return app;
}

describe('Figma webhook route', () => {
  let mockQueue: ReturnType<typeof createMockQueue>;
  let app: express.Express;

  beforeEach(() => {
    mockQueue = createMockQueue();
    app = createTestApp(createFigmaRouter(mockQueue as never));
  });

  it('returns 202 for valid payload', async () => {
    const res = await request(app).post('/webhooks/figma').send({
      event_type: 'FILE_UPDATE',
      file_key: 'abc123',
      file_name: 'My Design',
    });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.eventId).toBe('abc123');
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'figma-event',
      expect.objectContaining({
        event: expect.objectContaining({
          source: 'figma',
          fileKey: 'abc123',
          fileName: 'My Design',
        }),
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^figma_/),
      })
    );
  });

  it('returns 400 for invalid payload (missing file_key)', async () => {
    const res = await request(app).post('/webhooks/figma').send({
      event_type: 'FILE_UPDATE',
      file_name: 'My Design',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 500 when queue.add fails', async () => {
    mockQueue.add.mockRejectedValue(new Error('Redis connection failed'));

    const res = await request(app).post('/webhooks/figma').send({
      event_type: 'FILE_UPDATE',
      file_key: 'abc123',
      file_name: 'My Design',
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('applies default event_type when omitted', async () => {
    const res = await request(app).post('/webhooks/figma').send({
      file_key: 'abc123',
      file_name: 'My Design',
    });

    expect(res.status).toBe(202);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'figma-event',
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'FILE_UPDATE',
        }),
      }),
      expect.any(Object)
    );
  });
});

describe('Jira webhook route', () => {
  let mockQueue: ReturnType<typeof createMockQueue>;
  let app: express.Express;

  beforeEach(() => {
    mockQueue = createMockQueue();
    app = createTestApp(createJiraRouter(mockQueue as never));
  });

  it('returns 202 for valid payload', async () => {
    const res = await request(app)
      .post('/webhooks/jira')
      .send({
        webhookEvent: 'issue_updated',
        issue: {
          key: 'PROJ-123',
          fields: {
            status: { name: 'In Progress' },
            summary: 'Implement login page',
          },
        },
      });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.eventId).toBe('PROJ-123');
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('returns 202 for minimal payload (passthrough schema)', async () => {
    const res = await request(app).post('/webhooks/jira').send({
      webhookEvent: 'project_created',
    });

    expect(res.status).toBe(202);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when queue.add fails', async () => {
    mockQueue.add.mockRejectedValue(new Error('Queue error'));

    const res = await request(app)
      .post('/webhooks/jira')
      .send({
        webhookEvent: 'issue_updated',
        issue: {
          key: 'PROJ-123',
          fields: { summary: 'Test' },
        },
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('GitHub webhook route', () => {
  let mockQueue: ReturnType<typeof createMockQueue>;
  let app: express.Express;

  beforeEach(() => {
    mockQueue = createMockQueue();
    app = createTestApp(createGitHubRouter(mockQueue as never));
  });

  it('returns 202 for valid pull_request payload', async () => {
    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'pull_request')
      .send({
        action: 'opened',
        repository: { full_name: 'org/repo' },
        pull_request: {
          number: 42,
          title: 'Add authentication',
          head: { ref: 'feature/auth', sha: 'abc123' },
        },
      });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'github-event',
      expect.objectContaining({
        event: expect.objectContaining({
          source: 'github',
          type: 'pull_request',
          repository: 'org/repo',
          prNumber: 42,
          prTitle: 'Add authentication',
        }),
      }),
      expect.any(Object)
    );
  });

  it('returns 202 for deployment payload', async () => {
    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'deployment')
      .send({
        action: 'created',
        deployment: {
          ref: 'main',
          sha: 'def456',
        },
      });

    expect(res.status).toBe(202);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('returns 202 for minimal payload', async () => {
    const res = await request(app).post('/webhooks/github').send({});

    expect(res.status).toBe(202);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when queue.add fails', async () => {
    mockQueue.add.mockRejectedValue(new Error('Queue error'));

    const res = await request(app).post('/webhooks/github').send({ action: 'opened' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('Datadog webhook route', () => {
  let mockQueue: ReturnType<typeof createMockQueue>;
  let app: express.Express;

  beforeEach(() => {
    mockQueue = createMockQueue();
    app = createTestApp(createDatadogRouter(mockQueue as never));
  });

  it('returns 202 for valid payload', async () => {
    const res = await request(app).post('/webhooks/datadog').send({
      title: 'High error rate detected',
      priority: 'P1',
      event_type: 'alert',
      id: 'alert-001',
    });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.eventId).toBe('alert-001');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'datadog-event',
      expect.objectContaining({
        event: expect.objectContaining({
          source: 'datadog',
          title: 'High error rate detected',
          priority: 'P1',
        }),
      }),
      expect.any(Object)
    );
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/webhooks/datadog').send({
      priority: 'P1',
      event_type: 'alert',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('applies default priority and event_type', async () => {
    const res = await request(app).post('/webhooks/datadog').send({
      title: 'Alert triggered',
    });

    expect(res.status).toBe(202);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'datadog-event',
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'alert',
          priority: 'P2',
        }),
      }),
      expect.any(Object)
    );
  });

  it('extracts service from tags', async () => {
    const res = await request(app)
      .post('/webhooks/datadog')
      .send({
        title: 'Alert',
        tags: ['service:api-gateway', 'env:prod'],
      });

    expect(res.status).toBe(202);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'datadog-event',
      expect.objectContaining({
        event: expect.objectContaining({
          service: 'api-gateway',
        }),
      }),
      expect.any(Object)
    );
  });

  it('returns 500 when queue.add fails', async () => {
    mockQueue.add.mockRejectedValue(new Error('Queue error'));

    const res = await request(app).post('/webhooks/datadog').send({
      title: 'Alert',
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
