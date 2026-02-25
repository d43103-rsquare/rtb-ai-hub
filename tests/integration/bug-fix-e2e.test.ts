import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockJiraStore } from '../../packages/mock-jira/src/store';
import type { Server } from 'http';
import type { Express } from 'express';
import path from 'path';

const DATA_DIR = path.join(__dirname, '.data-bug-fix-e2e');

let store: MockJiraStore;
let server: Server;
let baseUrl: string;

describe('Bug Fix E2E: Mock Jira Integration', () => {
  beforeAll(async () => {
    // Override WEBHOOK_LISTENER_URL to point at an unused port so the
    // webhook trigger route always gets a connection-refused error.
    // We must set this BEFORE the webhook-trigger module is loaded,
    // because it captures the env var at module scope.
    process.env.WEBHOOK_LISTENER_URL = 'http://127.0.0.1:19999';

    // Dynamic import so env var is captured correctly
    const { createApp } = await import('../../packages/mock-jira/src/app');

    store = new MockJiraStore(DATA_DIR);
    store.reset();
    const app: Express = createApp(store);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    store.reset();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    delete process.env.WEBHOOK_LISTENER_URL;
  });

  // ─── Test 1: Mock Jira API works end-to-end ────────────────────────

  describe('Mock Jira API end-to-end', () => {
    it('should create, get, transition, comment, and verify final state', async () => {
      // 1. Create an issue
      const createRes = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: 'BUG' },
            issuetype: { name: 'Bug' },
            summary: 'Login button not responding on mobile',
            description: 'Users report the login button is unresponsive on iOS Safari.',
            labels: ['bug', 'mobile'],
            priority: { name: 'High' },
          },
        }),
      });

      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.key).toBe('BUG-1');
      expect(created.id).toBeDefined();

      // 2. Get the issue and verify fields
      const getRes = await fetch(`${baseUrl}/rest/api/3/issue/${created.key}`);
      expect(getRes.status).toBe(200);

      const issue = await getRes.json();
      expect(issue.key).toBe('BUG-1');
      expect(issue.fields.summary).toBe('Login button not responding on mobile');
      expect(issue.fields.issuetype.name).toBe('Bug');
      expect(issue.fields.status.name).toBe('Open');
      expect(issue.fields.labels).toEqual(['bug', 'mobile']);
      expect(issue.fields.priority.name).toBe('High');
      expect(issue.fields.project.key).toBe('BUG');

      // 3. Transition: Open -> In Progress (id: 11)
      const transitionRes = await fetch(
        `${baseUrl}/rest/api/3/issue/${created.key}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: '11' } }),
        },
      );
      expect(transitionRes.status).toBe(204);

      // 4. Add a comment
      const commentRes = await fetch(
        `${baseUrl}/rest/api/3/issue/${created.key}/comment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: 'Investigating the root cause on iOS Safari 17.' }),
        },
      );
      expect(commentRes.status).toBe(201);
      const comment = await commentRes.json();
      expect(comment.body).toBe('Investigating the root cause on iOS Safari 17.');
      expect(comment.author.displayName).toBeDefined();

      // 5. Verify final state
      const finalRes = await fetch(`${baseUrl}/rest/api/3/issue/${created.key}`);
      const finalIssue = await finalRes.json();

      expect(finalIssue.fields.status.name).toBe('In Progress');
      expect(finalIssue.fields.comment.comments).toHaveLength(1);
      expect(finalIssue.fields.comment.comments[0].body).toBe(
        'Investigating the root cause on iOS Safari 17.',
      );
    });
  });

  // ─── Test 2: Webhook trigger builds correct payload ────────────────

  describe('Webhook trigger payload', () => {
    it('should return 502 when webhook-listener is unreachable', async () => {
      // Create an issue first
      const createRes = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: 'WH' },
            issuetype: { name: 'Task' },
            summary: 'Webhook trigger test issue',
          },
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();

      // Trigger webhook — webhook-listener is not running on port 19999,
      // so expect 502 (connection refused)
      const triggerRes = await fetch(`${baseUrl}/mock/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: created.key,
          event: 'issue_created',
        }),
      });

      expect(triggerRes.status).toBe(502);
      const triggerBody = await triggerRes.json();
      expect(triggerBody.triggered).toBe(false);
      expect(triggerBody.error).toBeDefined();
      expect(typeof triggerBody.error).toBe('string');
    });

    it('should return 404 for non-existent issue', async () => {
      const triggerRes = await fetch(`${baseUrl}/mock/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: 'NOPE-999',
          event: 'issue_created',
        }),
      });

      expect(triggerRes.status).toBe(404);
      const body = await triggerRes.json();
      expect(body.error).toContain('NOPE-999');
    });
  });

  // ─── Test 3: Search and filter ─────────────────────────────────────

  describe('Search and filter', () => {
    it('should create 3 issues and filter by project and status', async () => {
      // Create 3 issues with different types in project SEARCH
      const issueTypes = [
        { type: 'Bug', summary: 'Search Bug issue' },
        { type: 'Story', summary: 'Search Story issue' },
        { type: 'Task', summary: 'Search Task issue' },
      ];

      const createdKeys: string[] = [];

      for (const { type, summary } of issueTypes) {
        const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              project: { key: 'SEARCH' },
              issuetype: { name: type },
              summary,
            },
          }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        createdKeys.push(body.key);
      }

      expect(createdKeys).toEqual(['SEARCH-1', 'SEARCH-2', 'SEARCH-3']);

      // Search by project
      const searchRes = await fetch(
        `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent('project = SEARCH')}`,
      );
      expect(searchRes.status).toBe(200);
      const searchBody = await searchRes.json();
      expect(searchBody.total).toBe(3);
      expect(searchBody.issues).toHaveLength(3);

      // Transition SEARCH-1 (Bug) to In Progress
      const transRes = await fetch(
        `${baseUrl}/rest/api/3/issue/SEARCH-1/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: '11' } }),
        },
      );
      expect(transRes.status).toBe(204);

      // Search by status = "In Progress" in SEARCH project
      const statusSearchRes = await fetch(
        `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent('project = SEARCH AND status = "In Progress"')}`,
      );
      expect(statusSearchRes.status).toBe(200);
      const statusBody = await statusSearchRes.json();
      expect(statusBody.total).toBe(1);
      expect(statusBody.issues[0].key).toBe('SEARCH-1');
      expect(statusBody.issues[0].fields.status.name).toBe('In Progress');

      // Search by status = "Open" — should have 2 remaining
      const openSearchRes = await fetch(
        `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent('project = SEARCH AND status = "Open"')}`,
      );
      expect(openSearchRes.status).toBe(200);
      const openBody = await openSearchRes.json();
      expect(openBody.total).toBe(2);
    });
  });
});
