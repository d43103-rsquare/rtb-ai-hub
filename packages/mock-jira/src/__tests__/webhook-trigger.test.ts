import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import request from 'supertest';
import { MockJiraStore } from '../store';
import { createApp } from '../app';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-trigger');

describe('webhookTriggerRouter', () => {
  let store: MockJiraStore;
  let app: ReturnType<typeof createApp>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new MockJiraStore(TEST_DATA_DIR);
    store.reset();
    app = createApp(store);

    mockFetch = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal('fetch', mockFetch);
  });

  it('sends webhook payload to webhook-listener', async () => {
    store.createIssue({
      project: 'WH',
      summary: 'Webhook test issue',
      issuetype: 'Task',
    });

    const res = await request(app).post('/mock/trigger').send({ issueKey: 'WH-1' });

    expect(res.status).toBe(200);
    expect(res.body.triggered).toBe(true);
    expect(res.body.webhookStatus).toBe(200);

    // Verify fetch was called with correct URL
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/webhooks/jira');
    expect(url).toContain('env=int');

    // Verify webhook body
    const body = JSON.parse(options.body);
    expect(body.webhookEvent).toBe('issue_updated');
    expect(body.issue.key).toBe('WH-1');
    expect(body.issue.fields.summary).toBe('Webhook test issue');
  });

  it('returns 404 for non-existent issue', async () => {
    const res = await request(app).post('/mock/trigger').send({ issueKey: 'NOPE-999' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('NOPE-999');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports webhook failure with 502', async () => {
    store.createIssue({
      project: 'WH',
      summary: 'Fail test',
      issuetype: 'Bug',
    });

    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).post('/mock/trigger').send({ issueKey: 'WH-1' });

    expect(res.status).toBe(502);
    expect(res.body.triggered).toBe(false);
    expect(res.body.error).toBe('Connection refused');
  });
});
