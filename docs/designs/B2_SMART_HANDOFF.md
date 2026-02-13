# B-2: Smart Handoff (스마트 업무 전환)

> ✅ **구현 완료** — 2026-02-11
>
> **구현 파일**: `workflows/smart-handoff.ts` (신규), `constants.ts`, `queue/workers.ts` (수정)
> **테스트**: 14개 (`smart-handoff.test.ts`)
>
> **우선순위**: Phase B
> **난이도**: 중간 — Jira 상태 변경 감지 + AI 브리핑 생성
> **의존성**: B-1 (Context Engine) 권장, 없이도 기본 동작 가능
> **예상 작업량**: 3~5일

---

## 1. 목표

Jira 티켓의 상태가 변경될 때 (예: Design → Development → QA → Done),
**다음 담당자에게 맥락 브리핑을 자동 생성**하여 전달한다.

업무 인수인계 시 "이건 뭐 어떻게 된 거예요?" 질문을 AI가 대신 답변.

## 2. 상태 전환 시나리오

```
Design Complete → In Progress     디자이너 → 개발자  "디자인 완료, 구현 시 참고사항"
In Progress → Code Review         개발자 → 리뷰어   "구현 완료, 리뷰 포인트"
Code Review → QA                  리뷰어 → QA       "리뷰 통과, 테스트 대상"
QA → Done                         QA → PM          "검증 완료, 릴리즈 준비"
Any → Blocked                     담당자 → 팀 리드  "블로커 발생, 원인/영향"
```

## 3. 출력 예시

### 디자인 → 개발 전환

```
📋 PROJ-123 업무 인수 브리핑 — Design Complete → In Progress

👤 담당자: 김디자 → 박개발

━━━ 🎨 디자인 요약 ━━━
• Figma: Login Page (Desktop + Mobile) [링크]
• 핵심 인터랙션: 이메일 실시간 유효성 검사, 비밀번호 강도 표시
• 디자이너 노트: "로딩 시 skeleton UI 사용 요청"

━━━ 📋 구현 참고 ━━━
• Jira 요구사항: 이메일/비밀번호 + 소셜 로그인 (Google, Kakao)
• 관련 위키: auth-flow.md, social-login-guide.md
• 유사 구현: PROJ-098 (회원가입 페이지) — 코드 패턴 참고
• 주의: RTB 도메인에서 소셜 로그인은 Kakao가 필수 (wiki 참조)

━━━ 🔗 관련 링크 ━━━
• Jira: https://myorg.atlassian.net/browse/PROJ-123
• Figma: https://figma.com/file/...
• Branch: feature/PROJ-123-login (아직 생성 전)
```

## 4. 상세 설계

### 4.1 상태 전환 감지

**방법 A: Jira Webhook** (프로덕션)

- Jira의 `issue_updated` webhook에서 `changelog` 확인
- `changelog.items`에 `field: "status"` 변경이 있을 때 트리거

**방법 B: Jira Poller 확장** (로컬 개발)

- 기존 `JiraPoller`가 이미 상태 변경을 감지하고 enqueue
- Worker에서 상태 변경을 확인하여 핸드오프 트리거

### 4.2 핸드오프 워크플로우

**위치**: `packages/workflow-engine/src/workflows/smart-handoff.ts` (신규)

```typescript
import { createLogger } from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { getContext, updateContext } from '../utils/context-engine';
import { WikiKnowledge } from '../utils/wiki-knowledge';
import { notifyByRole } from '../utils/role-notifier';
import { AnthropicClient } from '../clients/anthropic';

const logger = createLogger('smart-handoff');

type StatusTransition = {
  from: string;
  to: string;
  fromRole: TeamRole;
  toRole: TeamRole;
};

// 상태 전환 → 역할 매핑
const TRANSITION_MAP: Record<string, StatusTransition> = {
  'Design Complete→In Progress': {
    from: 'Design Complete',
    to: 'In Progress',
    fromRole: 'designer',
    toRole: 'developer',
  },
  'In Progress→Code Review': {
    from: 'In Progress',
    to: 'Code Review',
    fromRole: 'developer',
    toRole: 'reviewer',
  },
  'Code Review→QA': {
    from: 'Code Review',
    to: 'QA',
    fromRole: 'reviewer',
    toRole: 'qa',
  },
  'QA→Done': {
    from: 'QA',
    to: 'Done',
    fromRole: 'qa',
    toRole: 'pm',
  },
};

export async function processSmartHandoff(
  event: JiraWebhookEvent,
  previousStatus: string,
  currentStatus: string,
  env: Environment
): Promise<void> {
  const transitionKey = `${previousStatus}→${currentStatus}`;
  const transition = TRANSITION_MAP[transitionKey];

  if (!transition) {
    logger.debug({ transitionKey }, 'No handoff defined for this transition');
    return;
  }

  logger.info(
    { issueKey: event.issueKey, transition: transitionKey },
    'Generating smart handoff briefing'
  );

  // 1. 맥락 수집
  const context = await getContext(event.issueKey);
  const wikiKnowledge = await loadWikiContext(event);

  // 2. AI 브리핑 생성
  const briefing = await generateBriefing({
    event,
    transition,
    context,
    wikiKnowledge,
  });

  // 3. 대상 역할에게 전달
  await notifyByRole({
    eventType: 'workflow_progress',
    context: {
      issueKey: event.issueKey,
      summary: event.summary,
      env,
      figmaUrl: context?.figmaUrl || undefined,
      previewUrl: context?.previewWebUrl || undefined,
    },
  });

  // 별도로 핸드오프 브리핑을 DM 또는 전용 채널로 전송
  await sendHandoffBriefing(transition.toRole, briefing, event.issueKey);

  // 4. 맥락 업데이트
  await updateContext({
    jiraKey: event.issueKey,
    status: currentStatus,
  });
}

async function generateBriefing(input: {
  event: JiraWebhookEvent;
  transition: StatusTransition;
  context: ContextLink | null;
  wikiKnowledge: string | undefined;
}): Promise<string> {
  const { event, transition, context, wikiKnowledge } = input;

  // Phase 1: 템플릿 기반 (AI 없이)
  // Phase 2: AI 생성 (아래 프롬프트 사용)
  const sections: string[] = [];

  sections.push(`📋 ${event.issueKey} 업무 인수 브리핑 — ${transition.from} → ${transition.to}\n`);

  // 역할 전환
  sections.push(`👤 ${transition.fromRole} → ${transition.toRole}\n`);

  // 디자인 정보 (있으면)
  if (context?.figmaUrl) {
    sections.push('━━━ 🎨 디자인 ━━━');
    sections.push(`Figma: ${context.figmaUrl}`);
  }

  // 요구사항
  if (event.description) {
    sections.push('\n━━━ 📋 요구사항 ━━━');
    sections.push(event.description.slice(0, 500));
  }

  // 관련 코드 (PR, 브랜치)
  if (context?.githubBranch || (context?.githubPrNumbers as number[])?.length) {
    sections.push('\n━━━ 💻 구현 현황 ━━━');
    if (context.githubBranch) sections.push(`Branch: ${context.githubBranch}`);
    const prNums = (context.githubPrNumbers as number[]) || [];
    if (prNums.length > 0) sections.push(`PRs: ${prNums.map((n) => `#${n}`).join(', ')}`);
    if (context.previewWebUrl) sections.push(`Preview: ${context.previewWebUrl}`);
  }

  // 위키 참고
  if (wikiKnowledge) {
    sections.push('\n━━━ 📚 참고 문서 ━━━');
    sections.push(wikiKnowledge.slice(0, 300));
  }

  // 관련 링크
  sections.push('\n━━━ 🔗 링크 ━━━');
  if (context?.jiraUrl) sections.push(`Jira: ${context.jiraUrl}`);
  if (context?.figmaUrl) sections.push(`Figma: ${context.figmaUrl}`);

  return sections.join('\n');
}

async function loadWikiContext(event: JiraWebhookEvent): Promise<string | undefined> {
  const wikiPath = process.env.WIKI_PATH;
  if (!wikiPath) return undefined;

  try {
    const wiki = new WikiKnowledge(wikiPath);
    return await wiki.searchForContext(`${event.summary} ${event.description || ''}`);
  } catch {
    return undefined;
  }
}
```

### 4.3 Jira Worker 연동

**위치**: `packages/workflow-engine/src/queue/workers.ts` — Jira worker 확장

```typescript
// Jira worker 내부에서 상태 변경 감지
const jiraWorker = new Worker(QUEUE_NAMES.JIRA, async (job) => {
  const { event, env } = job.data;

  // 기존 auto-dev 워크플로우 실행
  const result = await processJiraAutoDev(event, userId, env);

  // 상태 변경이 있으면 핸드오프 트리거
  // (Jira webhook의 changelog에서 이전 상태 추출)
  const changelog = event.payload?.changelog;
  if (changelog?.items) {
    const statusChange = changelog.items.find((item: any) => item.field === 'status');
    if (statusChange) {
      await processSmartHandoff(
        event,
        statusChange.fromString, // 이전 상태
        statusChange.toString, // 현재 상태
        env
      );
    }
  }

  return result;
});
```

### 4.4 환경변수

```bash
SMART_HANDOFF_ENABLED=true

# 상태 전환 매핑 커스터마이징 (선택)
# 기본값이 있으므로 보통 설정 불필요
# HANDOFF_TRANSITIONS="Design Complete→In Progress=designer→developer,..."
```

## 5. 구현 순서

1. `packages/shared/src/constants.ts` — Feature flag 추가
2. `packages/workflow-engine/src/workflows/smart-handoff.ts` — 핸드오프 로직
3. `packages/workflow-engine/src/queue/workers.ts` — Jira worker에 핸드오프 트리거 추가
4. 테스트

## 6. 테스트 계획

| 테스트              | 검증 내용                                             |
| ------------------- | ----------------------------------------------------- |
| 상태 전환 매핑      | "In Progress→Code Review"가 developer→reviewer로 매핑 |
| 매핑 없는 전환      | "Backlog→Todo" 같은 미정의 전환은 무시                |
| 브리핑 생성         | 모든 맥락 포함 시 완전한 브리핑 생성                  |
| 부분 맥락           | Figma/wiki 없을 때 해당 섹션 생략                     |
| Context Engine 연동 | getContext()로 기존 맥락 조회                         |
