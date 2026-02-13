# A-1: Role-aware Notifications (역할 인식형 알림)

> ✅ **구현 완료** — 2026-02-11
>
> **구현 파일**: `role-notifier.ts` (신규), `constants.ts` (수정), `jira-auto-dev-multi.ts` (수정)
> **테스트**: 15개 (`role-notifier.test.ts`)
>
> **우선순위**: Phase A (Quick Win)
> **난이도**: 낮음 — 기존 `notify-openclaw.ts` 확장
> **의존성**: 없음 (독립 구현 가능)
> **예상 작업량**: 2~3일

---

## 1. 목표

현재 모든 알림이 단일 채널에 동일한 메시지로 전송된다.
이를 **수신자의 역할에 따라 다른 내용/채널/형태**로 전달하도록 확장한다.

## 2. AS-IS → TO-BE

### AS-IS

```typescript
await notifyOpenClaw({
  eventType: 'pr_created',
  issueKey: 'PROJ-123',
  message: 'PR #42 created for PROJ-123: 로그인 페이지. Review needed.',
});
// → #ci-cd 채널에 단일 메시지 전송
```

### TO-BE

```typescript
await notifyByRole({
  eventType: 'pr_created',
  issueKey: 'PROJ-123',
  context: {
    prNumber: 42,
    prUrl: 'https://github.com/...',
    branch: 'feature/PROJ-123-login',
    baseBranch: 'develop',
    summary: '로그인 페이지 구현',
    filesChanged: 12,
    ciStatus: 'passed',
    previewUrl: 'http://localhost:5100',
    figmaUrl: 'https://figma.com/file/...',
  },
});
// → 디자이너에게: "구현 완료, 프리뷰에서 확인해보세요"
// → PM에게: "스프린트 진행률 업데이트"
// → 리뷰어에게: "리뷰 요청, 관련 맥락 첨부"
```

## 3. 상세 설계

### 3.1 새로운 타입 정의

**위치**: `packages/shared/src/constants.ts`

```typescript
// ─── Team Role Configuration ───────────────────────────────────────────────

export type TeamRole = 'designer' | 'developer' | 'reviewer' | 'qa' | 'pm' | 'lead';

export type RoleNotifyChannel = {
  role: TeamRole;
  slackChannelId?: string; // 역할별 채널 (예: #design, #dev, #qa)
  slackUserIds?: string[]; // 특정 유저 DM
};

export type TeamNotifyConfig = {
  enabled: boolean;
  slackBotToken: string;
  defaultChannel: string;
  roleChannels: RoleNotifyChannel[];
};

export function loadTeamNotifyConfig(): TeamNotifyConfig {
  return {
    enabled: FEATURE_FLAGS.OPENCLAW_NOTIFY_ENABLED,
    slackBotToken: process.env.SLACK_BOT_TOKEN || '',
    defaultChannel: process.env.OPENCLAW_NOTIFY_CHANNEL || '',
    roleChannels: parseRoleChannels(process.env.TEAM_ROLE_CHANNELS || ''),
  };
}

// 환경변수 형식: "designer=C01234,developer=C05678,qa=C09012,pm=C03456"
function parseRoleChannels(raw: string): RoleNotifyChannel[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => {
      const [role, channelId] = entry.split('=').map((s) => s.trim());
      return { role: role as TeamRole, slackChannelId: channelId };
    })
    .filter((r) => r.slackChannelId);
}
```

### 3.2 이벤트 컨텍스트 타입

**위치**: `packages/shared/src/constants.ts`

```typescript
export type NotifyEventContext = {
  // 공통
  issueKey: string;
  summary: string;
  env: Environment;

  // PR 관련
  prNumber?: number;
  prUrl?: string;
  branch?: string;
  baseBranch?: string;
  filesChanged?: number;

  // CI/CD 관련
  ciStatus?: 'passed' | 'failed' | 'skipped';
  ciFailedStep?: string;
  deployEnv?: Environment;

  // 디자인 관련
  figmaUrl?: string;
  previewUrl?: string;

  // 스프린트 관련
  sprintProgress?: { completed: number; total: number };
};
```

### 3.3 역할별 메시지 템플릿

**위치**: `packages/workflow-engine/src/utils/role-notifier.ts` (신규)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createLogger, loadTeamNotifyConfig } from '@rtb-ai-hub/shared';
import type { TeamRole, NotifyEventContext, OpenClawNotifyEventType } from '@rtb-ai-hub/shared';

const logger = createLogger('role-notifier');

type RoleMessage = {
  role: TeamRole;
  channel: string;
  message: string;
};

// ─── AI 기반 메시지 생성 (선택적) vs 템플릿 기반 (기본) ──────────────

// Phase 1: 템플릿 기반 (AI 호출 없음, 즉시 전송)
const MESSAGE_TEMPLATES: Record<OpenClawNotifyEventType, Record<TeamRole, string>> = {
  pr_created: {
    designer:
      '🎨 [{issueKey}] {summary} 구현 PR이 생성되었습니다.\n프리뷰: {previewUrl}\nFigma 시안과 비교해보세요.',
    developer:
      '🔀 [{issueKey}] PR #{prNumber} 리뷰가 필요합니다.\n{prUrl}\n변경 파일: {filesChanged}개 | CI: {ciStatus}',
    reviewer:
      '👀 [{issueKey}] PR #{prNumber} 리뷰 요청\n{prUrl}\n브랜치: {branch} → {baseBranch}\n변경 파일: {filesChanged}개',
    qa: '🧪 [{issueKey}] {summary} 구현 완료.\n프리뷰: {previewUrl}\nCI: {ciStatus} | 브랜치: {branch}',
    pm: '📊 [{issueKey}] {summary} PR 생성 완료.\n진행률: {sprintCompleted}/{sprintTotal} | CI: {ciStatus}',
    lead: '📋 [{issueKey}] PR #{prNumber} 생성.\n{filesChanged}개 파일 변경 | CI: {ciStatus}',
  },
  ci_failure: {
    developer: '❌ [{issueKey}] CI 실패: {ciFailedStep}\n{prUrl}\n수동 확인이 필요합니다.',
    lead: '❌ [{issueKey}] CI 실패: {ciFailedStep}. 담당자 확인 필요.',
    // 다른 역할에는 CI 실패 알림 불필요
    designer: '',
    reviewer: '',
    qa: '',
    pm: '❌ [{issueKey}] CI 실패로 일정 지연 가능. 실패 단계: {ciFailedStep}',
  },
  cd_success: {
    qa: '🚀 [{issueKey}] {deployEnv} 환경에 배포 완료. 테스트를 진행해주세요.',
    pm: '🚀 {deployEnv} 환경 배포 완료. 배포 항목: [{issueKey}] {summary}',
    developer: '🚀 [{issueKey}] {deployEnv} 배포 완료.',
    designer: '🚀 [{issueKey}] {summary} — {deployEnv} 환경에서 확인 가능합니다.',
    reviewer: '',
    lead: '🚀 {deployEnv} 환경 배포 완료. [{issueKey}]',
  },
  cd_failure: {
    developer: '💥 [{issueKey}] {deployEnv} 배포 실패 → 롤백 완료. 원인 확인 필요.',
    lead: '💥 {deployEnv} 배포 실패 → 자동 롤백. [{issueKey}] 담당자 확인 필요.',
    pm: '💥 {deployEnv} 배포 실패. 일정 영향 있을 수 있습니다.',
    designer: '',
    reviewer: '',
    qa: '💥 {deployEnv} 배포 실패 → 롤백. 테스트 보류.',
  },
  workflow_error: {
    developer: '⚠️ [{issueKey}] AI 워크플로우 오류 발생. 수동 처리가 필요합니다.',
    lead: '⚠️ [{issueKey}] AI 워크플로우 실패. 시스템 확인 필요.',
    pm: '',
    designer: '',
    reviewer: '',
    qa: '',
  },
  workflow_progress: {
    developer: '🔄 [{issueKey}] {summary} — 프리뷰 준비 완료: {previewUrl}',
    designer: '🔄 [{issueKey}] {summary} — 프리뷰에서 확인 가능: {previewUrl}',
    qa: '🔄 [{issueKey}] 프리뷰 환경 준비됨: {previewUrl}',
    pm: '',
    reviewer: '',
    lead: '',
  },
};

// 템플릿 변수 치환
function renderTemplate(template: string, context: NotifyEventContext): string {
  if (!template) return '';
  return template
    .replace(/{issueKey}/g, context.issueKey)
    .replace(/{summary}/g, context.summary)
    .replace(/{prNumber}/g, String(context.prNumber || ''))
    .replace(/{prUrl}/g, context.prUrl || '')
    .replace(/{branch}/g, context.branch || '')
    .replace(/{baseBranch}/g, context.baseBranch || '')
    .replace(/{filesChanged}/g, String(context.filesChanged || 0))
    .replace(/{ciStatus}/g, context.ciStatus || 'unknown')
    .replace(/{ciFailedStep}/g, context.ciFailedStep || 'unknown')
    .replace(/{deployEnv}/g, context.deployEnv || context.env)
    .replace(/{previewUrl}/g, context.previewUrl || '(없음)')
    .replace(/{figmaUrl}/g, context.figmaUrl || '')
    .replace(/{sprintCompleted}/g, String(context.sprintProgress?.completed || '?'))
    .replace(/{sprintTotal}/g, String(context.sprintProgress?.total || '?'));
}

// ─── 메인 함수 ──────────────────────────────────────────────────────────

export type NotifyByRoleOptions = {
  eventType: OpenClawNotifyEventType;
  context: NotifyEventContext;
};

export async function notifyByRole(options: NotifyByRoleOptions): Promise<void> {
  const config = loadTeamNotifyConfig();

  if (!config.enabled || !config.slackBotToken) {
    return;
  }

  const templates = MESSAGE_TEMPLATES[options.eventType];
  if (!templates) return;

  // 역할별 채널이 설정되지 않으면 기존 defaultChannel에 통합 메시지
  if (config.roleChannels.length === 0) {
    const fallbackMessage = renderTemplate(
      templates.developer || templates.lead || '',
      options.context
    );
    if (fallbackMessage) {
      await sendSlackMessage(config.slackBotToken, config.defaultChannel, fallbackMessage);
    }
    return;
  }

  // 역할별 병렬 전송
  const promises = config.roleChannels.map(async (rc) => {
    const template = templates[rc.role];
    const message = renderTemplate(template, options.context);
    if (!message || !rc.slackChannelId) return;

    await sendSlackMessage(config.slackBotToken, rc.slackChannelId, message);
  });

  await Promise.allSettled(promises);
}

async function sendSlackMessage(token: string, channel: string, text: string): Promise<void> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, channel }, 'Slack message failed');
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), channel },
      'Failed to send Slack message — continuing'
    );
  }
}
```

### 3.4 기존 코드 변경점

**`jira-auto-dev-multi.ts`** — `notifyOpenClaw()` 호출을 `notifyByRole()`로 교체:

```typescript
// AS-IS (Phase 3: PR 생성 후)
await notifyOpenClaw({
  eventType: 'pr_created',
  issueKey: event.issueKey,
  message: `PR #${prResults.prNumber} created for ${event.issueKey}...`,
});

// TO-BE
await notifyByRole({
  eventType: 'pr_created',
  context: {
    issueKey: event.issueKey,
    summary: event.summary,
    env,
    prNumber: prResults.prNumber,
    prUrl: prResults.prUrl,
    branch: localResults.branchName,
    baseBranch: localResults.baseBranch,
    filesChanged: implementation.files.length,
    ciStatus: ciResults?.success ? 'passed' : ciResults ? 'failed' : 'skipped',
    ciFailedStep: ciResults?.failedStep?.name,
    previewUrl: previewResult?.preview?.webUrl,
  },
});
```

**하위 호환**: `notifyOpenClaw()`는 삭제하지 않고 유지. `notifyByRole()`에서 역할별 채널이 설정되지 않으면 기존 동작과 동일하게 defaultChannel에 전송.

### 3.5 환경변수

```bash
# .env.advanced
# 역할별 Slack 채널 매핑 (선택사항)
# 설정하지 않으면 기존 OPENCLAW_NOTIFY_CHANNEL에 통합 전송
TEAM_ROLE_CHANNELS=designer=C01234567,developer=C02345678,qa=C03456789,pm=C04567890,lead=C05678901
```

## 4. 구현 순서

1. `packages/shared/src/constants.ts` — 타입 추가 (`TeamRole`, `NotifyEventContext`, `TeamNotifyConfig`)
2. `packages/workflow-engine/src/utils/role-notifier.ts` — 신규 생성
3. `packages/workflow-engine/src/workflows/jira-auto-dev-multi.ts` — `notifyByRole()` 호출 추가
4. `packages/workflow-engine/src/workflows/target-deploy.ts` — `notifyByRole()` 호출 추가
5. 테스트: `packages/workflow-engine/src/utils/__tests__/role-notifier.test.ts`

## 5. 테스트 계획

| 테스트         | 검증 내용                                                      |
| -------------- | -------------------------------------------------------------- |
| 템플릿 렌더링  | 변수 치환이 올바르게 동작하는지                                |
| 빈 템플릿 스킵 | 해당 역할에 템플릿이 없으면 전송하지 않는지                    |
| Fallback 동작  | roleChannels 미설정 시 defaultChannel 전송                     |
| 병렬 전송      | 여러 역할에 동시 전송 시 하나의 실패가 다른 전송을 막지 않는지 |
| 비활성 상태    | enabled=false 시 아무것도 전송하지 않는지                      |

## 6. Phase 2 확장 (향후)

- **AI 기반 메시지 생성**: 템플릿 대신 AI가 역할별 맥락을 요약 (비용: ~$0.01/메시지)
- **Slack Block Kit**: 단순 텍스트 → 버튼, 링크, 섹션이 있는 리치 메시지
- **DM 지원**: 채널 대신 담당자에게 직접 DM
- **B-1 Context Engine 연동**: 맥락 연결 엔진에서 관련 정보를 자동 조회하여 메시지에 포함
