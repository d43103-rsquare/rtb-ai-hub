# B-3: Dependency & Blocker Detection (의존성/블로커 감지)

> ✅ **구현 완료** — 2026-02-11
>
> **구현 파일**: `blocker-detector.ts`, `blocker-formatter.ts`, `blocker-scheduler.ts` (신규), `constants.ts`, `index.ts` (수정)
> **테스트**: 19개 (`blocker-detector.test.ts`, `blocker-formatter.test.ts`)
>
> **우선순위**: Phase B
> **난이도**: 중간 — Jira API 분석 + 주기적 감지 + 알림
> **의존성**: B-1 (Context Engine) 권장, A-1 (Role-aware Notifications) 활용
> **예상 작업량**: 3~5일

---

## 1. 목표

**정체된 티켓, 의존성 블로커, 리뷰 대기 지연**을 주기적으로 감지하고,
관련자에게 선제적으로 알림을 보내 팀의 업무 흐름이 막히지 않게 한다.

## 2. 감지 대상

| 유형                   | 조건                                          | 심각도                              |
| ---------------------- | --------------------------------------------- | ----------------------------------- |
| **정체 티켓**          | "In Progress" 상태에서 N일 이상 변경 없음     | critical (3일+), warning (2일)      |
| **리뷰 대기 지연**     | PR이 open 상태에서 N시간 이상 리뷰 없음       | warning (24h+), critical (48h+)     |
| **의존성 블로커**      | 티켓 A가 블로킹되어 하위 N개 티켓이 대기중    | critical (하위 2개+), warning (1개) |
| **CI 반복 실패**       | 같은 PR에서 CI가 N회 연속 실패                | warning                             |
| **스프린트 목표 위험** | 스프린트 잔여 일수 대비 미완료 SP 비율이 높음 | warning                             |

## 3. 출력 예시

```
⚠️ 블로커 감지 알림 — 2026-02-10 14:00

🔴 [CRITICAL] 정체 티켓
PROJ-130 (결제 API 연동) — 3일째 "In Progress"
  담당: 박백엔드
  영향: 2건 대기중
    └ PROJ-131 (결제 UI) — 김프론트
    └ PROJ-132 (결제 테스트) — 이QA
  💡 제안: 박백엔드에게 확인 요청. 기술적 어려움이면 최시니어 페어링 추천.

🟡 [WARNING] 리뷰 대기 지연
PR #42 (PROJ-125 대시보드 차트) — 36시간 리뷰 대기
  작성자: 정개발
  리뷰어: 미지정
  💡 제안: 리뷰어를 지정해주세요.

🟡 [WARNING] 스프린트 목표 위험
Sprint 23: 잔여 3일, 미완료 45% (18/40 SP)
  💡 제안: 스코프 조정 또는 우선순위 재정렬 필요.
```

## 4. 상세 설계

### 4.1 Blocker Detector 모듈

**위치**: `packages/workflow-engine/src/utils/blocker-detector.ts` (신규)

```typescript
import { createLogger, loadJiraPollingConfig } from '@rtb-ai-hub/shared';

const logger = createLogger('blocker-detector');

// ─── 감지 설정 ─────────────────────────────────────────────────────────

export type BlockerDetectorConfig = {
  enabled: boolean;
  intervalMs: number; // 감지 주기 (기본: 4시간)
  staleThresholdDays: number; // 정체 판정 일수 (기본: 3)
  staleWarningDays: number; // 경고 일수 (기본: 2)
  reviewDelayHours: number; // 리뷰 지연 판정 시간 (기본: 24)
  reviewCriticalHours: number; // 리뷰 심각 판정 시간 (기본: 48)
};

export function loadBlockerConfig(): BlockerDetectorConfig {
  return {
    enabled: process.env.BLOCKER_DETECTION_ENABLED === 'true',
    intervalMs: Number(process.env.BLOCKER_CHECK_INTERVAL_MS) || 4 * 60 * 60 * 1000,
    staleThresholdDays: Number(process.env.BLOCKER_STALE_DAYS) || 3,
    staleWarningDays: Number(process.env.BLOCKER_STALE_WARNING_DAYS) || 2,
    reviewDelayHours: Number(process.env.BLOCKER_REVIEW_DELAY_HOURS) || 24,
    reviewCriticalHours: Number(process.env.BLOCKER_REVIEW_CRITICAL_HOURS) || 48,
  };
}

// ─── 감지 결과 타입 ────────────────────────────────────────────────────

export type BlockerAlert = {
  severity: 'critical' | 'warning';
  type: 'stale_ticket' | 'review_delay' | 'dependency_block' | 'ci_failure' | 'sprint_risk';
  title: string;
  detail: string;
  suggestion: string;
  issueKey?: string;
  prNumber?: number;
  affectedItems?: string[]; // 영향받는 하위 항목
  assignee?: string;
};

// ─── 감지 로직 ─────────────────────────────────────────────────────────

export async function detectBlockers(): Promise<BlockerAlert[]> {
  const config = loadBlockerConfig();
  if (!config.enabled) return [];

  const alerts: BlockerAlert[] = [];

  const [staleAlerts, reviewAlerts, dependencyAlerts] = await Promise.allSettled([
    detectStaleTickets(config),
    detectReviewDelays(config),
    detectDependencyBlocks(config),
  ]);

  if (staleAlerts.status === 'fulfilled') alerts.push(...staleAlerts.value);
  if (reviewAlerts.status === 'fulfilled') alerts.push(...reviewAlerts.value);
  if (dependencyAlerts.status === 'fulfilled') alerts.push(...dependencyAlerts.value);

  // 심각도 순 정렬
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1 };
    return order[a.severity] - order[b.severity];
  });

  return alerts;
}

// ─── 정체 티켓 감지 ────────────────────────────────────────────────────

async function detectStaleTickets(config: BlockerDetectorConfig): Promise<BlockerAlert[]> {
  const jiraConfig = loadJiraPollingConfig();
  if (!jiraConfig.jiraHost) return [];

  // In Progress 상태이면서 최근 N일간 변경 없는 티켓
  const jql = [
    `project = "${jiraConfig.projectKey}"`,
    `status = "In Progress"`,
    `updated <= "-${config.staleWarningDays}d"`,
  ].join(' AND ');

  const issues = await fetchJiraIssues(jiraConfig, jql);

  return issues.map((issue) => {
    const daysSinceUpdate = getDaysSince(issue.fields.updated);
    const severity = daysSinceUpdate >= config.staleThresholdDays ? 'critical' : 'warning';

    return {
      severity,
      type: 'stale_ticket' as const,
      title: `${issue.key} (${issue.fields.summary}) — ${daysSinceUpdate}일째 진행 없음`,
      detail: `담당: ${issue.fields.assignee?.displayName || '미지정'}`,
      suggestion:
        daysSinceUpdate >= config.staleThresholdDays
          ? '담당자에게 확인이 필요합니다. 기술적 어려움이면 페어링을 추천합니다.'
          : '진행 상황을 확인해주세요.',
      issueKey: issue.key,
      assignee: issue.fields.assignee?.emailAddress,
    };
  });
}

// ─── 리뷰 대기 감지 ────────────────────────────────────────────────────

async function detectReviewDelays(config: BlockerDetectorConfig): Promise<BlockerAlert[]> {
  // GitHub API로 open PR 목록 조회
  // 각 PR의 리뷰 요청 시점 대비 현재 시간 계산
  // TODO: GitHub MCP 또는 REST API 사용
  return []; // 구현 시 채움
}

// ─── 의존성 블로커 감지 ────────────────────────────────────────────────

async function detectDependencyBlocks(config: BlockerDetectorConfig): Promise<BlockerAlert[]> {
  const jiraConfig = loadJiraPollingConfig();
  if (!jiraConfig.jiraHost) return [];

  // "is blocked by" 링크가 있는 티켓 중, 블로커가 미완료인 것
  const jql = [
    `project = "${jiraConfig.projectKey}"`,
    `status != Done`,
    `issueFunction in linkedIssuesOf("status != Done", "is blocked by")`,
  ].join(' AND ');

  // 참고: JQL issueFunction은 Jira Advanced 기능
  // 기본 JQL로는 링크 조회가 어려우므로, 대안으로:
  // 1) 현재 스프린트의 모든 티켓을 가져온 후
  // 2) 각 티켓의 links를 확인하여 블로커 관계 파악

  return []; // 구현 시 채움
}

// ─── Helper ────────────────────────────────────────────────────────────

function getDaysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}
```

### 4.2 Blocker Scheduler

**위치**: `packages/workflow-engine/src/utils/blocker-scheduler.ts` (신규)

```typescript
import { Queue, Worker } from 'bullmq';
import { createLogger } from '@rtb-ai-hub/shared';
import { createRedisConnection } from '../queue/connection';
import { detectBlockers, loadBlockerConfig } from './blocker-detector';
import { formatBlockerAlerts } from './blocker-formatter';

const logger = createLogger('blocker-scheduler');

export class BlockerScheduler {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  async start(): Promise<void> {
    const config = loadBlockerConfig();
    if (!config.enabled) {
      logger.info('Blocker detection disabled');
      return;
    }

    const connection = createRedisConnection();
    this.queue = new Queue('blocker-detection', { connection });

    // 4시간마다 실행 (평일 업무시간만)
    // Cron: "0 2,6,10 * * 1-5" = 평일 UTC 02,06,10시 (KST 11,15,19시)
    const cronExpression = process.env.BLOCKER_CHECK_CRON || '0 2,6 * * 1-5';

    await this.queue.add(
      'check-blockers',
      {},
      {
        repeat: { pattern: cronExpression },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    this.worker = new Worker(
      'blocker-detection',
      async () => {
        const alerts = await detectBlockers();

        if (alerts.length === 0) {
          logger.info('No blockers detected');
          return;
        }

        logger.info({ alertCount: alerts.length }, 'Blockers detected');

        const message = formatBlockerAlerts(alerts);
        // Slack 전송 (팀 리더 채널 또는 기본 채널)
        await sendToSlack(message);
      },
      { connection, concurrency: 1 }
    );

    logger.info({ cron: cronExpression }, 'Blocker scheduler started');
  }

  async stop(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}
```

### 4.3 Alert Formatter

**위치**: `packages/workflow-engine/src/utils/blocker-formatter.ts` (신규)

```typescript
import type { BlockerAlert } from './blocker-detector';

export function formatBlockerAlerts(alerts: BlockerAlert[]): string {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const sections: string[] = [];

  sections.push(`⚠️ 블로커 감지 알림 — ${now}\n`);

  const critical = alerts.filter((a) => a.severity === 'critical');
  const warnings = alerts.filter((a) => a.severity === 'warning');

  if (critical.length > 0) {
    for (const alert of critical) {
      sections.push(`🔴 [CRITICAL] ${alert.title}`);
      sections.push(`  ${alert.detail}`);
      if (alert.affectedItems?.length) {
        sections.push(`  영향: ${alert.affectedItems.length}건 대기중`);
        for (const item of alert.affectedItems) {
          sections.push(`    └ ${item}`);
        }
      }
      sections.push(`  💡 ${alert.suggestion}\n`);
    }
  }

  if (warnings.length > 0) {
    for (const alert of warnings) {
      sections.push(`🟡 [WARNING] ${alert.title}`);
      sections.push(`  ${alert.detail}`);
      sections.push(`  💡 ${alert.suggestion}\n`);
    }
  }

  return sections.join('\n');
}
```

### 4.4 환경변수

```bash
# .env.advanced
BLOCKER_DETECTION_ENABLED=true
BLOCKER_CHECK_CRON="0 2,6 * * 1-5"     # 평일 KST 11시, 15시
BLOCKER_STALE_DAYS=3                     # 정체 판정 (critical)
BLOCKER_STALE_WARNING_DAYS=2             # 정체 경고 (warning)
BLOCKER_REVIEW_DELAY_HOURS=24            # 리뷰 지연 (warning)
BLOCKER_REVIEW_CRITICAL_HOURS=48         # 리뷰 지연 (critical)

# 블로커 알림 전용 채널 (선택)
BLOCKER_ALERT_CHANNEL=C07890123
```

## 5. 구현 순서

1. `packages/shared/src/constants.ts` — Feature flag + config 타입
2. `packages/workflow-engine/src/utils/blocker-detector.ts` — 감지 로직
3. `packages/workflow-engine/src/utils/blocker-formatter.ts` — 포맷터
4. `packages/workflow-engine/src/utils/blocker-scheduler.ts` — 스케줄러
5. `packages/workflow-engine/src/index.ts` — 스케줄러 시작
6. 테스트

## 6. 테스트 계획

| 테스트         | 검증 내용                                |
| -------------- | ---------------------------------------- |
| 정체 감지      | 3일 이상 변경 없는 In Progress 티켓 감지 |
| 경고/심각 분류 | 2일=warning, 3일+=critical 올바르게 분류 |
| 리뷰 지연      | 24시간+ open PR 감지                     |
| 포맷           | critical → warning 순서로 출력           |
| 비활성         | enabled=false일 때 빈 배열 반환          |

## 7. A-3 다이제스트 연동

블로커 감지 결과는 `A-3 Daily Team Digest`에도 포함:

```typescript
// digest-collector.ts에서
import { detectBlockers } from './blocker-detector';

// 다이제스트 수집 시 블로커도 함께 수집
const blockerAlerts = await detectBlockers();
data.alerts.push(...blockerAlerts.map(toAlertItem));
```

이를 통해 **일일 다이제스트에 블로커 섹션이 자동으로 포함**됨.
별도 주기적 알림은 업무 시간 중 실시간 감지, 다이제스트는 아침 요약으로 이중 안전망 구성.
