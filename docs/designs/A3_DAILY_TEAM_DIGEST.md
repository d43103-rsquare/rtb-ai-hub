# A-3: Daily Team Digest (일일 팀 다이제스트)

> ✅ **구현 완료** — 2026-02-11
>
> **구현 파일**: `digest-collector.ts`, `digest-formatter.ts`, `digest-scheduler.ts` (신규), `constants.ts`, `index.ts` (수정)
> **테스트**: 17개 (`digest-formatter.test.ts`, `digest-collector.test.ts`)
>
> **우선순위**: Phase A (Quick Win)
> **난이도**: 중간 — 새로운 워크플로우 + Jira/GitHub API 집계
> **의존성**: 없음 (독립 구현 가능, B-1 Context Engine이 있으면 더 풍부)
> **예상 작업량**: 3~5일

---

## 1. 목표

매일 지정된 시각에 **어제의 개발 활동 요약**을 Slack으로 자동 전송한다.
팀 전체가 비동기적으로 현황을 파악하고, 블로커를 조기에 인지할 수 있게 한다.

## 2. 출력 예시

```
📊 RTB 데일리 다이제스트 — 2026-02-10 (월)

━━━ 📈 스프린트 현황 ━━━
완료: 3건 (PROJ-123, PROJ-125, PROJ-128)
진행중: 5건
대기중: 2건

━━━ 🔀 GitHub 활동 ━━━
PR 생성: 2건 (#42, #45)
PR 머지: 1건 (#40)
리뷰 대기: 2건 (#42 — 48시간, #45 — 6시간)

━━━ 🚀 배포 ━━━
int: 2회 (성공 2)
stg: 0회
prd: 0회

━━━ ⚠️ 주의 사항 ━━━
🔴 블로커: PROJ-130 (결제 API) — 3일째 진행 없음. 하위 2건 대기중.
🟡 리뷰 지연: PR #42 — 48시간 대기. 리뷰어 지정 필요.
🟡 CI 실패: PR #45 — lint 단계 실패. 담당자 확인 필요.

━━━ 🤖 AI 워크플로우 ━━━
실행: 4건 (성공 3, 실패 1)
비용: $0.23
실패: PROJ-130 — "MCP tool call timeout"
```

## 3. 상세 설계

### 3.1 데이터 수집 소스

| 소스                    | 수집 방법                         | 수집 데이터                                    |
| ----------------------- | --------------------------------- | ---------------------------------------------- |
| **Jira**                | REST API `/rest/api/3/search/jql` | 스프린트 티켓 상태별 카운트, 블로커, 상태 변경 |
| **GitHub**              | MCP Server 또는 REST API          | PR 목록 (open/merged), 리뷰 상태, CI 상태      |
| **workflow_executions** | PostgreSQL 직접 조회              | 어제 실행된 워크플로우, 성공/실패, 비용        |
| **Redis**               | Preview 상태 조회                 | 활성 프리뷰 환경 목록                          |

### 3.2 새로운 모듈

#### 3.2.1 Digest Data Collector

**위치**: `packages/workflow-engine/src/utils/digest-collector.ts` (신규)

```typescript
import { createLogger } from '@rtb-ai-hub/shared';
import type { Environment } from '@rtb-ai-hub/shared';
import { database } from '../clients/database';

const logger = createLogger('digest-collector');

// ─── 수집 결과 타입 ────────────────────────────────────────────────────

export type DigestData = {
  date: string; // YYYY-MM-DD
  sprint: SprintSummary;
  github: GitHubSummary;
  deployments: DeploymentSummary;
  alerts: AlertItem[];
  aiWorkflows: AiWorkflowSummary;
};

type SprintSummary = {
  completed: JiraIssueBrief[];
  inProgress: JiraIssueBrief[];
  blocked: JiraIssueBrief[]; // 3일 이상 상태 변경 없음
  totalPoints?: number;
};

type JiraIssueBrief = {
  key: string;
  summary: string;
  assignee?: string;
  status: string;
  daysSinceUpdate?: number;
  blockedBy?: string[]; // 의존하는 티켓 키
};

type GitHubSummary = {
  prsCreated: PrBrief[];
  prsMerged: PrBrief[];
  prsAwaitingReview: PrBrief[]; // 리뷰 대기 시간 포함
  ciFailures: PrBrief[];
};

type PrBrief = {
  number: number;
  title: string;
  author?: string;
  hoursWaiting?: number; // 리뷰 대기 시간
  ciStatus?: string;
  issueKey?: string; // PR 제목에서 추출한 Jira 키
};

type DeploymentSummary = {
  int: { count: number; success: number; failed: number };
  stg: { count: number; success: number; failed: number };
  prd: { count: number; success: number; failed: number };
};

type AlertItem = {
  severity: 'critical' | 'warning' | 'info';
  type: 'blocker' | 'review_delay' | 'ci_failure' | 'stale_pr' | 'deploy_failure';
  message: string;
  issueKey?: string;
  prNumber?: number;
};

type AiWorkflowSummary = {
  total: number;
  success: number;
  failed: number;
  totalCostUsd: number;
  failures: Array<{ issueKey: string; error: string }>;
};

// ─── 수집 함수 ────────────────────────────────────────────────────────

export async function collectDigestData(targetDate: Date = yesterday()): Promise<DigestData> {
  const dateStr = targetDate.toISOString().slice(0, 10);

  const [sprint, github, deployments, aiWorkflows] = await Promise.allSettled([
    collectSprintData(targetDate),
    collectGitHubData(targetDate),
    collectDeploymentData(targetDate),
    collectAiWorkflowData(targetDate),
  ]);

  const data: DigestData = {
    date: dateStr,
    sprint: sprint.status === 'fulfilled' ? sprint.value : emptySprintSummary(),
    github: github.status === 'fulfilled' ? github.value : emptyGitHubSummary(),
    deployments: deployments.status === 'fulfilled' ? deployments.value : emptyDeploymentSummary(),
    alerts: [],
    aiWorkflows: aiWorkflows.status === 'fulfilled' ? aiWorkflows.value : emptyAiSummary(),
  };

  // 알림 항목 생성
  data.alerts = generateAlerts(data);

  return data;
}

async function collectSprintData(date: Date): Promise<SprintSummary> {
  // Jira REST API로 현재 스프린트 티켓 조회
  const config = loadJiraPollingConfig();
  if (!config.jiraHost || !config.jiraEmail || !config.jiraApiToken) {
    return emptySprintSummary();
  }

  const authToken = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');

  // 1. 현재 스프린트의 모든 티켓
  const jql = `project = "${config.projectKey}" AND sprint in openSprints()`;
  const response = await fetchJira(config.jiraHost, authToken, jql);

  // 2. 상태별 분류
  const completed = response.issues
    .filter((i: any) => i.fields.status.name === 'Done')
    .map(briefFromJira);

  const inProgress = response.issues
    .filter((i: any) => i.fields.status.name === 'In Progress')
    .map(briefFromJira);

  const blocked = response.issues
    .filter((i: any) => {
      const updated = new Date(i.fields.updated);
      const daysSince = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
      return i.fields.status.name === 'In Progress' && daysSince >= 3;
    })
    .map((i: any) => ({
      ...briefFromJira(i),
      daysSinceUpdate: Math.floor(
        (Date.now() - new Date(i.fields.updated).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

  return { completed, inProgress, blocked };
}

async function collectGitHubData(date: Date): Promise<GitHubSummary> {
  // GitHub REST API 또는 MCP를 통해 PR 데이터 수집
  // 구현은 GitHub token 유무에 따라 분기
  return emptyGitHubSummary(); // TODO: 실제 구현
}

async function collectDeploymentData(date: Date): Promise<DeploymentSummary> {
  // workflow_executions 테이블에서 target-deploy 타입 조회
  // 실제 쿼리는 database.ts에 함수 추가
  return emptyDeploymentSummary(); // TODO: 실제 구현
}

async function collectAiWorkflowData(date: Date): Promise<AiWorkflowSummary> {
  // workflow_executions 테이블에서 어제 날짜 실행 조회
  return emptyAiSummary(); // TODO: 실제 구현
}

function generateAlerts(data: DigestData): AlertItem[] {
  const alerts: AlertItem[] = [];

  // 블로커 감지
  for (const issue of data.sprint.blocked) {
    alerts.push({
      severity: 'critical',
      type: 'blocker',
      message: `${issue.key} (${issue.summary}) — ${issue.daysSinceUpdate}일째 진행 없음`,
      issueKey: issue.key,
    });
  }

  // 리뷰 대기 지연 (24시간 이상)
  for (const pr of data.github.prsAwaitingReview) {
    if (pr.hoursWaiting && pr.hoursWaiting >= 24) {
      alerts.push({
        severity: 'warning',
        type: 'review_delay',
        message: `PR #${pr.number} — ${Math.floor(pr.hoursWaiting)}시간 리뷰 대기`,
        prNumber: pr.number,
        issueKey: pr.issueKey,
      });
    }
  }

  // CI 실패
  for (const pr of data.github.ciFailures) {
    alerts.push({
      severity: 'warning',
      type: 'ci_failure',
      message: `PR #${pr.number} CI 실패 — 담당자 확인 필요`,
      prNumber: pr.number,
      issueKey: pr.issueKey,
    });
  }

  return alerts;
}

// ─── Helper functions ─────────────────────────────────────────────────
function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}
function briefFromJira(issue: any): JiraIssueBrief {
  /* ... */
}
function emptySprintSummary(): SprintSummary {
  /* ... */
}
function emptyGitHubSummary(): GitHubSummary {
  /* ... */
}
function emptyDeploymentSummary(): DeploymentSummary {
  /* ... */
}
function emptyAiSummary(): AiWorkflowSummary {
  /* ... */
}
```

#### 3.2.2 Digest Formatter

**위치**: `packages/workflow-engine/src/utils/digest-formatter.ts` (신규)

```typescript
import type { DigestData } from './digest-collector';

export function formatDigestMessage(data: DigestData): string {
  const sections: string[] = [];

  // Header
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][new Date(data.date).getDay()];
  sections.push(`📊 RTB 데일리 다이제스트 — ${data.date} (${dayOfWeek})\n`);

  // Sprint
  sections.push('━━━ 📈 스프린트 현황 ━━━');
  sections.push(
    `완료: ${data.sprint.completed.length}건${data.sprint.completed.length > 0 ? ` (${data.sprint.completed.map((i) => i.key).join(', ')})` : ''}`
  );
  sections.push(`진행중: ${data.sprint.inProgress.length}건`);
  if (data.sprint.blocked.length > 0) {
    sections.push(`⚠️ 정체: ${data.sprint.blocked.length}건`);
  }

  // GitHub
  sections.push('\n━━━ 🔀 GitHub 활동 ━━━');
  sections.push(`PR 생성: ${data.github.prsCreated.length}건`);
  sections.push(`PR 머지: ${data.github.prsMerged.length}건`);
  if (data.github.prsAwaitingReview.length > 0) {
    sections.push(`리뷰 대기: ${data.github.prsAwaitingReview.length}건`);
  }

  // Deployments
  sections.push('\n━━━ 🚀 배포 ━━━');
  for (const env of ['int', 'stg', 'prd'] as const) {
    const d = data.deployments[env];
    if (d.count > 0) {
      sections.push(
        `${env}: ${d.count}회 (성공 ${d.success}${d.failed > 0 ? `, 실패 ${d.failed}` : ''})`
      );
    } else {
      sections.push(`${env}: 0회`);
    }
  }

  // Alerts (가장 중요)
  if (data.alerts.length > 0) {
    sections.push('\n━━━ ⚠️ 주의 사항 ━━━');
    for (const alert of data.alerts) {
      const icon = alert.severity === 'critical' ? '🔴' : '🟡';
      sections.push(`${icon} ${alert.message}`);
    }
  }

  // AI Workflows
  if (data.aiWorkflows.total > 0) {
    sections.push('\n━━━ 🤖 AI 워크플로우 ━━━');
    sections.push(
      `실행: ${data.aiWorkflows.total}건 (성공 ${data.aiWorkflows.success}, 실패 ${data.aiWorkflows.failed})`
    );
    sections.push(`비용: $${data.aiWorkflows.totalCostUsd.toFixed(2)}`);
  }

  return sections.join('\n');
}
```

#### 3.2.3 Digest Scheduler (Cron Job)

**위치**: `packages/workflow-engine/src/utils/digest-scheduler.ts` (신규)

```typescript
import { Queue, QueueScheduler } from 'bullmq';
import { createLogger, QUEUE_NAMES } from '@rtb-ai-hub/shared';
import { createRedisConnection } from '../queue/connection';
import { collectDigestData } from './digest-collector';
import { formatDigestMessage } from './digest-formatter';
import { notifyByRole } from './role-notifier'; // A-1 연동

const logger = createLogger('digest-scheduler');

export class DigestScheduler {
  private queue: Queue | null = null;

  async start(): Promise<void> {
    const enabled = process.env.TEAM_DIGEST_ENABLED === 'true';
    if (!enabled) {
      logger.info('Team digest disabled');
      return;
    }

    const connection = createRedisConnection();

    // BullMQ repeatable job — 매일 아침 9시 (KST)
    // Cron: "0 0 * * 1-5" = 평일 UTC 00:00 (KST 09:00)
    const cronExpression = process.env.TEAM_DIGEST_CRON || '0 0 * * 1-5';

    this.queue = new Queue('team-digest', { connection });

    await this.queue.add(
      'daily-digest',
      {},
      {
        repeat: { pattern: cronExpression },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    logger.info({ cron: cronExpression }, 'Team digest scheduler started');
  }

  async stop(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }
}

// Worker에서 호출될 핸들러
export async function processTeamDigest(): Promise<void> {
  logger.info('Generating daily team digest');

  try {
    const data = await collectDigestData();
    const message = formatDigestMessage(data);

    // 기본 채널에 전체 다이제스트 전송
    const config = loadTeamNotifyConfig();
    if (config.enabled && config.slackBotToken && config.defaultChannel) {
      await sendSlackMessage(config.slackBotToken, config.defaultChannel, message);
    }

    logger.info({ date: data.date, alertCount: data.alerts.length }, 'Digest sent');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to generate digest'
    );
  }
}
```

### 3.3 Worker 등록

**위치**: `packages/workflow-engine/src/queue/workers.ts`

```typescript
// 기존 createWorkers() 내부에 추가
const digestWorker = new Worker(
  'team-digest',
  async (job) => {
    logger.info({ jobId: job.id }, 'Processing team digest');
    await processTeamDigest();
  },
  { connection, concurrency: 1 }
);
```

### 3.4 환경변수

```bash
# .env.advanced
TEAM_DIGEST_ENABLED=true
TEAM_DIGEST_CRON="0 0 * * 1-5"   # 평일 UTC 00:00 (KST 09:00)

# 선택: 다이제스트 전용 채널
TEAM_DIGEST_CHANNEL=C06789012
```

### 3.5 Feature Flag

```typescript
// packages/shared/src/constants.ts
FEATURE_FLAGS = {
  ...existing,
  TEAM_DIGEST_ENABLED: process.env.TEAM_DIGEST_ENABLED === 'true',
};
```

## 4. 구현 순서

1. `packages/shared/src/constants.ts` — Feature flag + DigestConfig 타입
2. `packages/workflow-engine/src/utils/digest-collector.ts` — 데이터 수집
3. `packages/workflow-engine/src/utils/digest-formatter.ts` — 메시지 포맷
4. `packages/workflow-engine/src/utils/digest-scheduler.ts` — 스케줄러
5. `packages/workflow-engine/src/queue/workers.ts` — Worker 등록
6. `packages/workflow-engine/src/index.ts` — 스케줄러 시작
7. 테스트 3개 파일

## 5. 테스트 계획

| 테스트                  | 검증 내용                                     |
| ----------------------- | --------------------------------------------- |
| Collector — Jira 파싱   | Jira API 응답에서 SprintSummary 올바르게 추출 |
| Collector — 블로커 감지 | 3일 이상 변경 없는 In Progress 티켓 감지      |
| Formatter — 전체 포맷   | 모든 데이터가 있을 때 완전한 메시지 생성      |
| Formatter — 빈 데이터   | 빈 스프린트/PR일 때 적절한 "0건" 표시         |
| Alert 생성              | 블로커, 리뷰 지연, CI 실패 각각 올바르게 감지 |
| 스케줄러                | Repeatable job이 올바른 cron으로 등록되는지   |

## 6. 확장 방향

- **역할별 다이제스트**: PM에게는 스프린트 중심, 개발자에게는 PR/CI 중심 (A-1 연동)
- **주간 다이제스트**: 주 1회 더 종합적인 요약 (스프린트 회고용)
- **AI 요약**: 수치 나열이 아닌, AI가 핵심 포인트를 자연어로 요약
- **대시보드 연동**: 다이제스트 데이터를 Dashboard에도 표시
- **Slack 인터랙션**: "자세히 보기" 버튼 → 대시보드 링크
