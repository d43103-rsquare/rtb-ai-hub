# B-1: Cross-Reference Engine (맥락 연결 엔진)

> ✅ **구현 완료** — 2026-02-11
>
> **구현 파일**: `context-engine.ts`, `routes/context.ts` (신규), `db/schema.ts`, `db/index.ts`, `chat-tools.ts`, `routes/index.ts`, `jira-auto-dev-multi.ts`, `target-deploy.ts` (수정)
> **DB 마이그레이션**: `drizzle/0003_add_context_links.sql`
> **테스트**: 19개 (`context-engine.test.ts`)
>
> **우선순위**: Phase B (핵심 인프라)
> **난이도**: 중~상 — 새로운 DB 테이블 + 이벤트 훅 + 조회 API
> **의존성**: 없음 (독립 구현 가능, 이후 모든 기능의 기반)
> **예상 작업량**: 5~7일

---

## 1. 목표

모든 개발 활동에서 **Jira 키 ↔ Figma 프레임 ↔ GitHub PR ↔ Slack 스레드 ↔ Datadog 인시던트** 간의
관계를 자동으로 수집하고, 어떤 맥락에서든 관련 정보를 즉시 조회할 수 있게 한다.

이 엔진은 A-1(역할 인식형 알림), A-2(PR 맥락 첨부), B-2(스마트 핸드오프), B-3(블로커 감지)의 **공통 기반 인프라**.

## 2. 핵심 개념

```
PROJ-123 ──┬── Figma: file/abc123 (node 1:234)
            ├── GitHub: PR #42, PR #45
            ├── Branch: feature/PROJ-123-login
            ├── Slack: thread ts:1234567890
            ├── Preview: http://localhost:5100
            ├── Deployments: int (2회), stg (0회)
            └── Team: designer=김디자, developer=박개발, reviewer=최시니어
```

하나의 Jira 키를 중심으로 모든 관련 엔터티를 연결하는 **스타 토폴로지**.

## 3. 상세 설계

### 3.1 DB 스키마

**위치**: `packages/shared/src/db/schema.ts` (기존 파일에 추가)

```typescript
// ─── context_links (맥락 연결) ──────────────────────────────────────────

export const contextLinks = pgTable(
  'context_links',
  {
    id: varchar('id', { length: 255 }).primaryKey(),

    // Jira (중심 엔터티)
    jiraKey: varchar('jira_key', { length: 50 }).notNull(),
    jiraUrl: varchar('jira_url', { length: 500 }),

    // Figma
    figmaFileKey: varchar('figma_file_key', { length: 200 }),
    figmaNodeIds: jsonb('figma_node_ids'), // string[]
    figmaUrl: varchar('figma_url', { length: 500 }),

    // GitHub
    githubRepo: varchar('github_repo', { length: 200 }),
    githubBranch: varchar('github_branch', { length: 200 }),
    githubPrNumbers: jsonb('github_pr_numbers'), // number[]
    githubPrUrls: jsonb('github_pr_urls'), // string[]

    // Preview
    previewId: varchar('preview_id', { length: 255 }),
    previewWebUrl: varchar('preview_web_url', { length: 500 }),
    previewApiUrl: varchar('preview_api_url', { length: 500 }),

    // Deployment
    deployments: jsonb('deployments'), // Array<{ env, timestamp, success }>

    // Slack
    slackThreadTs: varchar('slack_thread_ts', { length: 100 }),
    slackChannelId: varchar('slack_channel_id', { length: 100 }),

    // Datadog
    datadogIncidentIds: jsonb('datadog_incident_ids'), // string[]

    // Team Members
    teamMembers: jsonb('team_members'), // Record<TeamRole, { email, slackUserId?, name? }>

    // Metadata
    env: varchar('env', { length: 10 }).notNull().default('int'),
    summary: varchar('summary', { length: 500 }),
    status: varchar('status', { length: 50 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_context_links_jira_key').on(table.jiraKey),
    index('idx_context_links_github_branch').on(table.githubBranch),
    index('idx_context_links_figma_file').on(table.figmaFileKey),
    index('idx_context_links_preview_id').on(table.previewId),
    index('idx_context_links_env').on(table.env),
  ]
);
```

### 3.2 Context Engine 모듈

**위치**: `packages/workflow-engine/src/utils/context-engine.ts` (신규)

```typescript
import { eq, and } from 'drizzle-orm';
import { createLogger, generateId } from '@rtb-ai-hub/shared';
import type { Environment } from '@rtb-ai-hub/shared';
import { getDb } from '@rtb-ai-hub/shared/db';
import { contextLinks } from '@rtb-ai-hub/shared/db/schema';

const logger = createLogger('context-engine');

// ─── 타입 ──────────────────────────────────────────────────────────────

export type ContextLink = typeof contextLinks.$inferSelect;
export type ContextLinkInsert = typeof contextLinks.$inferInsert;

export type ContextUpdate = {
  jiraKey: string;
  env?: Environment;
} & Partial<{
  jiraUrl: string;
  figmaFileKey: string;
  figmaNodeIds: string[];
  figmaUrl: string;
  githubRepo: string;
  githubBranch: string;
  githubPrNumber: number; // 단일 PR 추가 (배열에 append)
  githubPrUrl: string;
  previewId: string;
  previewWebUrl: string;
  previewApiUrl: string;
  deployment: { env: Environment; timestamp: string; success: boolean };
  slackThreadTs: string;
  slackChannelId: string;
  datadogIncidentId: string;
  teamMember: { role: string; email: string; slackUserId?: string; name?: string };
  summary: string;
  status: string;
}>;

// ─── CRUD 함수 ─────────────────────────────────────────────────────────

/**
 * Jira 키로 맥락 조회. 없으면 null.
 */
export async function getContext(jiraKey: string): Promise<ContextLink | null> {
  const db = getDb();
  const results = await db
    .select()
    .from(contextLinks)
    .where(eq(contextLinks.jiraKey, jiraKey))
    .limit(1);
  return results[0] || null;
}

/**
 * 맥락 업데이트 (upsert). Jira 키 기준으로 생성 또는 병합.
 *
 * 배열 필드(githubPrNumbers, deployments 등)는 기존 값에 append.
 * 단일 필드는 덮어쓰기.
 */
export async function updateContext(update: ContextUpdate): Promise<ContextLink> {
  const existing = await getContext(update.jiraKey);

  if (!existing) {
    return createContext(update);
  }

  // Merge arrays
  const prNumbers = [...((existing.githubPrNumbers as number[]) || [])];
  const prUrls = [...((existing.githubPrUrls as string[]) || [])];
  const deployments = [...((existing.deployments as any[]) || [])];
  const incidentIds = [...((existing.datadogIncidentIds as string[]) || [])];
  const teamMembers = { ...((existing.teamMembers as Record<string, any>) || {}) };

  if (update.githubPrNumber && !prNumbers.includes(update.githubPrNumber)) {
    prNumbers.push(update.githubPrNumber);
  }
  if (update.githubPrUrl && !prUrls.includes(update.githubPrUrl)) {
    prUrls.push(update.githubPrUrl);
  }
  if (update.deployment) {
    deployments.push(update.deployment);
  }
  if (update.datadogIncidentId && !incidentIds.includes(update.datadogIncidentId)) {
    incidentIds.push(update.datadogIncidentId);
  }
  if (update.teamMember) {
    teamMembers[update.teamMember.role] = {
      email: update.teamMember.email,
      slackUserId: update.teamMember.slackUserId,
      name: update.teamMember.name,
    };
  }

  const db = getDb();
  const updated = await db
    .update(contextLinks)
    .set({
      ...(update.jiraUrl && { jiraUrl: update.jiraUrl }),
      ...(update.figmaFileKey && { figmaFileKey: update.figmaFileKey }),
      ...(update.figmaNodeIds && { figmaNodeIds: update.figmaNodeIds }),
      ...(update.figmaUrl && { figmaUrl: update.figmaUrl }),
      ...(update.githubRepo && { githubRepo: update.githubRepo }),
      ...(update.githubBranch && { githubBranch: update.githubBranch }),
      githubPrNumbers: prNumbers,
      githubPrUrls: prUrls,
      ...(update.previewId && { previewId: update.previewId }),
      ...(update.previewWebUrl && { previewWebUrl: update.previewWebUrl }),
      ...(update.previewApiUrl && { previewApiUrl: update.previewApiUrl }),
      deployments,
      ...(update.slackThreadTs && { slackThreadTs: update.slackThreadTs }),
      ...(update.slackChannelId && { slackChannelId: update.slackChannelId }),
      datadogIncidentIds: incidentIds,
      teamMembers,
      ...(update.summary && { summary: update.summary }),
      ...(update.status && { status: update.status }),
      updatedAt: new Date(),
    })
    .where(eq(contextLinks.id, existing.id))
    .returning();

  return updated[0];
}

async function createContext(update: ContextUpdate): Promise<ContextLink> {
  const db = getDb();
  const id = generateId('ctx');

  const teamMembers: Record<string, any> = {};
  if (update.teamMember) {
    teamMembers[update.teamMember.role] = {
      email: update.teamMember.email,
      slackUserId: update.teamMember.slackUserId,
      name: update.teamMember.name,
    };
  }

  const inserted = await db
    .insert(contextLinks)
    .values({
      id,
      jiraKey: update.jiraKey,
      env: update.env || 'int',
      jiraUrl: update.jiraUrl,
      figmaFileKey: update.figmaFileKey,
      figmaNodeIds: update.figmaNodeIds,
      figmaUrl: update.figmaUrl,
      githubRepo: update.githubRepo,
      githubBranch: update.githubBranch,
      githubPrNumbers: update.githubPrNumber ? [update.githubPrNumber] : [],
      githubPrUrls: update.githubPrUrl ? [update.githubPrUrl] : [],
      previewId: update.previewId,
      previewWebUrl: update.previewWebUrl,
      previewApiUrl: update.previewApiUrl,
      deployments: update.deployment ? [update.deployment] : [],
      slackThreadTs: update.slackThreadTs,
      slackChannelId: update.slackChannelId,
      datadogIncidentIds: update.datadogIncidentId ? [update.datadogIncidentId] : [],
      teamMembers,
      summary: update.summary,
      status: update.status,
    })
    .returning();

  return inserted[0];
}

// ─── 조회 헬퍼 ─────────────────────────────────────────────────────────

/** GitHub 브랜치명에서 Jira 키를 추출하여 맥락 조회 */
export async function getContextByBranch(branch: string): Promise<ContextLink | null> {
  const jiraKey = extractJiraKey(branch);
  return jiraKey ? getContext(jiraKey) : null;
}

/** PR 번호로 맥락 조회 */
export async function getContextByPr(prNumber: number): Promise<ContextLink | null> {
  const db = getDb();
  // JSONB array contains 조회
  const results = await db
    .select()
    .from(contextLinks)
    .where(sql`${contextLinks.githubPrNumbers} @> ${JSON.stringify([prNumber])}::jsonb`)
    .limit(1);
  return results[0] || null;
}

function extractJiraKey(text: string): string | null {
  const match = text.match(/([A-Z][A-Z0-9]+-\d+)/);
  return match?.[1] || null;
}
```

### 3.3 워크플로우 연동 (이벤트 훅)

기존 워크플로우의 주요 지점에서 `updateContext()`를 호출.

#### jira-auto-dev-multi.ts 연동 포인트

```typescript
// Phase 0: 워크플로우 시작 시
await updateContext({
  jiraKey: event.issueKey,
  env,
  jiraUrl: `https://${process.env.JIRA_HOST}/browse/${event.issueKey}`,
  summary: event.summary,
  status: event.status,
  // Figma 컨텍스트가 있으면
  ...(figmaContext && {
    figmaFileKey: figmaContext.fileKey,
    figmaNodeIds: figmaContext.nodeIds,
    figmaUrl: figmaContext.fileUrl,
  }),
});

// Phase 1: 브랜치 생성 후
await updateContext({
  jiraKey: event.issueKey,
  githubRepo: `${owner}/${repo}`,
  githubBranch: branchName,
});

// Phase 3: PR 생성 후
await updateContext({
  jiraKey: event.issueKey,
  githubPrNumber: prResults.prNumber,
  githubPrUrl: prResults.prUrl,
});

// Phase 3.5: 프리뷰 생성 후
if (previewResult?.success) {
  await updateContext({
    jiraKey: event.issueKey,
    previewId: previewResult.preview.id,
    previewWebUrl: previewResult.preview.webUrl,
    previewApiUrl: previewResult.preview.apiUrl,
  });
}
```

#### target-deploy.ts 연동 포인트

```typescript
// 배포 완료 시 — 브랜치명에서 Jira 키 추출
const jiraKey = extractJiraKey(event.branch || '');
if (jiraKey) {
  await updateContext({
    jiraKey,
    deployment: {
      env,
      timestamp: new Date().toISOString(),
      success: deployResult.success,
    },
  });
}
```

### 3.4 조회 API (Dashboard + Chat)

**위치**: `packages/webhook-listener/src/routes/context.ts` (신규)

```typescript
import { Router } from 'express';
import { getContext } from '../utils/context-engine'; // Re-export or shared

export function createContextRouter() {
  const router = Router();

  // GET /api/context/:jiraKey
  router.get('/api/context/:jiraKey', async (req, res) => {
    const ctx = await getContext(req.params.jiraKey);
    if (!ctx) {
      res.status(404).json({ error: 'Context not found' });
      return;
    }
    res.json(ctx);
  });

  return router;
}
```

**Chat Tool 추가** (`utils/chat-tools.ts`):

```typescript
// 기존 4개 도구에 추가
{
  name: 'get_issue_context',
  description: 'Get full cross-tool context for a Jira issue (Figma, GitHub PRs, previews, deployments)',
  input_schema: {
    type: 'object',
    properties: {
      jira_key: { type: 'string', description: 'Jira issue key (e.g., PROJ-123)' },
    },
    required: ['jira_key'],
  },
}
```

## 4. 마이그레이션

```sql
-- drizzle/0003_add_context_links.sql
CREATE TABLE context_links (
  id VARCHAR(255) PRIMARY KEY,
  jira_key VARCHAR(50) NOT NULL,
  jira_url VARCHAR(500),
  figma_file_key VARCHAR(200),
  figma_node_ids JSONB,
  figma_url VARCHAR(500),
  github_repo VARCHAR(200),
  github_branch VARCHAR(200),
  github_pr_numbers JSONB DEFAULT '[]',
  github_pr_urls JSONB DEFAULT '[]',
  preview_id VARCHAR(255),
  preview_web_url VARCHAR(500),
  preview_api_url VARCHAR(500),
  deployments JSONB DEFAULT '[]',
  slack_thread_ts VARCHAR(100),
  slack_channel_id VARCHAR(100),
  datadog_incident_ids JSONB DEFAULT '[]',
  team_members JSONB DEFAULT '{}',
  env VARCHAR(10) NOT NULL DEFAULT 'int',
  summary VARCHAR(500),
  status VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_context_links_jira_key ON context_links(jira_key);
CREATE INDEX idx_context_links_github_branch ON context_links(github_branch);
CREATE INDEX idx_context_links_figma_file ON context_links(figma_file_key);
CREATE INDEX idx_context_links_preview_id ON context_links(preview_id);
CREATE INDEX idx_context_links_env ON context_links(env);
```

## 5. 구현 순서

1. `packages/shared/src/db/schema.ts` — `contextLinks` 테이블 추가
2. `drizzle/0003_add_context_links.sql` — 마이그레이션
3. `packages/workflow-engine/src/utils/context-engine.ts` — CRUD 모듈
4. `jira-auto-dev-multi.ts` — updateContext 호출 삽입 (4곳)
5. `target-deploy.ts` — updateContext 호출 삽입 (1곳)
6. `packages/webhook-listener/src/routes/context.ts` — API 라우트
7. `packages/webhook-listener/src/utils/chat-tools.ts` — chat tool 추가
8. 테스트 파일

## 6. 테스트 계획

| 테스트               | 검증 내용                              |
| -------------------- | -------------------------------------- |
| Create               | Jira 키로 새 맥락 생성                 |
| Update — 단일 필드   | 기존 맥락에 브랜치명 추가              |
| Update — 배열 append | PR 번호가 기존 배열에 추가되는지       |
| Update — 중복 방지   | 같은 PR 번호 두 번 추가해도 1개만 유지 |
| Get by branch        | 브랜치명에서 Jira 키 추출하여 조회     |
| Get by PR            | PR 번호로 JSONB 배열 검색              |
| API 조회             | GET /api/context/PROJ-123 응답 검증    |

## 7. 다른 기능과의 연동

| 기능                     | 연동 방식                                                      |
| ------------------------ | -------------------------------------------------------------- |
| **A-1 역할 인식형 알림** | `updateContext`의 `teamMembers`로 수신자 자동 결정             |
| **A-2 PR 맥락 첨부**     | `getContext()`로 Figma URL, Jira 요구사항, wiki 참조 자동 첨부 |
| **A-3 일일 다이제스트**  | `contextLinks` 테이블에서 어제 업데이트된 항목 집계            |
| **B-2 스마트 핸드오프**  | 상태 변경 시 `getContext()`로 전체 맥락 브리핑 생성            |
| **B-3 블로커 감지**      | `contextLinks`의 status + updatedAt으로 정체 티켓 감지         |
