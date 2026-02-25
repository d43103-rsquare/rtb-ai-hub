import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { MockJiraStore } from '../store';
import { createApp } from '../app';

const DATA_DIR = path.join(__dirname, '../../data/test-search');

describe('Search & Users routes', () => {
  let store: MockJiraStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new MockJiraStore(DATA_DIR);
    store.reset();
    app = createApp(store);

    // Seed test data
    store.createIssue({ project: 'PROJ', summary: 'Task A', issuetype: 'Task' });
    store.createIssue({ project: 'PROJ', summary: 'Bug B', issuetype: 'Bug' });
    store.createIssue({ project: 'OTHER', summary: 'Task C', issuetype: 'Task' });

    // Transition PROJ-1 to "In Progress"
    store.transitionIssue('PROJ-1', '11');
  });

  describe('GET /rest/api/3/search', () => {
    it('filters by project via jql', async () => {
      const res = await request(app).get('/rest/api/3/search').query({ jql: 'project = PROJ' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.issues).toHaveLength(2);
      expect(res.body.issues.every((i: any) => i.fields.project.key === 'PROJ')).toBe(true);
    });

    it('filters by status via jql', async () => {
      const res = await request(app)
        .get('/rest/api/3/search')
        .query({ jql: 'status = "In Progress"' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.issues[0].key).toBe('PROJ-1');
      expect(res.body.issues[0].fields.status.name).toBe('In Progress');
    });

    it('returns all issues when no jql is provided', async () => {
      const res = await request(app).get('/rest/api/3/search');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.issues).toHaveLength(3);
      expect(res.body.startAt).toBe(0);
      expect(res.body.maxResults).toBe(3);
    });
  });

  describe('GET /rest/api/3/user/search', () => {
    it('returns mock user with accountId', async () => {
      const res = await request(app).get('/rest/api/3/user/search');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual({
        accountId: 'mock-user-001',
        emailAddress: 'mock@rtb-ai-hub.local',
        displayName: 'Mock User',
        active: true,
      });
    });
  });
});
