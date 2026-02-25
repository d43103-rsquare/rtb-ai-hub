# Mock Jira Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local mock Jira server with REST API + web UI for end-to-end bug-fix workflow testing.

**Architecture:** Express server on `:3001` with JSON file storage, Jira REST API v3 endpoints, webhook trigger to webhook-listener, and server-side HTML UI with Tailwind CDN. Dashboard proxies `/mock-jira` to mock server when `MOCK_JIRA=true`.

**Tech Stack:** Express, TypeScript, JSON file storage, Tailwind CDN (no build), Vitest

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/mock-jira/package.json`
- Create: `packages/mock-jira/tsconfig.json`
- Create: `packages/mock-jira/vitest.config.ts`
- Create: `packages/mock-jira/data/.gitkeep`
- Modify: `vitest.workspace.ts`
- Modify: `.gitignore`
- Modify: `package.json` (root — add `dev:mock-jira` script)

**Step 1: Create package.json**

```json
{
  "name": "@rtb-ai-hub/mock-jira",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "pino": "^9.2.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.10.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/__tests__/**"]
}
```

**Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['dist/**', 'node_modules/**'],
  },
});
```

**Step 4: Create data/.gitkeep**

Empty file.

**Step 5: Add to vitest.workspace.ts**

Add `'packages/mock-jira'` to the array.

**Step 6: Add to .gitignore**

```
packages/mock-jira/data/*.json
```

**Step 7: Add root scripts**

In root `package.json`, add:
```json
"dev:mock-jira": "pnpm --filter @rtb-ai-hub/mock-jira run dev"
```

**Step 8: Install dependencies**

Run: `pnpm install`

**Step 9: Commit**

```bash
git add packages/mock-jira/ vitest.workspace.ts .gitignore package.json pnpm-lock.yaml
git commit -m "feat(mock-jira): scaffold package with dependencies"
```

---

### Task 2: Store — JSON File CRUD

**Files:**
- Create: `packages/mock-jira/src/store.ts`
- Create: `packages/mock-jira/src/__tests__/store.test.ts`

**Step 1: Write the failing test**

```ts
// packages/mock-jira/src/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MockJiraStore } from '../store';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test');

describe('MockJiraStore', () => {
  let store: MockJiraStore;

  beforeEach(() => {
    store = new MockJiraStore(TEST_DATA_DIR);
    store.reset();
  });

  describe('createIssue', () => {
    it('creates an issue with auto-incremented key', () => {
      const issue = store.createIssue({
        projectKey: 'PROJ',
        issueType: 'Bug',
        summary: 'Test bug',
        description: 'A test bug description',
        labels: ['bug'],
        priority: 'High',
      });

      expect(issue.key).toBe('PROJ-1');
      expect(issue.id).toBe('10001');
      expect(issue.fields.issuetype.name).toBe('Bug');
      expect(issue.fields.status.name).toBe('Open');
      expect(issue.fields.summary).toBe('Test bug');
      expect(issue.fields.labels).toEqual(['bug']);
    });

    it('increments key per project', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'First' });
      const second = store.createIssue({ projectKey: 'PROJ', issueType: 'Task', summary: 'Second' });
      expect(second.key).toBe('PROJ-2');
    });
  });

  describe('getIssue', () => {
    it('returns issue by key', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Find me' });
      const found = store.getIssue('PROJ-1');
      expect(found).not.toBeNull();
      expect(found!.fields.summary).toBe('Find me');
    });

    it('returns null for non-existent key', () => {
      expect(store.getIssue('PROJ-999')).toBeNull();
    });
  });

  describe('updateIssue', () => {
    it('updates fields', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Original' });
      const updated = store.updateIssue('PROJ-1', { summary: 'Updated', labels: ['fixed'] });
      expect(updated!.fields.summary).toBe('Updated');
      expect(updated!.fields.labels).toEqual(['fixed']);
    });
  });

  describe('transitions', () => {
    it('returns available transitions for current status', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Trans test' });
      const transitions = store.getTransitions('PROJ-1');
      expect(transitions.length).toBeGreaterThan(0);
      expect(transitions.some(t => t.to.name === 'In Progress')).toBe(true);
    });

    it('transitions issue to new status', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Trans test' });
      const transitions = store.getTransitions('PROJ-1');
      const toInProgress = transitions.find(t => t.to.name === 'In Progress')!;
      store.transitionIssue('PROJ-1', toInProgress.id);
      const issue = store.getIssue('PROJ-1');
      expect(issue!.fields.status.name).toBe('In Progress');
    });
  });

  describe('comments', () => {
    it('adds a comment to an issue', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Comment test' });
      const comment = store.addComment('PROJ-1', 'This is a comment');
      expect(comment.body).toBe('This is a comment');
      expect(comment.id).toBeTruthy();

      const issue = store.getIssue('PROJ-1');
      expect(issue!.fields.comment.comments).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('finds issues by project', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'A bug' });
      store.createIssue({ projectKey: 'OTHER', issueType: 'Task', summary: 'A task' });
      const results = store.search({ project: 'PROJ' });
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('PROJ-1');
    });

    it('finds issues by status', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Open bug' });
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'WIP bug' });
      const transitions = store.getTransitions('PROJ-2');
      store.transitionIssue('PROJ-2', transitions.find(t => t.to.name === 'In Progress')!.id);
      const results = store.search({ project: 'PROJ', status: 'In Progress' });
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('PROJ-2');
    });

    it('finds issues by issuetype', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'A bug' });
      store.createIssue({ projectKey: 'PROJ', issueType: 'Story', summary: 'A story' });
      const results = store.search({ project: 'PROJ', issuetype: 'Bug' });
      expect(results).toHaveLength(1);
    });
  });

  describe('listAll', () => {
    it('returns all issues', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'One' });
      store.createIssue({ projectKey: 'PROJ', issueType: 'Task', summary: 'Two' });
      expect(store.listAll()).toHaveLength(2);
    });
  });

  describe('persistence', () => {
    it('persists data to JSON file and reloads', () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Persistent' });

      const store2 = new MockJiraStore(TEST_DATA_DIR);
      const issue = store2.getIssue('PROJ-1');
      expect(issue).not.toBeNull();
      expect(issue!.fields.summary).toBe('Persistent');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/store.test.ts`
Expected: FAIL — cannot find module `../store`

**Step 3: Write implementation**

```ts
// packages/mock-jira/src/store.ts
import * as fs from 'fs';
import * as path from 'path';

export interface JiraIssueFields {
  issuetype: { name: string };
  status: { name: string };
  summary: string;
  description: string;
  project: { key: string };
  labels: string[];
  priority: { name: string };
  components: { id: string; name: string }[];
  comment: { comments: JiraComment[] };
  created: string;
  updated: string;
  [key: string]: unknown;
}

export interface JiraIssue {
  key: string;
  id: string;
  fields: JiraIssueFields;
}

export interface JiraComment {
  id: string;
  body: string;
  author: { displayName: string; emailAddress: string };
  created: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface CreateIssueInput {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  labels?: string[];
  priority?: string;
  parentKey?: string;
}

interface SearchQuery {
  project?: string;
  status?: string;
  issuetype?: string;
}

interface StoreData {
  issues: JiraIssue[];
  counters: Record<string, number>;  // projectKey → next number
  idCounter: number;
}

const TRANSITIONS: Record<string, JiraTransition[]> = {
  'Open': [
    { id: '11', name: 'Start Progress', to: { name: 'In Progress' } },
    { id: '51', name: 'Close', to: { name: 'Closed' } },
  ],
  'In Progress': [
    { id: '21', name: 'Submit for Review', to: { name: 'In Review' } },
    { id: '51', name: 'Close', to: { name: 'Closed' } },
  ],
  'In Review': [
    { id: '31', name: 'Done', to: { name: 'Done' } },
    { id: '12', name: 'Reopen', to: { name: 'In Progress' } },
  ],
  'Done': [],
  'Closed': [],
};

const MOCK_USER = {
  displayName: 'Mock User',
  emailAddress: 'mock@rtb-ai-hub.local',
};

export class MockJiraStore {
  private dataDir: string;
  private filePath: string;
  private data: StoreData;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(__dirname, '../data');
    this.filePath = path.join(this.dataDir, 'store.json');
    this.data = this.load();
  }

  private load(): StoreData {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    }
    return { issues: [], counters: {}, idCounter: 10000 };
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  reset(): void {
    this.data = { issues: [], counters: {}, idCounter: 10000 };
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }

  createIssue(input: CreateIssueInput): JiraIssue {
    const { projectKey, issueType, summary, description, labels, priority, parentKey } = input;
    const num = (this.data.counters[projectKey] || 0) + 1;
    this.data.counters[projectKey] = num;
    this.data.idCounter += 1;

    const now = new Date().toISOString();
    const issue: JiraIssue = {
      key: `${projectKey}-${num}`,
      id: String(this.data.idCounter),
      fields: {
        issuetype: { name: issueType },
        status: { name: 'Open' },
        summary,
        description: description || '',
        project: { key: projectKey },
        labels: labels || [],
        priority: { name: priority || 'Medium' },
        components: [],
        comment: { comments: [] },
        created: now,
        updated: now,
      },
    };

    if (parentKey) {
      issue.fields.parent = { key: parentKey };
    }

    this.data.issues.push(issue);
    this.save();
    return issue;
  }

  getIssue(key: string): JiraIssue | null {
    return this.data.issues.find(i => i.key === key) || null;
  }

  updateIssue(key: string, updates: Partial<Pick<JiraIssueFields, 'summary' | 'description' | 'labels' | 'priority'>>): JiraIssue | null {
    const issue = this.getIssue(key);
    if (!issue) return null;

    if (updates.summary !== undefined) issue.fields.summary = updates.summary;
    if (updates.description !== undefined) issue.fields.description = updates.description as string;
    if (updates.labels !== undefined) issue.fields.labels = updates.labels;
    if (updates.priority !== undefined) issue.fields.priority = updates.priority as { name: string };
    issue.fields.updated = new Date().toISOString();

    this.save();
    return issue;
  }

  getTransitions(key: string): JiraTransition[] {
    const issue = this.getIssue(key);
    if (!issue) return [];
    return TRANSITIONS[issue.fields.status.name] || [];
  }

  transitionIssue(key: string, transitionId: string): boolean {
    const issue = this.getIssue(key);
    if (!issue) return false;

    const available = this.getTransitions(key);
    const transition = available.find(t => t.id === transitionId);
    if (!transition) return false;

    issue.fields.status = { name: transition.to.name };
    issue.fields.updated = new Date().toISOString();
    this.save();
    return true;
  }

  addComment(key: string, body: string): JiraComment {
    const issue = this.getIssue(key);
    if (!issue) throw new Error(`Issue not found: ${key}`);

    const comment: JiraComment = {
      id: String(Date.now()),
      body,
      author: MOCK_USER,
      created: new Date().toISOString(),
    };

    issue.fields.comment.comments.push(comment);
    issue.fields.updated = new Date().toISOString();
    this.save();
    return comment;
  }

  search(query: SearchQuery): JiraIssue[] {
    return this.data.issues.filter(issue => {
      if (query.project && issue.fields.project.key !== query.project) return false;
      if (query.status && issue.fields.status.name !== query.status) return false;
      if (query.issuetype && issue.fields.issuetype.name !== query.issuetype) return false;
      return true;
    });
  }

  listAll(): JiraIssue[] {
    return [...this.data.issues];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/store.test.ts`
Expected: All 11 tests PASS

**Step 5: Commit**

```bash
git add packages/mock-jira/src/store.ts packages/mock-jira/src/__tests__/store.test.ts
git commit -m "feat(mock-jira): add JSON file-based issue store with CRUD"
```

---

### Task 3: REST API Routes — Issues

**Files:**
- Create: `packages/mock-jira/src/routes/issues.ts`
- Create: `packages/mock-jira/src/__tests__/issues.test.ts`
- Create: `packages/mock-jira/src/app.ts` (Express app without listen — for testing)

**Step 1: Write the failing test**

```ts
// packages/mock-jira/src/__tests__/issues.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { MockJiraStore } from '../store';
import * as path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-api');

describe('Issues API', () => {
  let app: ReturnType<typeof createApp>;
  let store: MockJiraStore;

  beforeEach(() => {
    store = new MockJiraStore(TEST_DATA_DIR);
    store.reset();
    app = createApp(store);
  });

  describe('POST /rest/api/3/issue', () => {
    it('creates an issue', async () => {
      const res = await request(app)
        .post('/rest/api/3/issue')
        .send({
          fields: {
            project: { key: 'PROJ' },
            issuetype: { name: 'Bug' },
            summary: 'Test bug',
            description: 'A bug description',
            labels: ['bug'],
            priority: { name: 'High' },
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.key).toBe('PROJ-1');
      expect(res.body.id).toBeTruthy();
    });
  });

  describe('GET /rest/api/3/issue/:issueKey', () => {
    it('returns issue by key', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Find me' });

      const res = await request(app).get('/rest/api/3/issue/PROJ-1');
      expect(res.status).toBe(200);
      expect(res.body.key).toBe('PROJ-1');
      expect(res.body.fields.summary).toBe('Find me');
    });

    it('returns 404 for missing issue', async () => {
      const res = await request(app).get('/rest/api/3/issue/PROJ-999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /rest/api/3/issue/:issueKey', () => {
    it('updates issue fields', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Original' });

      const res = await request(app)
        .put('/rest/api/3/issue/PROJ-1')
        .send({ fields: { summary: 'Updated' } });

      expect(res.status).toBe(204);
      expect(store.getIssue('PROJ-1')!.fields.summary).toBe('Updated');
    });
  });

  describe('GET /rest/api/3/issue/:issueKey/transitions', () => {
    it('returns available transitions', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Trans test' });

      const res = await request(app).get('/rest/api/3/issue/PROJ-1/transitions');
      expect(res.status).toBe(200);
      expect(res.body.transitions.length).toBeGreaterThan(0);
    });
  });

  describe('POST /rest/api/3/issue/:issueKey/transitions', () => {
    it('transitions issue', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Trans test' });
      const transitions = store.getTransitions('PROJ-1');
      const toInProgress = transitions.find(t => t.to.name === 'In Progress')!;

      const res = await request(app)
        .post('/rest/api/3/issue/PROJ-1/transitions')
        .send({ transition: { id: toInProgress.id } });

      expect(res.status).toBe(204);
      expect(store.getIssue('PROJ-1')!.fields.status.name).toBe('In Progress');
    });
  });

  describe('POST /rest/api/3/issue/:issueKey/comment', () => {
    it('adds a comment', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Comment test' });

      const res = await request(app)
        .post('/rest/api/3/issue/PROJ-1/comment')
        .send({ body: 'Hello from test' });

      expect(res.status).toBe(201);
      expect(res.body.body).toBe('Hello from test');
      expect(res.body.id).toBeTruthy();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/issues.test.ts`
Expected: FAIL — cannot find module `../app`

**Step 3: Write app.ts and routes/issues.ts**

```ts
// packages/mock-jira/src/app.ts
import express from 'express';
import cors from 'cors';
import { MockJiraStore } from './store';
import { issuesRouter } from './routes/issues';
import { searchRouter } from './routes/search';
import { usersRouter } from './routes/users';
import { webhookTriggerRouter } from './routes/webhook-trigger';
import { uiRouter } from './ui/pages';

export function createApp(store: MockJiraStore): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Jira REST API routes
  app.use('/rest/api/3', issuesRouter(store));
  app.use('/rest/api/3', searchRouter(store));
  app.use('/rest/api/3', usersRouter());

  // Mock-specific routes
  app.use('/mock', webhookTriggerRouter(store));

  // Web UI
  app.use('/', uiRouter(store));

  return app;
}
```

```ts
// packages/mock-jira/src/routes/issues.ts
import { Router } from 'express';
import { MockJiraStore } from '../store';

export function issuesRouter(store: MockJiraStore): Router {
  const router = Router();

  // Create issue
  router.post('/issue', (req, res) => {
    const { fields } = req.body;
    if (!fields?.project?.key || !fields?.summary) {
      return res.status(400).json({ errorMessages: ['project.key and summary are required'] });
    }

    const issue = store.createIssue({
      projectKey: fields.project.key,
      issueType: fields.issuetype?.name || 'Task',
      summary: fields.summary,
      description: fields.description,
      labels: fields.labels,
      priority: fields.priority?.name,
      parentKey: fields.parent?.key,
    });

    res.status(201).json({ id: issue.id, key: issue.key, self: `/rest/api/3/issue/${issue.key}` });
  });

  // Get issue
  router.get('/issue/:issueKey', (req, res) => {
    const issue = store.getIssue(req.params.issueKey);
    if (!issue) return res.status(404).json({ errorMessages: ['Issue not found'] });
    res.json(issue);
  });

  // Update issue
  router.put('/issue/:issueKey', (req, res) => {
    const { fields } = req.body;
    const updated = store.updateIssue(req.params.issueKey, fields || {});
    if (!updated) return res.status(404).json({ errorMessages: ['Issue not found'] });
    res.status(204).end();
  });

  // Get transitions
  router.get('/issue/:issueKey/transitions', (req, res) => {
    const issue = store.getIssue(req.params.issueKey);
    if (!issue) return res.status(404).json({ errorMessages: ['Issue not found'] });
    const transitions = store.getTransitions(req.params.issueKey);
    res.json({ transitions });
  });

  // Transition issue
  router.post('/issue/:issueKey/transitions', (req, res) => {
    const { transition } = req.body;
    if (!transition?.id) return res.status(400).json({ errorMessages: ['transition.id required'] });

    const success = store.transitionIssue(req.params.issueKey, transition.id);
    if (!success) return res.status(400).json({ errorMessages: ['Invalid transition'] });
    res.status(204).end();
  });

  // Add comment
  router.post('/issue/:issueKey/comment', (req, res) => {
    const { body } = req.body;
    if (!body) return res.status(400).json({ errorMessages: ['body is required'] });

    try {
      const comment = store.addComment(req.params.issueKey, body);
      res.status(201).json(comment);
    } catch {
      res.status(404).json({ errorMessages: ['Issue not found'] });
    }
  });

  return router;
}
```

**Step 4: Create stub files for imports that app.ts references**

Create minimal stubs for `routes/search.ts`, `routes/users.ts`, `routes/webhook-trigger.ts`, `ui/pages.ts` — each exporting a router that does nothing yet.

```ts
// packages/mock-jira/src/routes/search.ts
import { Router } from 'express';
import { MockJiraStore } from '../store';
export function searchRouter(_store: MockJiraStore): Router { return Router(); }
```

```ts
// packages/mock-jira/src/routes/users.ts
import { Router } from 'express';
export function usersRouter(): Router { return Router(); }
```

```ts
// packages/mock-jira/src/routes/webhook-trigger.ts
import { Router } from 'express';
import { MockJiraStore } from '../store';
export function webhookTriggerRouter(_store: MockJiraStore): Router { return Router(); }
```

```ts
// packages/mock-jira/src/ui/pages.ts
import { Router } from 'express';
import { MockJiraStore } from '../store';
export function uiRouter(_store: MockJiraStore): Router { return Router(); }
```

**Step 5: Install supertest**

Run: `cd packages/mock-jira && pnpm add -D supertest @types/supertest`

**Step 6: Run tests**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/issues.test.ts`
Expected: All 7 tests PASS

**Step 7: Commit**

```bash
git add packages/mock-jira/src/
git commit -m "feat(mock-jira): add Express app with Jira issue REST API routes"
```

---

### Task 4: REST API Routes — Search & Users

**Files:**
- Modify: `packages/mock-jira/src/routes/search.ts`
- Modify: `packages/mock-jira/src/routes/users.ts`
- Create: `packages/mock-jira/src/__tests__/search.test.ts`

**Step 1: Write the failing test**

```ts
// packages/mock-jira/src/__tests__/search.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { MockJiraStore } from '../store';
import * as path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-search');

describe('Search & Users API', () => {
  let app: ReturnType<typeof createApp>;
  let store: MockJiraStore;

  beforeEach(() => {
    store = new MockJiraStore(TEST_DATA_DIR);
    store.reset();
    app = createApp(store);
  });

  describe('GET /rest/api/3/search', () => {
    it('searches by JQL project filter', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'A bug' });
      store.createIssue({ projectKey: 'OTHER', issueType: 'Task', summary: 'A task' });

      const res = await request(app).get('/rest/api/3/search').query({ jql: 'project = PROJ' });
      expect(res.status).toBe(200);
      expect(res.body.issues).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.issues[0].key).toBe('PROJ-1');
    });

    it('searches by status', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Open' });
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'WIP' });
      const trans = store.getTransitions('PROJ-2');
      store.transitionIssue('PROJ-2', trans.find(t => t.to.name === 'In Progress')!.id);

      const res = await request(app).get('/rest/api/3/search').query({ jql: 'project = PROJ AND status = "In Progress"' });
      expect(res.body.issues).toHaveLength(1);
      expect(res.body.issues[0].key).toBe('PROJ-2');
    });

    it('returns all when no JQL', async () => {
      store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'One' });
      store.createIssue({ projectKey: 'PROJ', issueType: 'Task', summary: 'Two' });

      const res = await request(app).get('/rest/api/3/search');
      expect(res.body.issues).toHaveLength(2);
    });
  });

  describe('GET /rest/api/3/user/search', () => {
    it('returns mock user', async () => {
      const res = await request(app).get('/rest/api/3/user/search').query({ query: 'mock' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].displayName).toBeTruthy();
      expect(res.body[0].accountId).toBeTruthy();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/search.test.ts`
Expected: FAIL — search returns empty, users returns empty

**Step 3: Implement search.ts and users.ts**

```ts
// packages/mock-jira/src/routes/search.ts
import { Router } from 'express';
import { MockJiraStore } from '../store';

function parseSimpleJql(jql: string): { project?: string; status?: string; issuetype?: string } {
  const query: { project?: string; status?: string; issuetype?: string } = {};

  const projectMatch = jql.match(/project\s*=\s*"?(\w+)"?/i);
  if (projectMatch) query.project = projectMatch[1];

  const statusMatch = jql.match(/status\s*=\s*"([^"]+)"/i);
  if (statusMatch) query.status = statusMatch[1];

  const typeMatch = jql.match(/issuetype\s*=\s*"?(\w+)"?/i);
  if (typeMatch) query.issuetype = typeMatch[1];

  return query;
}

export function searchRouter(store: MockJiraStore): Router {
  const router = Router();

  router.get('/search', (req, res) => {
    const jql = (req.query.jql as string) || '';
    const query = jql ? parseSimpleJql(jql) : {};
    const issues = Object.keys(query).length > 0 ? store.search(query) : store.listAll();

    res.json({
      startAt: 0,
      maxResults: issues.length,
      total: issues.length,
      issues,
    });
  });

  return router;
}
```

```ts
// packages/mock-jira/src/routes/users.ts
import { Router } from 'express';

const MOCK_USERS = [
  {
    accountId: 'mock-user-001',
    emailAddress: 'mock@rtb-ai-hub.local',
    displayName: 'Mock User',
    active: true,
  },
];

export function usersRouter(): Router {
  const router = Router();

  router.get('/user/search', (_req, res) => {
    res.json(MOCK_USERS);
  });

  return router;
}
```

**Step 4: Run tests**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/search.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add packages/mock-jira/src/routes/search.ts packages/mock-jira/src/routes/users.ts packages/mock-jira/src/__tests__/search.test.ts
git commit -m "feat(mock-jira): add JQL search and user search endpoints"
```

---

### Task 5: Webhook Trigger

**Files:**
- Modify: `packages/mock-jira/src/routes/webhook-trigger.ts`
- Create: `packages/mock-jira/src/__tests__/webhook-trigger.test.ts`

**Step 1: Write the failing test**

```ts
// packages/mock-jira/src/__tests__/webhook-trigger.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { MockJiraStore } from '../store';
import * as path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../../data/test-trigger');

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Webhook Trigger', () => {
  let app: ReturnType<typeof createApp>;
  let store: MockJiraStore;

  beforeEach(() => {
    store = new MockJiraStore(TEST_DATA_DIR);
    store.reset();
    app = createApp(store);
    mockFetch.mockReset();
  });

  it('sends webhook payload to webhook-listener', async () => {
    store.createIssue({
      projectKey: 'PROJ',
      issueType: 'Bug',
      summary: 'Trigger test',
      labels: ['bug'],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ status: 'accepted' }),
    });

    const res = await request(app)
      .post('/mock/trigger')
      .send({ issueKey: 'PROJ-1', event: 'issue_created' });

    expect(res.status).toBe(200);
    expect(res.body.triggered).toBe(true);
    expect(res.body.webhookStatus).toBe(202);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/webhooks/jira');
    expect(url).toContain('env=int');

    const body = JSON.parse(options.body);
    expect(body.webhookEvent).toBe('issue_created');
    expect(body.issue.key).toBe('PROJ-1');
    expect(body.issue.fields.summary).toBe('Trigger test');
  });

  it('returns 404 for non-existent issue', async () => {
    const res = await request(app)
      .post('/mock/trigger')
      .send({ issueKey: 'PROJ-999', event: 'issue_updated' });

    expect(res.status).toBe(404);
  });

  it('reports webhook failure', async () => {
    store.createIssue({ projectKey: 'PROJ', issueType: 'Bug', summary: 'Fail test' });

    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app)
      .post('/mock/trigger')
      .send({ issueKey: 'PROJ-1', event: 'issue_created' });

    expect(res.status).toBe(502);
    expect(res.body.triggered).toBe(false);
    expect(res.body.error).toContain('Connection refused');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/webhook-trigger.test.ts`
Expected: FAIL — trigger returns empty response

**Step 3: Implement webhook-trigger.ts**

```ts
// packages/mock-jira/src/routes/webhook-trigger.ts
import { Router } from 'express';
import { MockJiraStore } from '../store';

const WEBHOOK_TARGET = process.env.WEBHOOK_LISTENER_URL || 'http://localhost:4000';
const DEFAULT_ENV = process.env.MOCK_JIRA_TARGET_ENV || 'int';

export function webhookTriggerRouter(store: MockJiraStore): Router {
  const router = Router();

  router.post('/trigger', async (req, res) => {
    const { issueKey, event } = req.body;
    if (!issueKey) {
      return res.status(400).json({ error: 'issueKey is required' });
    }

    const issue = store.getIssue(issueKey);
    if (!issue) {
      return res.status(404).json({ error: `Issue not found: ${issueKey}` });
    }

    const webhookPayload = {
      webhookEvent: event || 'issue_updated',
      issue: {
        key: issue.key,
        id: issue.id,
        fields: {
          issuetype: issue.fields.issuetype,
          status: issue.fields.status,
          summary: issue.fields.summary,
          description: issue.fields.description,
          project: issue.fields.project,
          labels: issue.fields.labels,
          priority: issue.fields.priority,
          components: issue.fields.components,
        },
      },
    };

    try {
      const targetUrl = `${WEBHOOK_TARGET}/webhooks/jira?env=${DEFAULT_ENV}`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      res.json({
        triggered: true,
        webhookStatus: response.status,
        targetUrl,
      });
    } catch (err) {
      res.status(502).json({
        triggered: false,
        error: (err as Error).message,
      });
    }
  });

  return router;
}
```

**Step 4: Run tests**

Run: `pnpm vitest run packages/mock-jira/src/__tests__/webhook-trigger.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add packages/mock-jira/src/routes/webhook-trigger.ts packages/mock-jira/src/__tests__/webhook-trigger.test.ts
git commit -m "feat(mock-jira): add webhook trigger to fire events at webhook-listener"
```

---

### Task 6: Web UI — Server-Side HTML Pages

**Files:**
- Modify: `packages/mock-jira/src/ui/pages.ts`

No TDD for HTML rendering — visual validation.

**Step 1: Implement pages.ts**

Implement 3 pages as server-side HTML with Tailwind CDN:

1. **`GET /`** — Issue list table (key, type, status badge, summary, updated, actions)
2. **`GET /issue/:key`** — Issue detail (all fields, comments timeline, transition buttons, "Send Webhook" button)
3. **`GET /create`** — Create issue form (project key, type dropdown, summary, description, labels, priority)

Each page includes:
- Tailwind CDN `<script src="https://cdn.tailwindcss.com">`
- Navigation header with links
- "Send Webhook" buttons that `fetch('/mock/trigger', ...)` via inline JS
- Status badges with color coding (Open=blue, In Progress=yellow, In Review=purple, Done=green, Closed=gray)

**Step 2: Commit**

```bash
git add packages/mock-jira/src/ui/pages.ts
git commit -m "feat(mock-jira): add server-side HTML UI with issue list, detail, and create pages"
```

---

### Task 7: Seed Data

**Files:**
- Create: `packages/mock-jira/src/seed.ts`

**Step 1: Implement seed.ts**

```ts
// packages/mock-jira/src/seed.ts
import { MockJiraStore } from './store';

const store = new MockJiraStore();

console.log('Seeding mock Jira data...');

// Bug ticket — matches the bug-fix demo scenario
const bug1 = store.createIssue({
  projectKey: 'PROJ',
  issueType: 'Bug',
  summary: 'API returns 500 on empty payload',
  description: `## Bug Report\n### Steps to reproduce\n1. Send POST /api/data with empty body\n2. Observe 500 Internal Server Error\n\n### Expected\n400 Bad Request with validation error\n\n### Actual\n500 with stack trace:\n\`\`\`\nTypeError: Cannot destructure property 'name' of undefined\n  at processData (src/handlers/data.ts:42)\n\`\`\`\n\n### Environment\n- Server: int\n- Endpoint: POST /api/data`,
  labels: ['bug', 'api'],
  priority: 'Critical',
});
console.log(`  Created: ${bug1.key} — ${bug1.fields.summary}`);

// Feature ticket
const feat1 = store.createIssue({
  projectKey: 'PROJ',
  issueType: 'Story',
  summary: 'Building info API development',
  description: 'Develop REST API for building master data CRUD operations.',
  labels: ['feature', 'api', 'building'],
  priority: 'High',
});
console.log(`  Created: ${feat1.key} — ${feat1.fields.summary}`);

// Task ticket — in progress
const task1 = store.createIssue({
  projectKey: 'PROJ',
  issueType: 'Task',
  summary: 'Add pagination to property search',
  description: 'Implement cursor-based pagination for the property search endpoint.',
  labels: ['enhancement'],
  priority: 'Medium',
});
const trans = store.getTransitions(task1.key);
store.transitionIssue(task1.key, trans.find(t => t.to.name === 'In Progress')!.id);
store.addComment(task1.key, 'Started implementing cursor-based pagination.');
console.log(`  Created: ${task1.key} — ${task1.fields.summary} (In Progress)`);

console.log(`\nDone! ${store.listAll().length} issues created.`);
```

**Step 2: Run seed**

Run: `pnpm --filter @rtb-ai-hub/mock-jira run seed`
Expected: 3 issues created message

**Step 3: Commit**

```bash
git add packages/mock-jira/src/seed.ts
git commit -m "feat(mock-jira): add seed script with demo bug, story, and task data"
```

---

### Task 8: Server Entry Point

**Files:**
- Create: `packages/mock-jira/src/server.ts`

**Step 1: Implement server.ts**

```ts
// packages/mock-jira/src/server.ts
import { createApp } from './app';
import { MockJiraStore } from './store';

const PORT = parseInt(process.env.MOCK_JIRA_PORT || '3001', 10);

const store = new MockJiraStore();
const app = createApp(store);

app.listen(PORT, () => {
  const issues = store.listAll();
  console.log(`Mock Jira server running on http://localhost:${PORT}`);
  console.log(`  Issues in store: ${issues.length}`);
  console.log(`  UI: http://localhost:${PORT}/`);
  console.log(`  API: http://localhost:${PORT}/rest/api/3/`);
  if (issues.length === 0) {
    console.log(`  Run "pnpm --filter @rtb-ai-hub/mock-jira run seed" to create demo data`);
  }
});
```

**Step 2: Test manually**

Run: `pnpm dev:mock-jira`
Visit: `http://localhost:3001/`
Expected: UI loads with issue list (empty or seeded data)

**Step 3: Commit**

```bash
git add packages/mock-jira/src/server.ts
git commit -m "feat(mock-jira): add server entry point"
```

---

### Task 9: Dashboard Integration & Constants Update

**Files:**
- Modify: `packages/dashboard/vite.config.ts` (add `/mock-jira` proxy)
- Modify: `packages/shared/src/constants.ts` (MOCK_JIRA toggle for JIRA endpoint)
- Modify: `package.json` (root — update `dev` script for conditional mock-jira)

**Step 1: Add Vite proxy**

In `packages/dashboard/vite.config.ts`, add to the proxy object:

```ts
...(process.env.MOCK_JIRA === 'true' ? {
  '/mock-jira': {
    target: `http://localhost:${process.env.MOCK_JIRA_PORT || '3001'}`,
    rewrite: (path: string) => path.replace(/^\/mock-jira/, ''),
  },
} : {}),
```

**Step 2: Update constants.ts**

In `packages/shared/src/constants.ts`, modify JIRA endpoint:

```ts
JIRA: process.env.MOCK_JIRA === 'true'
  ? `http://localhost:${process.env.MOCK_JIRA_PORT || '3001'}`
  : process.env.NATIVE_MCP_JIRA_ENDPOINT || 'http://localhost:3000',
```

**Step 3: Update root dev script**

Add mock-jira to concurrently when `MOCK_JIRA=true`. Update the `dev` script to conditionally include mock-jira in the concurrently command.

**Step 4: Rebuild shared**

Run: `pnpm build:shared`

**Step 5: Run all tests**

Run: `pnpm test`
Expected: All tests pass (existing + new mock-jira tests)

**Step 6: Commit**

```bash
git add packages/dashboard/vite.config.ts packages/shared/src/constants.ts package.json
git commit -m "feat(mock-jira): integrate with dashboard proxy and env-based Jira endpoint toggle"
```

---

### Task 10: Final Verification

**Step 1: Seed data**

Run: `pnpm --filter @rtb-ai-hub/mock-jira run seed`

**Step 2: Start mock-jira**

Run: `MOCK_JIRA=true pnpm dev:mock-jira`

**Step 3: Verify API**

Run: `curl http://localhost:3001/rest/api/3/issue/PROJ-1 | jq .`
Expected: Bug issue JSON with correct fields

**Step 4: Verify UI**

Visit: `http://localhost:3001/`
Expected: Issue list with 3 seeded issues, clickable detail pages

**Step 5: Verify webhook trigger**

Start webhook-listener: `pnpm dev:webhook`
Run: `curl -X POST http://localhost:3001/mock/trigger -H 'Content-Type: application/json' -d '{"issueKey":"PROJ-1","event":"issue_created"}'`
Expected: `{"triggered":true,"webhookStatus":202,...}`

**Step 6: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 7: Commit any final fixes**

---
