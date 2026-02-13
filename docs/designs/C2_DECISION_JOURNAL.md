# C-2: Decision Journal (의사결정 기록)

> **상태**: ✅ 구현 완료 (2026-02-11) — 26개 테스트
> **우선순위**: Phase C (Decision Facilitation)
> **난이도**: 중상 — 이벤트 수집 + AI 추출 + DB 저장 + 검색
> **의존성**: B-1 (Context Engine) 활용
> **예상 작업량**: 4~6일

---

## 1. 목표

Slack 대화, PR 코멘트, Jira 코멘트에서 **기술 의사결정 사항을 자동 감지하고 기록**한다.
기록된 결정은 검색 가능하며, 유사한 결정이 필요할 때 과거 사례를 자동 참조한다.

"이거 왜 이렇게 했더라?" → AI가 당시 결정 배경과 참여자를 즉시 제공한다.

## 2. 출력 예시

### 자동 감지 & 기록

PR 코멘트에서 의사결정 감지 시:

```
📝 기술 결정 기록됨

제목: JWT 유지, Session 전환 취소
결정: 마이크로서비스 확장 대비를 위해 JWT 기반 인증을 유지
맥락: PR #38에서 Session 전환이 제안되었으나, 향후 서비스 분리를 고려하여 기각
참여자: @senior-dev, @architect
관련: PROJ-098 (인증 모듈 리팩토링)
태그: #auth #architecture #security

→ 이 결정은 Decision Journal에 저장되었습니다. `/decisions auth` 로 조회 가능.
```

### 주간 의사결정 요약

```
📝 이번 주 기술 결정 요약 — 2026년 2월 2주차

1. [2/10] 결제 PG 연동: 토스페이먼츠 선정
   - 출처: PR #52 코멘트
   - 근거: API 문서 품질, 테스트 환경 제공
   - 참여: @pm, @backend-dev

2. [2/11] 캐시 전략: Redis TTL 24h → 12h 변경
   - 출처: Jira PROJ-145 코멘트
   - 근거: 데이터 정합성 이슈 (배포 후 캐시 불일치 발생)
   - 참여: @senior-dev, @devops

3. [2/12] 모바일 대응: Responsive → Adaptive 전환
   - 출처: Slack #dev-frontend
   - 근거: 성능 이슈 (모바일에서 DOM 노드 과다)
   - 참여: @frontend-lead, @designer

총 3건의 기술 결정이 기록되었습니다.
```

### 유사 결정 자동 참조

새로운 PR에서 인증 관련 변경이 발생하면:

```
💡 관련 과거 결정

이 PR은 auth 모듈을 변경합니다. 관련된 과거 결정:

1. [2/10] JWT 유지 결정 — Session 전환 제안 기각
   근거: 마이크로서비스 확장 대비
   → 이 결정과 충돌하지 않는지 확인해주세요.

2. [1/28] 토큰 갱신 주기: 7일 → 3일 단축
   근거: 보안 감사 권고
   → refresh token 관련 변경 시 참고
```

## 3. 감지 대상 이벤트

| 소스                      | 이벤트              | 감지 방법                                                    |
| ------------------------- | ------------------- | ------------------------------------------------------------ |
| **GitHub PR 코멘트**      | PR review comment   | Webhook → 코멘트 텍스트 AI 분석                              |
| **GitHub PR description** | PR 생성/수정        | Webhook → description에서 "결정", "선택", "대안" 키워드 감지 |
| **Jira 코멘트**           | Issue comment added | Jira poller 또는 Webhook → 코멘트 AI 분석                    |
| **Jira 상태 변경**        | Resolution 사유     | "Won't Do", "Duplicate" 등 해결 사유 자동 기록               |

> **Phase 1**: GitHub PR 코멘트 + Jira 코멘트만 구현 (Webhook 기반)
> **Phase 2**: Slack 대화 감지 추가 (OpenClaw 연동)

## 4. 상세 설계

### 4.1 Decision 데이터 모델

**DB 테이블**: `drizzle/0004_add_decision_journal.sql`

```sql
CREATE TABLE IF NOT EXISTS decision_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT,
  source_type VARCHAR(20) NOT NULL,   -- 'github_pr', 'jira_comment', 'slack'
  source_id VARCHAR(200) NOT NULL,     -- PR#42, PROJ-123, slack_ts
  source_url VARCHAR(500),
  participants TEXT[] DEFAULT '{}',
  related_jira_keys TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',  -- 'active', 'superseded', 'reversed'
  superseded_by UUID,                    -- 이 결정을 대체한 새 결정
  env VARCHAR(10) DEFAULT 'int',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decision_journal_jira ON decision_journal USING gin(related_jira_keys);
CREATE INDEX idx_decision_journal_tags ON decision_journal USING gin(tags);
CREATE INDEX idx_decision_journal_source ON decision_journal(source_type, source_id);
CREATE INDEX idx_decision_journal_created ON decision_journal(created_at DESC);
```

### 4.2 Decision Detector 모듈

**위치**: `packages/workflow-engine/src/utils/decision-detector.ts` (신규)

```typescript
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('decision-detector');

// ─── 타입 ────────────────────────────────────────────────────────────

export type DecisionCandidate = {
  title: string;
  decision: string;
  rationale: string;
  participants: string[];
  relatedJiraKeys: string[];
  tags: string[];
  confidence: number; // 0~1, AI가 "이것이 결정인지" 확신도
};

export type DecisionSource = {
  type: 'github_pr' | 'jira_comment' | 'slack';
  id: string; // PR number, issue key, slack ts
  url: string;
  text: string; // 분석할 원본 텍스트
  author: string;
};

// ─── 결정 감지 ───────────────────────────────────────────────────────

export async function detectDecision(source: DecisionSource): Promise<DecisionCandidate | null> {
  // Step 1: 키워드 사전 필터 (비용 절감)
  if (!hasDecisionSignals(source.text)) {
    return null;
  }

  // Step 2: AI로 의사결정 추출
  const candidate = await extractDecisionWithAI(source);

  // Step 3: confidence threshold 확인
  if (!candidate || candidate.confidence < 0.7) {
    return null;
  }

  return candidate;
}

// ─── 키워드 사전 필터 ────────────────────────────────────────────────

const DECISION_SIGNALS_KO = [
  '결정',
  '선택',
  '채택',
  '기각',
  '합의',
  '결론',
  '으로 가자',
  '으로 하자',
  '으로 정하자',
  '대안',
  '대신에',
  '변경하기로',
  '전환하기로',
  '이유는',
  '근거는',
  '때문에',
];

const DECISION_SIGNALS_EN = [
  'decided',
  'decision',
  'agreed',
  'consensus',
  "let's go with",
  "we'll use",
  'chosen',
  'rejected',
  'approved',
  'selected',
  'rationale',
  'reason being',
  'because',
  'trade-off',
  'alternative',
];

function hasDecisionSignals(text: string): boolean {
  const lower = text.toLowerCase();
  return [...DECISION_SIGNALS_KO, ...DECISION_SIGNALS_EN].some((signal) =>
    lower.includes(signal.toLowerCase())
  );
}

// ─── AI 추출 ────────────────────────────────────────────────────────

async function extractDecisionWithAI(source: DecisionSource): Promise<DecisionCandidate | null> {
  // Anthropic API 호출
  // 프롬프트: "다음 텍스트에서 기술적 의사결정을 추출하세요..."
  // 응답: { title, decision, rationale, tags, confidence }

  // 비용 절감: haiku 모델 사용 (간단한 추출 작업)
  return null;
}
```

### 4.3 Decision Store

**위치**: `packages/workflow-engine/src/utils/decision-store.ts` (신규)

```typescript
import { getDb } from '@rtb-ai-hub/shared/db';
import { decisionJournal } from '@rtb-ai-hub/shared/db/schema';
import { eq, arrayContains, desc, sql } from 'drizzle-orm';
import type { DecisionCandidate, DecisionSource } from './decision-detector';

// ─── CRUD ────────────────────────────────────────────────────────────

export async function saveDecision(
  candidate: DecisionCandidate,
  source: DecisionSource,
  env: string
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(decisionJournal)
    .values({
      title: candidate.title,
      decision: candidate.decision,
      rationale: candidate.rationale,
      sourceType: source.type,
      sourceId: source.id,
      sourceUrl: source.url,
      participants: candidate.participants,
      relatedJiraKeys: candidate.relatedJiraKeys,
      tags: candidate.tags,
      env,
    })
    .returning({ id: decisionJournal.id });

  return row.id;
}

export async function findRelatedDecisions(
  tags: string[],
  limit = 5
): Promise<
  Array<{
    id: string;
    title: string;
    decision: string;
    rationale: string;
    createdAt: Date;
  }>
> {
  const db = getDb();
  // tags 배열과 겹치는 결정 조회
  return db
    .select()
    .from(decisionJournal)
    .where(sql`${decisionJournal.tags} && ${tags}`)
    .orderBy(desc(decisionJournal.createdAt))
    .limit(limit);
}

export async function findDecisionsByJiraKey(
  jiraKey: string
): Promise<Array<typeof decisionJournal.$inferSelect>> {
  const db = getDb();
  return db
    .select()
    .from(decisionJournal)
    .where(arrayContains(decisionJournal.relatedJiraKeys, [jiraKey]))
    .orderBy(desc(decisionJournal.createdAt));
}

export async function getRecentDecisions(
  days = 7,
  limit = 20
): Promise<Array<typeof decisionJournal.$inferSelect>> {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(decisionJournal)
    .where(sql`${decisionJournal.createdAt} >= ${since}`)
    .orderBy(desc(decisionJournal.createdAt))
    .limit(limit);
}

export async function supersedeDecision(oldId: string, newId: string): Promise<void> {
  const db = getDb();
  await db
    .update(decisionJournal)
    .set({ status: 'superseded', supersededBy: newId, updatedAt: new Date() })
    .where(eq(decisionJournal.id, oldId));
}
```

### 4.4 Decision Formatter

**위치**: `packages/workflow-engine/src/utils/decision-formatter.ts` (신규)

```typescript
export function formatDecisionNotification(
  candidate: DecisionCandidate,
  source: DecisionSource,
  decisionId: string
): string {
  const lines: string[] = [];
  lines.push('📝 기술 결정 기록됨\n');
  lines.push(`제목: ${candidate.title}`);
  lines.push(`결정: ${candidate.decision}`);
  if (candidate.rationale) {
    lines.push(`맥락: ${candidate.rationale}`);
  }
  lines.push(`참여자: ${candidate.participants.join(', ')}`);
  if (candidate.relatedJiraKeys.length > 0) {
    lines.push(`관련: ${candidate.relatedJiraKeys.join(', ')}`);
  }
  if (candidate.tags.length > 0) {
    lines.push(`태그: ${candidate.tags.map((t) => `#${t}`).join(' ')}`);
  }
  return lines.join('\n');
}

export function formatWeeklyDigest(
  decisions: Array<{
    title: string;
    decision: string;
    sourceType: string;
    sourceUrl: string;
    participants: string[];
    createdAt: Date;
  }>
): string {
  if (decisions.length === 0) {
    return '📝 이번 주 기록된 기술 결정이 없습니다.';
  }

  const lines: string[] = [];
  const now = new Date();
  const weekNum = getWeekNumber(now);
  lines.push(
    `📝 이번 주 기술 결정 요약 — ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${weekNum}주차\n`
  );

  decisions.forEach((d, i) => {
    const date = d.createdAt.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
    const sourceLabel =
      d.sourceType === 'github_pr'
        ? 'PR 코멘트'
        : d.sourceType === 'jira_comment'
          ? 'Jira 코멘트'
          : 'Slack';
    lines.push(`${i + 1}. [${date}] ${d.title}`);
    lines.push(`   - 출처: ${sourceLabel}`);
    lines.push(`   - 결정: ${d.decision}`);
    lines.push(`   - 참여: ${d.participants.join(', ')}`);
    lines.push('');
  });

  lines.push(`총 ${decisions.length}건의 기술 결정이 기록되었습니다.`);
  return lines.join('\n');
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}
```

### 4.5 통합 지점

**GitHub webhook** — PR 코멘트 수신 시:

```typescript
// routes/github.ts에서 pull_request_review_comment 이벤트 처리
import { detectDecision } from '../utils/decision-detector';
import { saveDecision } from '../utils/decision-store';

if (event.action === 'created' && event.comment) {
  const candidate = await detectDecision({
    type: 'github_pr',
    id: String(event.pull_request.number),
    url: event.comment.html_url,
    text: event.comment.body,
    author: event.comment.user.login,
  });

  if (candidate) {
    await saveDecision(candidate, source, env);
    // Slack 알림 (선택적)
  }
}
```

**Jira webhook/poller** — 코멘트 수신 시:

```typescript
// Jira 코멘트에서 결정 감지
const candidate = await detectDecision({
  type: 'jira_comment',
  id: issue.key,
  url: `https://${jiraHost}/browse/${issue.key}`,
  text: comment.body,
  author: comment.author.displayName,
});
```

**Dashboard chat** — 결정 조회 도구 추가:

```typescript
// chat-tools.ts에 search_decisions 도구 추가
{
  name: 'search_decisions',
  description: '기술 의사결정 기록을 검색합니다',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '검색어 (태그, Jira 키, 키워드)' },
      days: { type: 'number', description: '최근 N일 (기본: 30)' },
    },
  },
}
```

### 4.6 Feature Flag

```typescript
// shared/constants.ts
FEATURE_FLAGS: {
  DECISION_JOURNAL_ENABLED: process.env.DECISION_JOURNAL_ENABLED === 'true',
}
```

### 4.7 환경변수

```bash
DECISION_JOURNAL_ENABLED=true
DECISION_CONFIDENCE_THRESHOLD=0.7    # AI 감지 최소 확신도
DECISION_WEEKLY_DIGEST_DAY=1         # 주간 요약 요일 (1=월요일)
```

## 5. 구현 순서

1. `packages/shared/src/db/schema.ts` — decision_journal 테이블 스키마
2. `drizzle/0004_add_decision_journal.sql` — 마이그레이션
3. `packages/shared/src/constants.ts` — Feature flag + config
4. `packages/workflow-engine/src/utils/decision-detector.ts` — 감지 로직
5. `packages/workflow-engine/src/utils/decision-store.ts` — CRUD
6. `packages/workflow-engine/src/utils/decision-formatter.ts` — 포맷
7. `packages/webhook-listener/src/routes/github.ts` — PR 코멘트 연동
8. `packages/webhook-listener/src/utils/chat-tools.ts` — search_decisions 도구
9. 테스트

## 6. 테스트 계획

| 테스트         | 검증 내용                                     |
| -------------- | --------------------------------------------- |
| 키워드 감지    | 결정 시그널 키워드 포함 텍스트에서 true 반환  |
| 키워드 미감지  | 일반 코드 리뷰 코멘트에서 false 반환          |
| DB 저장        | saveDecision 후 findDecisionsByJiraKey로 조회 |
| 태그 검색      | tags 배열 겹침 검색                           |
| 주간 요약      | formatWeeklyDigest로 올바른 한국어 포맷       |
| 결정 대체      | supersedeDecision 후 status 변경              |
| 비활성         | DECISION_JOURNAL_ENABLED=false일 때 스킵      |
| 관련 결정 조회 | Impact Analysis에서 관련 과거 결정 참조       |

## 7. A-3 Daily Digest 연동

일일 다이제스트에 "오늘 기록된 기술 결정" 섹션 추가:

```typescript
// digest-collector.ts 확장
import { getRecentDecisions } from './decision-store';

// 다이제스트 수집 시 최근 결정도 포함
const recentDecisions = await getRecentDecisions(1);
data.decisions = recentDecisions;
```

## 8. C-1 Impact Analysis 연동

PR의 영향 분석 시, 관련 과거 결정을 함께 표시:

```typescript
// impact-analyzer.ts에서
import { findRelatedDecisions } from './decision-store';

// 변경 영역과 관련된 과거 결정 조회
const relatedDecisions = await findRelatedDecisions(moduleTags);
// impact report에 포함
```
