# Redis+BullMQ → PostgreSQL+pg-boss Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove Redis dependency from webhook-listener and workflow-engine by replacing BullMQ with pg-boss and migrating Redis KV stores (preview-manager, worktree-registry) to PostgreSQL tables.

**Architecture:** pg-boss uses PostgreSQL's `SKIP LOCKED` for job queue semantics. A single PgBoss instance is shared via the existing DATABASE_URL connection. Preview and worktree state moves to new Drizzle tables with TTL managed by a periodic cleanup.

**Tech Stack:** pg-boss (latest), drizzle-orm (existing), PostgreSQL 17 (existing)

**Note:** `openclaw-gateway` still depends on Redis for agent state. Redis service stays in `docker-compose.yml` for that service only. Our core services (webhook-listener, workflow-engine) become Redis-free.

---

## Task 1: Install pg-boss, Add DB Schema for Preview + Worktree

**Files:**
- Modify: `packages/webhook-listener/package.json` — add pg-boss, remove bullmq + ioredis
- Modify: `packages/workflow-engine/package.json` — add pg-boss, remove bullmq + ioredis
- Modify: `packages/shared/src/db/schema.ts` — add `preview_instances` and `worktree_registry` tables
- Create: `drizzle/0005_add_preview_and_worktree_tables.sql`

**Step 1: Update package.json dependencies**

In `packages/webhook-listener/package.json`:
- Remove: `"bullmq": "^5.4.0"`, `"ioredis": "^5.3.2"`
- Add: `"pg-boss": "^10.0.0"`

In `packages/workflow-engine/package.json`:
- Remove: `"bullmq": "^5.4.0"`, `"ioredis": "^5.3.2"`
- Add: `"pg-boss": "^10.0.0"`

Run: `pnpm install`

**Step 2: Add Drizzle schema for preview_instances and worktree_registry**

In `packages/shared/src/db/schema.ts`, add after `agentModelConfig`:

```typescript
// ─── preview_instances (was Redis KV) ─────────────────────────────────────────

export const previewInstances = pgTable(
  'preview_instances',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    issueKey: varchar('issue_key', { length: 50 }).notNull(),
    branchName: varchar('branch_name', { length: 200 }).notNull(),
    env: varchar('env', { length: 10 }).notNull().default('int'),
    status: varchar('status', { length: 20 }).notNull().default('starting'),
    webPort: integer('web_port').notNull(),
    apiPort: integer('api_port').notNull(),
    dbName: varchar('db_name', { length: 100 }).notNull(),
    worktreePath: varchar('worktree_path', { length: 500 }).notNull(),
    webUrl: varchar('web_url', { length: 500 }).notNull(),
    apiUrl: varchar('api_url', { length: 500 }).notNull(),
    webPid: integer('web_pid'),
    apiPid: integer('api_pid'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_preview_instances_issue_key').on(table.issueKey),
    index('idx_preview_instances_status').on(table.status),
    index('idx_preview_instances_expires_at').on(table.expiresAt),
  ]
);

// ─── worktree_registry (was Redis KV) ─────────────────────────────────────────

export const worktreeRegistry = pgTable(
  'worktree_registry',
  {
    issueKey: varchar('issue_key', { length: 50 }).primaryKey(),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_worktree_registry_expires_at').on(table.expiresAt),
  ]
);
```

**Step 3: Generate and review migration**

Run: `pnpm db:generate`
Expected: New migration file in `drizzle/`

**Step 4: Commit**

```bash
git add packages/webhook-listener/package.json packages/workflow-engine/package.json \
  packages/shared/src/db/schema.ts drizzle/ pnpm-lock.yaml
git commit -m "feat: add pg-boss dependency and preview/worktree DB tables"
```

---

## Task 2: Replace Queue Layer (connection.ts + queues.ts)

**Files:**
- Rewrite: `packages/workflow-engine/src/queue/connection.ts` — pg-boss singleton instead of Redis
- Rewrite: `packages/workflow-engine/src/queue/queues.ts` — pg-boss send wrappers
- Modify: `packages/shared/src/constants.ts` — update `DEFAULT_JOB_OPTIONS` for pg-boss

**Step 1: Rewrite connection.ts**

Replace entire `packages/workflow-engine/src/queue/connection.ts`:

```typescript
import PgBoss from 'pg-boss';
import { requireEnv, createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('queue-connection');

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    const databaseUrl = requireEnv('DATABASE_URL');
    boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });

    boss.on('error', (error) => {
      logger.error({ error }, 'pg-boss error');
    });
  }
  return boss;
}

export async function startBoss(): Promise<PgBoss> {
  const b = getBoss();
  await b.start();
  logger.info('pg-boss started');
  return b;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
    logger.info('pg-boss stopped');
  }
}
```

**Step 2: Rewrite queues.ts**

Replace entire `packages/workflow-engine/src/queue/queues.ts`:

```typescript
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@rtb-ai-hub/shared';
import { getBoss } from './connection';

export type QueueSendOptions = {
  jobId?: string;
};

async function send(queue: string, data: unknown, opts?: QueueSendOptions): Promise<string | null> {
  const boss = getBoss();
  return boss.send(queue, data as object, {
    id: opts?.jobId,
    retryLimit: DEFAULT_JOB_OPTIONS.attempts,
    retryDelay: DEFAULT_JOB_OPTIONS.backoff.delay / 1000, // pg-boss uses seconds
    retryBackoff: true,
    expireInMinutes: 60,
  });
}

export async function sendToFigmaQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.FIGMA, data, opts);
}

export async function sendToJiraQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.JIRA, data, opts);
}

export async function sendToGithubQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.GITHUB, data, opts);
}

export async function sendToDatadogQueue(data: unknown, opts?: QueueSendOptions) {
  return send(QUEUE_NAMES.DATADOG, data, opts);
}
```

**Step 3: Update DEFAULT_JOB_OPTIONS in constants.ts**

In `packages/shared/src/constants.ts`, update:

```typescript
// Job Options (pg-boss compatible)
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,          // retryLimit in pg-boss
  backoff: {
    type: 'exponential' as const,
    delay: 2000,        // retryDelay base in ms (converted to seconds for pg-boss)
  },
  expireInMinutes: 60,
};
```

Remove `removeOnComplete` and `removeOnFail` (pg-boss handles archiving automatically).

**Step 4: Run build**

Run: `pnpm build:shared && pnpm build`
Expected: Build passes (workers.ts will temporarily fail — fixed in Task 3)

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/queue/ packages/shared/src/constants.ts
git commit -m "feat: replace BullMQ Queue with pg-boss send functions"
```

---

## Task 3: Replace Worker Layer (workers.ts)

**Files:**
- Rewrite: `packages/workflow-engine/src/queue/workers.ts` — pg-boss work handlers

**Step 1: Rewrite workers.ts**

Replace entire `packages/workflow-engine/src/queue/workers.ts`:

```typescript
import PgBoss from 'pg-boss';
import { QUEUE_NAMES, DEFAULT_ENVIRONMENT, createLogger } from '@rtb-ai-hub/shared';
import type {
  FigmaWebhookEvent,
  GitHubWebhookEvent,
  JiraWebhookEvent,
  DatadogWebhookEvent,
  Environment,
} from '@rtb-ai-hub/shared';
import {
  processFigmaToJira,
  processAutoReview,
  processJiraAutoDev,
  processDeployMonitor,
  processIncidentToJira,
} from '../workflows';
import { processTargetDeploy } from '../workflows/target-deploy';

const logger = createLogger('workers');

type JobPayload = {
  event: FigmaWebhookEvent | JiraWebhookEvent | GitHubWebhookEvent | DatadogWebhookEvent;
  userId: string | null;
  env?: Environment;
};

export async function registerWorkers(boss: PgBoss) {
  await boss.createQueue(QUEUE_NAMES.FIGMA);
  await boss.createQueue(QUEUE_NAMES.JIRA);
  await boss.createQueue(QUEUE_NAMES.GITHUB);
  await boss.createQueue(QUEUE_NAMES.DATADOG);

  await boss.work<JobPayload>(QUEUE_NAMES.FIGMA, { batchSize: 2 }, async (job) => {
    logger.info({ jobId: job.id }, 'Processing Figma event');
    const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
    const result = await processFigmaToJira(event as FigmaWebhookEvent, userId, env);
    logger.info({ jobId: job.id, result, userId }, 'Figma workflow completed');
  });

  await boss.work<JobPayload>(QUEUE_NAMES.JIRA, { batchSize: 2 }, async (job) => {
    logger.info({ jobId: job.id }, 'Processing Jira event');
    const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
    const result = await processJiraAutoDev(event as JiraWebhookEvent, userId, env);
    logger.info({ jobId: job.id, result, userId }, 'Jira workflow completed');
  });

  await boss.work<JobPayload>(QUEUE_NAMES.GITHUB, { batchSize: 2 }, async (job) => {
    logger.info({ jobId: job.id }, 'Processing GitHub event');
    const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
    const ghEvent = event as GitHubWebhookEvent;
    if (ghEvent.type === 'push') {
      await processTargetDeploy(ghEvent, userId, env);
    } else if (ghEvent.type === 'deployment') {
      await processDeployMonitor(ghEvent, userId, env);
    } else {
      await processAutoReview(ghEvent, userId, env);
    }
    logger.info({ jobId: job.id, userId }, 'GitHub workflow completed');
  });

  await boss.work<JobPayload>(QUEUE_NAMES.DATADOG, { batchSize: 2 }, async (job) => {
    logger.info({ jobId: job.id }, 'Processing Datadog event');
    const { event, userId, env = DEFAULT_ENVIRONMENT } = job.data;
    const result = await processIncidentToJira(event as DatadogWebhookEvent, userId, env);
    logger.info({ jobId: job.id, result, userId }, 'Datadog workflow completed');
  });

  logger.info('All pg-boss workers registered');
}
```

**Step 2: Update queue/index.ts export**

Check `packages/workflow-engine/src/queue/index.ts` and ensure it exports `registerWorkers`, `startBoss`, `stopBoss`, and the send functions.

**Step 3: Commit**

```bash
git add packages/workflow-engine/src/queue/
git commit -m "feat: replace BullMQ Workers with pg-boss work handlers"
```

---

## Task 4: Update webhook-listener Entry Points

**Files:**
- Modify: `packages/webhook-listener/src/index.ts` — remove Redis/BullMQ, use pg-boss send
- Modify: `packages/webhook-listener/src/hub-entry.ts` — same changes
- Modify: `packages/webhook-listener/src/routes/index.ts` — remove Redis from createRoutes
- Modify: `packages/webhook-listener/src/routes/figma.ts` — use sendToFigmaQueue
- Modify: `packages/webhook-listener/src/routes/jira.ts` — use sendToJiraQueue
- Modify: `packages/webhook-listener/src/routes/github.ts` — use sendToGithubQueue
- Modify: `packages/webhook-listener/src/routes/datadog.ts` — use sendToDatadogQueue

**Step 1: Rewrite route files**

Each webhook route currently accepts `Queue` as parameter and calls `queue.add()`. Change to import `sendTo*Queue` directly.

Example for `figma.ts`:
```typescript
// Before:
import { Queue } from 'bullmq';
export function createFigmaRouter(figmaQueue: Queue) {
  ...
  await figmaQueue.add('figma-event', { event, userId, env }, { jobId: generateId('figma') });
}

// After:
import { sendToFigmaQueue } from '@rtb-ai-hub/workflow-engine/queue';
// OR if cross-package import is not set up, inline the pg-boss send:
import { getBoss } from '../../somewhere'; // we'll use a shared approach
```

**Actually — cleaner approach**: Since webhook-listener is a separate package, create a thin `queue-client.ts` in webhook-listener that imports pg-boss and exposes send functions:

Create `packages/webhook-listener/src/queue-client.ts`:
```typescript
import PgBoss from 'pg-boss';
import { requireEnv, createLogger, QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@rtb-ai-hub/shared';

const logger = createLogger('queue-client');
let boss: PgBoss | null = null;

export async function getQueueClient(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({ connectionString: requireEnv('DATABASE_URL'), schema: 'pgboss' });
    boss.on('error', (error) => logger.error({ error }, 'pg-boss error'));
    await boss.start();
    logger.info('pg-boss queue client started');
  }
  return boss;
}

export async function stopQueueClient(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}

export async function enqueueJob(queue: string, data: unknown, jobId: string): Promise<string | null> {
  const b = await getQueueClient();
  return b.send(queue, data as object, {
    id: jobId,
    retryLimit: DEFAULT_JOB_OPTIONS.attempts,
    retryDelay: DEFAULT_JOB_OPTIONS.backoff.delay / 1000,
    retryBackoff: true,
    expireInMinutes: DEFAULT_JOB_OPTIONS.expireInMinutes,
  });
}
```

Then update each route:
```typescript
// figma.ts — remove Queue parameter
import { enqueueJob } from '../queue-client';
import { QUEUE_NAMES } from '@rtb-ai-hub/shared';

export function createFigmaRouter() {  // no more Queue param
  ...
  await enqueueJob(QUEUE_NAMES.FIGMA, { event, userId, env }, generateId('figma'));
}
```

**Step 2: Update routes/index.ts**

```typescript
// Remove Queue/Redis imports and parameters
export function createRoutes() {
  const router = Router();
  router.use(createFigmaRouter());     // no queue param
  router.use(createJiraRouter());
  router.use(createGitHubRouter());
  router.use(createDatadogRouter());
  router.use(createChatRouter());      // no redis param
  router.use(createContextRouter());
  router.use(createKnowledgeRouter());
  router.use(createInfraRouter());
  router.use(createWorkflowsRouter());
  return router;
}
```

**Step 3: Update index.ts and hub-entry.ts**

Remove all `Redis`, `Queue`, `ioredis`, `bullmq` imports. Remove `redisConnection`, queue creation.
Replace with `getQueueClient()` initialization during startup.

**Step 4: Commit**

```bash
git add packages/webhook-listener/src/
git commit -m "feat: migrate webhook-listener from BullMQ to pg-boss"
```

---

## Task 5: Migrate Preview Manager to PostgreSQL

**Files:**
- Rewrite: `packages/workflow-engine/src/utils/preview-manager.ts` — use Drizzle instead of Redis
- Modify: `packages/webhook-listener/src/utils/chat-tools.ts` — remove Redis parameter

**Step 1: Replace Redis calls in PreviewManager with Drizzle queries**

Replace `constructor(private redis: Redis, ...)` with plain constructor.
Replace all `this.redis.*` calls with Drizzle `insert/select/update/delete` on `previewInstances` table.

Key mappings:
- `redis.set(key, JSON.stringify(preview), 'EX', ttl)` → `db.insert(previewInstances).values({...}).onConflictDoUpdate()`
- `redis.get(key)` → `db.select().from(previewInstances).where(eq(id, previewId))`
- `redis.del(key)` → `db.delete(previewInstances).where(eq(id, previewId))`
- `redis.smembers(key)` → `db.select().from(previewInstances).where(ne(status, 'stopped'))`

**Step 2: Update chat-tools.ts**

Remove `redis: Redis` parameter from `handleToolCall()`, `handleListPreviews()`, `handleGetPreview()`, `handleGetSystemInfo()`.
Replace Redis queries with Drizzle queries or `queryRaw()`.

Remove redis health check from `handleGetSystemInfo`:
```typescript
// Remove:
const pong = await redis.ping();
info.redis = { connected: pong === 'PONG' };

// Replace with:
info.queue = { type: 'pg-boss', backend: 'postgresql' };
```

**Step 3: Update chat.ts router**

Remove `Redis` import and parameter:
```typescript
export function createChatRouter() {  // no redis param
```

**Step 4: Commit**

```bash
git add packages/workflow-engine/src/utils/preview-manager.ts \
  packages/webhook-listener/src/utils/chat-tools.ts \
  packages/webhook-listener/src/routes/chat.ts
git commit -m "feat: migrate preview-manager from Redis to PostgreSQL"
```

---

## Task 6: Migrate Worktree Registry to PostgreSQL

**Files:**
- Rewrite: `packages/workflow-engine/src/worktree/registry.ts` — use Drizzle instead of Redis

**Step 1: Replace WorktreeRegistry class**

Replace `constructor(private redis: Redis)` with constructor that uses Drizzle.
Replace all Redis calls with SQL:
- `setex(key, TTL, data)` → `db.insert(worktreeRegistry).values({...}).onConflictDoUpdate()`
- `get(key)` → `db.select().from(worktreeRegistry).where(eq(issueKey, key))`
- `del(key)` → `db.delete(worktreeRegistry).where(eq(issueKey, key))`
- `smembers` → `db.select().from(worktreeRegistry).where(gt(expiresAt, now))`
- `scard` → `SELECT COUNT(*) FROM worktree_registry WHERE expires_at > NOW()`

**Step 2: Update all call sites**

Find all `createWorktreeRegistry(redis)` calls and replace with `createWorktreeRegistry()` (no redis param).

**Step 3: Commit**

```bash
git add packages/workflow-engine/src/worktree/
git commit -m "feat: migrate worktree-registry from Redis to PostgreSQL"
```

---

## Task 7: Update Branch Poller

**Files:**
- Modify: `packages/workflow-engine/src/utils/branch-poller.ts` — use pg-boss instead of BullMQ

**Step 1: Replace BullMQ Queue with pg-boss send**

```typescript
// Before:
import { Queue } from 'bullmq';
import { createRedisConnection } from '../queue/connection';
this.queue = new Queue(QUEUE_NAMES.GITHUB, { connection });

// After:
import { getBoss } from '../queue/connection';
// Use boss.send() directly instead of queue.add()
```

**Step 2: Commit**

```bash
git add packages/workflow-engine/src/utils/branch-poller.ts
git commit -m "feat: migrate branch-poller from BullMQ to pg-boss"
```

---

## Task 8: Update hub-entry.ts Shutdown and Startup

**Files:**
- Modify: `packages/webhook-listener/src/hub-entry.ts` — pg-boss lifecycle

**Step 1: Update startup**

Replace `createWorkers()` with `registerWorkers(boss)` from pg-boss.

**Step 2: Update SIGTERM handler**

Replace individual worker `.close()` calls with `stopBoss()`.

**Step 3: Commit**

```bash
git add packages/webhook-listener/src/hub-entry.ts
git commit -m "feat: update hub-entry lifecycle for pg-boss"
```

---

## Task 9: Update Docker and Environment Config

**Files:**
- Modify: `docker-compose.yml` — remove Redis dependency from rtb-hub
- Modify: `ENV_SETUP.md` — remove REDIS_HOST/REDIS_PORT for core services
- Modify: `CLAUDE.md` — update architecture description

**Step 1: Update docker-compose.yml**

In `rtb-hub` service:
- Remove `REDIS_HOST` and `REDIS_PORT` environment variables
- Remove `redis` from `depends_on`
- Keep `redis` service definition (openclaw-gateway still needs it)

**Step 2: Update docs**

- CLAUDE.md: Update Queue section to mention pg-boss instead of BullMQ+Redis
- ENV_SETUP.md: Note that REDIS_HOST/REDIS_PORT are only needed for openclaw-gateway

**Step 3: Commit**

```bash
git add docker-compose.yml CLAUDE.md ENV_SETUP.md
git commit -m "docs: update infra config for pg-boss migration"
```

---

## Task 10: Update Tests

**Files:**
- Modify: `packages/webhook-listener/src/__tests__/routes.test.ts` — update Queue mocks
- Modify: `packages/workflow-engine/src/utils/__tests__/preview-manager.test.ts` — update Redis mocks

**Step 1: Update routes.test.ts**

Replace `createMockQueue()` with mocking `enqueueJob` from `queue-client.ts`:
```typescript
vi.mock('../queue-client', () => ({
  enqueueJob: vi.fn().mockResolvedValue('test-job-id'),
  getQueueClient: vi.fn(),
}));
```

**Step 2: Update preview-manager.test.ts**

Replace `createMockRedis()` with mocking Drizzle `queryRaw` or the db module.

**Step 3: Run all tests**

Run: `pnpm test`
Expected: 602+ tests pass, 0 failures

**Step 4: Commit**

```bash
git add packages/webhook-listener/src/__tests__/ packages/workflow-engine/src/utils/__tests__/
git commit -m "test: update tests for pg-boss migration"
```

---

## Task 11: Final Verification

**Step 1: Full build**

Run: `pnpm build:shared && pnpm build`
Expected: All 5 packages build successfully

**Step 2: Type check**

Run: `pnpm typecheck`
Expected: 0 errors

**Step 3: Lint**

Run: `pnpm lint`
Expected: 0 errors (warnings OK)

**Step 4: Full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Grep for leftover Redis/BullMQ references**

Run: `grep -r "bullmq\|ioredis\|from 'ioredis'\|from 'bullmq'" packages/ --include="*.ts" -l`
Expected: No results (all references removed from core packages)

**Step 6: Verify no Redis imports remain in production code**

Run: `grep -r "import.*Redis\|import.*from 'ioredis'" packages/ --include="*.ts" -l`
Expected: No results

---

## Summary of Changed Files

| # | File | Action |
|---|------|--------|
| 1 | `packages/webhook-listener/package.json` | Remove bullmq+ioredis, add pg-boss |
| 2 | `packages/workflow-engine/package.json` | Remove bullmq+ioredis, add pg-boss |
| 3 | `packages/shared/src/db/schema.ts` | Add preview_instances, worktree_registry tables |
| 4 | `packages/shared/src/constants.ts` | Update DEFAULT_JOB_OPTIONS |
| 5 | `packages/workflow-engine/src/queue/connection.ts` | Rewrite: pg-boss singleton |
| 6 | `packages/workflow-engine/src/queue/queues.ts` | Rewrite: pg-boss send wrappers |
| 7 | `packages/workflow-engine/src/queue/workers.ts` | Rewrite: pg-boss work handlers |
| 8 | `packages/webhook-listener/src/queue-client.ts` | **New**: pg-boss client for webhook-listener |
| 9 | `packages/webhook-listener/src/index.ts` | Remove Redis/BullMQ, use queue-client |
| 10 | `packages/webhook-listener/src/hub-entry.ts` | Remove Redis/BullMQ, pg-boss lifecycle |
| 11 | `packages/webhook-listener/src/routes/index.ts` | Remove Queue/Redis params |
| 12 | `packages/webhook-listener/src/routes/figma.ts` | Use enqueueJob |
| 13 | `packages/webhook-listener/src/routes/jira.ts` | Use enqueueJob |
| 14 | `packages/webhook-listener/src/routes/github.ts` | Use enqueueJob |
| 15 | `packages/webhook-listener/src/routes/datadog.ts` | Use enqueueJob |
| 16 | `packages/webhook-listener/src/routes/chat.ts` | Remove Redis param |
| 17 | `packages/webhook-listener/src/utils/chat-tools.ts` | Remove Redis, use Drizzle |
| 18 | `packages/workflow-engine/src/utils/preview-manager.ts` | Rewrite: Drizzle instead of Redis |
| 19 | `packages/workflow-engine/src/worktree/registry.ts` | Rewrite: Drizzle instead of Redis |
| 20 | `packages/workflow-engine/src/utils/branch-poller.ts` | Use pg-boss instead of BullMQ |
| 21 | `docker-compose.yml` | Remove Redis dep from rtb-hub |
| 22 | `CLAUDE.md` | Update architecture docs |
| 23 | Tests (2+ files) | Update mocks |
