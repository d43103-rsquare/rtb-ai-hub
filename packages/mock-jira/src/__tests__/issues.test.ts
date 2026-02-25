import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { MockJiraStore } from '../store';
import { createApp } from '../app';

const DATA_DIR = path.join(__dirname, '../../data/test-api');

describe('Issue REST API', () => {
  let store: MockJiraStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new MockJiraStore(DATA_DIR);
    store.reset();
    app = createApp(store);
  });

  it('POST /rest/api/3/issue — creates issue, returns 201 with key', async () => {
    const res = await request(app)
      .post('/rest/api/3/issue')
      .send({
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'My first issue',
          description: 'Some description',
          labels: ['backend'],
          priority: { name: 'High' },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      key: 'TEST-1',
      self: '/rest/api/3/issue/TEST-1',
    });
  });

  it('GET /rest/api/3/issue/:key — returns issue', async () => {
    // Create first
    await request(app)
      .post('/rest/api/3/issue')
      .send({
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Get me',
        },
      });

    const res = await request(app).get('/rest/api/3/issue/TEST-1');

    expect(res.status).toBe(200);
    expect(res.body.key).toBe('TEST-1');
    expect(res.body.fields.summary).toBe('Get me');
    expect(res.body.fields.status.name).toBe('Open');
  });

  it('GET /rest/api/3/issue/:key — returns 404 for missing', async () => {
    const res = await request(app).get('/rest/api/3/issue/NOPE-999');

    expect(res.status).toBe(404);
    expect(res.body.errorMessages).toBeDefined();
  });

  it('PUT /rest/api/3/issue/:key — updates fields, returns 204', async () => {
    // Create first
    await request(app)
      .post('/rest/api/3/issue')
      .send({
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Original',
        },
      });

    const res = await request(app)
      .put('/rest/api/3/issue/TEST-1')
      .send({
        fields: {
          summary: 'Updated summary',
          labels: ['frontend', 'urgent'],
        },
      });

    expect(res.status).toBe(204);

    // Verify the update
    const getRes = await request(app).get('/rest/api/3/issue/TEST-1');
    expect(getRes.body.fields.summary).toBe('Updated summary');
    expect(getRes.body.fields.labels).toEqual(['frontend', 'urgent']);
  });

  it('GET /rest/api/3/issue/:key/transitions — returns transitions', async () => {
    // Create an issue (starts as Open)
    await request(app)
      .post('/rest/api/3/issue')
      .send({
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Transition me',
        },
      });

    const res = await request(app).get('/rest/api/3/issue/TEST-1/transitions');

    expect(res.status).toBe(200);
    expect(res.body.transitions).toBeInstanceOf(Array);
    expect(res.body.transitions.length).toBeGreaterThan(0);
    expect(res.body.transitions[0]).toHaveProperty('id');
    expect(res.body.transitions[0]).toHaveProperty('name');
  });

  it('POST /rest/api/3/issue/:key/transitions — transitions issue', async () => {
    // Create an issue (starts as Open)
    await request(app)
      .post('/rest/api/3/issue')
      .send({
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Move me',
        },
      });

    // Transition from Open -> In Progress (id: 11)
    const res = await request(app)
      .post('/rest/api/3/issue/TEST-1/transitions')
      .send({ transition: { id: '11' } });

    expect(res.status).toBe(204);

    // Verify status changed
    const getRes = await request(app).get('/rest/api/3/issue/TEST-1');
    expect(getRes.body.fields.status.name).toBe('In Progress');
  });

  it('POST /rest/api/3/issue/:key/comment — adds comment', async () => {
    // Create an issue
    await request(app)
      .post('/rest/api/3/issue')
      .send({
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Comment on me',
        },
      });

    const res = await request(app)
      .post('/rest/api/3/issue/TEST-1/comment')
      .send({ body: 'This is a test comment' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      body: 'This is a test comment',
      author: expect.objectContaining({ displayName: expect.any(String) }),
    });
  });
});
