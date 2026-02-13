# C-3: Meeting Prep (회의 준비 자동화)

> **상태**: ✅ 구현 완료 (2026-02-11) — 20개 테스트
> **우선순위**: Phase C (Decision Facilitation)
> **난이도**: 중간 — 이벤트 집계 + AI 요약 + 스케줄링
> **의존성**: B-1 (Context Engine), A-3 (Daily Digest), B-3 (Blocker Detection), C-2 (Decision Journal) 활용
> **예상 작업량**: 3~4일

---

## 1. 목표

**스프린트 리뷰, 데일리 스크럼, 회고** 등 정기 회의 전에
AI가 **관련 활동 요약, 데모 가능 항목, 논의 필요 사항, 의사결정 필요 항목**을
자동으로 정리하여 Slack으로 전달한다.

회의 참가자가 별도 준비 없이도 핵심 논점을 파악하고 있는 상태에서 회의를 시작할 수 있게 한다.

## 2. 출력 예시

### 스프린트 리뷰 준비

```
📋 스프린트 리뷰 준비 — Sprint 23 (2026-02-03 ~ 2026-02-14)

✅ 완료 항목 (데모 가능):
1. PROJ-123 로그인 페이지 — PR #42 (머지됨)
   프리뷰: http://localhost:5100
   디자이너 확인: ⏳ 미확인
2. PROJ-125 대시보드 차트 — PR #45 (머지됨)
   프리뷰: http://localhost:5101
   디자이너 확인: ✅ 확인됨

🔄 진행중 (스프린트 내 완료 가능):
3. PROJ-128 알림 설정 — PR #48 (리뷰중, CI 통과)
   예상 완료: 오늘

⚠️ 미완료 (논의 필요):
4. PROJ-130 결제 API — 3일 지연, 기술 이슈
   블로커: 외부 PG API 응답 지연
   💡 스코프 축소 또는 다음 스프린트 이월 논의 필요
5. PROJ-132 결제 테스트 — PROJ-130 블로커로 미착수

📊 스프린트 현황:
- 완료: 8/12 티켓 (67%) — 24/40 SP
- 잔여 시간: 3일
- 번다운: 🟡 다소 뒤처짐

📝 이번 스프린트 기술 결정:
- [2/10] 결제 PG: 토스페이먼츠 선정
- [2/11] 캐시 TTL: 24h → 12h 변경

📌 다음 스프린트 후보 (백로그 상위):
1. PROJ-140 사용자 프로필 (5 SP)
2. PROJ-141 검색 개선 (8 SP)
3. PROJ-142 성능 최적화 (3 SP)
합계: 16 SP (팀 velocity 평균: 35 SP)
```

### 데일리 스크럼 준비

```
📋 데일리 스크럼 준비 — 2026-02-12 (수)

어제 주요 활동:
- PR #48 (PROJ-128 알림 설정) 머지됨
- PR #50 (PROJ-133 프로필 API) 리뷰 요청됨
- PROJ-130 결제 API: 진행 없음 (3일째)

오늘 예정:
- PROJ-133 프로필 API: 리뷰 완료 후 머지 예정
- PROJ-134 프로필 UI: 개발 착수

⚠️ 주의 사항:
- PROJ-130 블로커 지속 중 — 논의 필요
- PR #50 리뷰어 미지정 — 할당 필요

🔢 스프린트 진행: 9/12 완료 (75%), 잔여 2일
```

## 3. 회의 유형별 준비 내용

| 회의 유형         | 주기 | 준비 내용                                      | 데이터 소스                                             |
| ----------------- | ---- | ---------------------------------------------- | ------------------------------------------------------- |
| **스프린트 리뷰** | 2주  | 완료 항목 + 데모 + 미완료 논의 + 다음 스프린트 | Jira + GitHub + Context Engine + Decision Journal       |
| **데일리 스크럼** | 매일 | 어제 활동 + 오늘 예정 + 블로커                 | Jira + GitHub + Blocker Detection                       |
| **스프린트 회고** | 2주  | 잘한 점 + 개선점 + 메트릭                      | Workflow executions + Decision Journal + Digest history |
| **기술 리뷰**     | 수시 | 관련 PR + 영향 분석 + 과거 결정                | GitHub + Impact Analysis + Decision Journal             |

## 4. 상세 설계

### 4.1 Meeting Prep 모듈

**위치**: `packages/workflow-engine/src/utils/meeting-prep.ts` (신규)

```typescript
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('meeting-prep');

// ─── 타입 ────────────────────────────────────────────────────────────

export type MeetingType = 'sprint_review' | 'daily_scrum' | 'retrospective' | 'tech_review';

export type MeetingPrepConfig = {
  enabled: boolean;
  dailyScrumCron: string; // "0 23 * * 0-4" = 평일 KST 08:00
  sprintReviewBefore: number; // 스프린트 종료 N시간 전 준비
  slackChannel: string;
};

export type CompletedItem = {
  jiraKey: string;
  summary: string;
  prNumber?: number;
  prStatus: 'merged' | 'open' | 'none';
  previewUrl?: string;
  designerApproved?: boolean;
};

export type InProgressItem = {
  jiraKey: string;
  summary: string;
  prNumber?: number;
  expectedCompletion?: string;
};

export type BlockedItem = {
  jiraKey: string;
  summary: string;
  daysSinceUpdate: number;
  blockerReason: string;
  suggestion: string;
};

export type SprintReviewPrep = {
  sprintName: string;
  dateRange: string;
  completed: CompletedItem[];
  inProgress: InProgressItem[];
  blocked: BlockedItem[];
  sprintStats: {
    completedTickets: number;
    totalTickets: number;
    completedSP: number;
    totalSP: number;
    remainingDays: number;
    burndownStatus: 'on_track' | 'slightly_behind' | 'at_risk';
  };
  decisions: Array<{ date: string; title: string }>;
  backlogCandidates: Array<{ jiraKey: string; summary: string; storyPoints: number }>;
};

export type DailyScrumPrep = {
  date: string;
  yesterdayActivities: string[];
  todayPlanned: string[];
  warnings: string[];
  sprintProgress: { completed: number; total: number; remainingDays: number };
};

// ─── 스프린트 리뷰 준비 ──────────────────────────────────────────────

export async function prepareSprintReview(): Promise<SprintReviewPrep> {
  const [sprintData, prData, contextData, decisionData, blockerData] = await Promise.allSettled([
    fetchCurrentSprint(),
    fetchSprintPRs(),
    fetchSprintContext(),
    fetchSprintDecisions(),
    fetchSprintBlockers(),
  ]);

  // ... 데이터 조합하여 SprintReviewPrep 생성
  return {} as SprintReviewPrep;
}

// ─── 데일리 스크럼 준비 ──────────────────────────────────────────────

export async function prepareDailyScrum(): Promise<DailyScrumPrep> {
  const [yesterdayData, todayData, blockerData] = await Promise.allSettled([
    fetchYesterdayActivities(),
    fetchTodayPlanned(),
    fetchActiveBlockers(),
  ]);

  // ... 데이터 조합하여 DailyScrumPrep 생성
  return {} as DailyScrumPrep;
}
```

### 4.2 Data Collectors (Private)

```typescript
// ─── Jira 데이터 수집 ────────────────────────────────────────────────

async function fetchCurrentSprint(): Promise<{
  name: string;
  startDate: string;
  endDate: string;
  issues: Array<{
    key: string;
    summary: string;
    status: string;
    storyPoints: number;
    assignee: string;
    updated: string;
  }>;
}> {
  // Jira REST API: /rest/agile/1.0/board/{boardId}/sprint?state=active
  // 현재 활성 스프린트의 모든 이슈 조회
  return { name: '', startDate: '', endDate: '', issues: [] };
}

async function fetchSprintPRs(): Promise<
  Array<{
    number: number;
    title: string;
    state: 'open' | 'merged' | 'closed';
    jiraKey: string;
    reviewStatus: 'approved' | 'changes_requested' | 'pending' | 'none';
  }>
> {
  // GitHub API: 현재 스프린트 기간의 PR 목록
  // Context Engine (B-1)로 Jira key 매핑
  return [];
}

async function fetchYesterdayActivities(): Promise<string[]> {
  // 어제 날짜의 활동 수집:
  // 1. 머지된 PR
  // 2. 완료된 Jira 티켓
  // 3. 새로 열린 PR
  // 4. 상태 변경된 티켓
  return [];
}

async function fetchTodayPlanned(): Promise<string[]> {
  // 오늘 예정된 활동:
  // 1. 리뷰 대기중인 PR (리뷰어에게 할당됨)
  // 2. In Progress 상태 티켓
  // 3. 오늘 머지 예정 PR
  return [];
}

async function fetchActiveBlockers(): Promise<BlockedItem[]> {
  // B-3 Blocker Detection 결과 재활용
  // detectBlockers()의 결과를 BlockedItem 형태로 변환
  return [];
}

async function fetchSprintDecisions(): Promise<Array<{ date: string; title: string }>> {
  // C-2 Decision Journal에서 현재 스프린트 기간의 결정 조회
  // getRecentDecisions(sprintDays)
  return [];
}

async function fetchSprintContext(): Promise<Map<string, { previewUrl?: string }>> {
  // B-1 Context Engine에서 스프린트 티켓들의 프리뷰 URL 조회
  return new Map();
}
```

### 4.3 Meeting Prep Formatter

**위치**: `packages/workflow-engine/src/utils/meeting-prep-formatter.ts` (신규)

```typescript
import type { SprintReviewPrep, DailyScrumPrep } from './meeting-prep';

export function formatSprintReview(prep: SprintReviewPrep): string {
  const sections: string[] = [];

  sections.push(`📋 스프린트 리뷰 준비 — ${prep.sprintName} (${prep.dateRange})\n`);

  // 완료 항목
  if (prep.completed.length > 0) {
    sections.push('✅ 완료 항목 (데모 가능):');
    prep.completed.forEach((item, i) => {
      sections.push(`${i + 1}. ${item.jiraKey} ${item.summary} — PR #${item.prNumber} (머지됨)`);
      if (item.previewUrl) {
        sections.push(`   프리뷰: ${item.previewUrl}`);
      }
      const designCheck = item.designerApproved ? '✅ 확인됨' : '⏳ 미확인';
      sections.push(`   디자이너 확인: ${designCheck}`);
    });
    sections.push('');
  }

  // 진행중
  if (prep.inProgress.length > 0) {
    sections.push('🔄 진행중:');
    prep.inProgress.forEach((item, i) => {
      const prInfo = item.prNumber ? `PR #${item.prNumber}` : '미착수';
      sections.push(
        `${prep.completed.length + i + 1}. ${item.jiraKey} ${item.summary} — ${prInfo}`
      );
      if (item.expectedCompletion) {
        sections.push(`   예상 완료: ${item.expectedCompletion}`);
      }
    });
    sections.push('');
  }

  // 블로커
  if (prep.blocked.length > 0) {
    sections.push('⚠️ 미완료 (논의 필요):');
    prep.blocked.forEach((item, i) => {
      const idx = prep.completed.length + prep.inProgress.length + i + 1;
      sections.push(`${idx}. ${item.jiraKey} ${item.summary} — ${item.daysSinceUpdate}일 지연`);
      sections.push(`   블로커: ${item.blockerReason}`);
      sections.push(`   💡 ${item.suggestion}`);
    });
    sections.push('');
  }

  // 스프린트 현황
  const s = prep.sprintStats;
  const burndownIcon =
    s.burndownStatus === 'on_track' ? '🟢' : s.burndownStatus === 'slightly_behind' ? '🟡' : '🔴';
  sections.push('📊 스프린트 현황:');
  sections.push(
    `- 완료: ${s.completedTickets}/${s.totalTickets} 티켓 (${Math.round((s.completedTickets / s.totalTickets) * 100)}%) — ${s.completedSP}/${s.totalSP} SP`
  );
  sections.push(`- 잔여 시간: ${s.remainingDays}일`);
  sections.push(
    `- 번다운: ${burndownIcon} ${s.burndownStatus === 'on_track' ? '정상' : s.burndownStatus === 'slightly_behind' ? '다소 뒤처짐' : '위험'}`
  );
  sections.push('');

  // 기술 결정
  if (prep.decisions.length > 0) {
    sections.push('📝 이번 스프린트 기술 결정:');
    prep.decisions.forEach((d) => {
      sections.push(`- [${d.date}] ${d.title}`);
    });
    sections.push('');
  }

  // 다음 스프린트 후보
  if (prep.backlogCandidates.length > 0) {
    sections.push('📌 다음 스프린트 후보 (백로그 상위):');
    let totalSP = 0;
    prep.backlogCandidates.forEach((item, i) => {
      sections.push(`${i + 1}. ${item.jiraKey} ${item.summary} (${item.storyPoints} SP)`);
      totalSP += item.storyPoints;
    });
    sections.push(`합계: ${totalSP} SP`);
  }

  return sections.join('\n');
}

export function formatDailyScrum(prep: DailyScrumPrep): string {
  const sections: string[] = [];

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[new Date(prep.date).getDay()];
  sections.push(`📋 데일리 스크럼 준비 — ${prep.date} (${dayName})\n`);

  // 어제 활동
  if (prep.yesterdayActivities.length > 0) {
    sections.push('어제 주요 활동:');
    prep.yesterdayActivities.forEach((a) => sections.push(`- ${a}`));
    sections.push('');
  }

  // 오늘 예정
  if (prep.todayPlanned.length > 0) {
    sections.push('오늘 예정:');
    prep.todayPlanned.forEach((a) => sections.push(`- ${a}`));
    sections.push('');
  }

  // 주의 사항
  if (prep.warnings.length > 0) {
    sections.push('⚠️ 주의 사항:');
    prep.warnings.forEach((w) => sections.push(`- ${w}`));
    sections.push('');
  }

  // 스프린트 진행
  const p = prep.sprintProgress;
  sections.push(
    `🔢 스프린트 진행: ${p.completed}/${p.total} 완료 (${Math.round((p.completed / p.total) * 100)}%), 잔여 ${p.remainingDays}일`
  );

  return sections.join('\n');
}
```

### 4.4 Meeting Prep Scheduler

**위치**: `packages/workflow-engine/src/utils/meeting-prep-scheduler.ts` (신규)

```typescript
import { Queue, Worker } from 'bullmq';
import { createLogger } from '@rtb-ai-hub/shared';
import { createRedisConnection } from '../queue/connection';
import { prepareDailyScrum, prepareSprintReview } from './meeting-prep';
import { formatDailyScrum, formatSprintReview } from './meeting-prep-formatter';

const logger = createLogger('meeting-prep-scheduler');

export class MeetingPrepScheduler {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  async start(): Promise<void> {
    if (process.env.MEETING_PREP_ENABLED !== 'true') {
      logger.info('Meeting prep disabled');
      return;
    }

    const connection = createRedisConnection();
    this.queue = new Queue('meeting-prep', { connection });

    // 데일리 스크럼 준비: 평일 KST 08:50 (UTC 23:50 전날)
    const dailyCron = process.env.DAILY_SCRUM_PREP_CRON || '50 23 * * 0-4';
    await this.queue.add(
      'daily-scrum',
      { type: 'daily_scrum' },
      {
        repeat: { pattern: dailyCron },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    // 스프린트 리뷰 준비: 스프린트 종료일 전날 (수동 트리거 또는 Jira 스프린트 종료 이벤트)
    // → Jira sprint 종료일을 감지하여 동적 스케줄링

    this.worker = new Worker(
      'meeting-prep',
      async (job) => {
        const { type } = job.data;

        if (type === 'daily_scrum') {
          const prep = await prepareDailyScrum();
          const message = formatDailyScrum(prep);
          await sendToSlack(message);
          logger.info('Daily scrum prep sent');
        } else if (type === 'sprint_review') {
          const prep = await prepareSprintReview();
          const message = formatSprintReview(prep);
          await sendToSlack(message);
          logger.info('Sprint review prep sent');
        }
      },
      { connection, concurrency: 1 }
    );

    logger.info('Meeting prep scheduler started');
  }

  async stop(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }

  // 수동 트리거 (API 또는 채팅에서 호출)
  async triggerPrep(type: 'daily_scrum' | 'sprint_review'): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(`manual-${type}`, { type });
  }
}
```

### 4.5 Feature Flag & 환경변수

```typescript
// shared/constants.ts
FEATURE_FLAGS: {
  MEETING_PREP_ENABLED: process.env.MEETING_PREP_ENABLED === 'true',
}
```

```bash
# .env.advanced
MEETING_PREP_ENABLED=true
DAILY_SCRUM_PREP_CRON="50 23 * * 0-4"     # 평일 KST 08:50 (데일리 전)
MEETING_PREP_CHANNEL=C0GENERAL             # 회의 준비 전송 채널
SPRINT_REVIEW_PREP_HOURS=24                # 스프린트 종료 N시간 전 준비
```

### 4.6 Dashboard Chat 연동

```typescript
// chat-tools.ts에 prepare_meeting 도구 추가
{
  name: 'prepare_meeting',
  description: '회의 준비 자료를 생성합니다',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['daily_scrum', 'sprint_review'],
        description: '회의 유형',
      },
    },
    required: ['type'],
  },
}
```

## 5. 구현 순서

1. `packages/shared/src/constants.ts` — Feature flag + config
2. `packages/workflow-engine/src/utils/meeting-prep.ts` — 데이터 수집 + 준비 로직
3. `packages/workflow-engine/src/utils/meeting-prep-formatter.ts` — 포맷
4. `packages/workflow-engine/src/utils/meeting-prep-scheduler.ts` — BullMQ 스케줄러
5. `packages/workflow-engine/src/index.ts` — 스케줄러 시작
6. `packages/webhook-listener/src/utils/chat-tools.ts` — prepare_meeting 도구
7. 테스트

## 6. 테스트 계획

| 테스트             | 검증 내용                             |
| ------------------ | ------------------------------------- |
| 스프린트 리뷰 포맷 | 완료/진행/블로커 섹션 올바르게 생성   |
| 데일리 스크럼 포맷 | 어제/오늘/주의 섹션 올바르게 생성     |
| 빈 데이터 처리     | 활동이 없을 때 "없음" 표시            |
| 번다운 상태        | on_track/slightly_behind/at_risk 판정 |
| 날짜 포맷          | 한국어 요일, 날짜 형식 올바르게       |
| 비활성             | MEETING_PREP_ENABLED=false일 때 스킵  |
| 수동 트리거        | triggerPrep()으로 즉시 실행           |

## 7. 기존 기능 연동

| 연동 대상             | 활용 방법                                        |
| --------------------- | ------------------------------------------------ |
| A-3 Daily Digest      | 데일리 다이제스트 데이터 재활용 (수집 로직 공유) |
| B-1 Context Engine    | 티켓별 프리뷰 URL, PR 번호 조회                  |
| B-3 Blocker Detection | 블로커 감지 결과 재활용                          |
| C-1 Impact Analysis   | 기술 리뷰 회의 시 영향 분석 결과 포함            |
| C-2 Decision Journal  | 스프린트 기간의 기술 결정 요약                   |
