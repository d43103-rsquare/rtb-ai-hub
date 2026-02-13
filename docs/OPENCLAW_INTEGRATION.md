# OpenClaw 연동 설계

## 1. 개요

RTB AI Hub 워크플로우 결과를 Slack으로 알림하고, Slack 대화로 워크플로우를 트리거하기 위해 [OpenClaw](https://github.com/openclaw/openclaw) Gateway를 연동한다.

### 연동 방향

```
┌─────────────────────────────────────────────────────────────────┐
│                         RTB AI Hub                               │
│                                                                  │
│  Workflow Engine ──(HTTP POST)──→ OpenClaw Gateway ──→ Slack     │
│  (알림: PR생성, CI결과, CD완료)     :18789/hooks/*     (채널/DM) │
│                                                                  │
│  Slack ──→ OpenClaw Gateway ──(HTTP POST)──→ Webhook Listener    │
│  (명령: "작업시작", "상태확인")  (Skill→Tool)    :4000/webhooks/* │
└─────────────────────────────────────────────────────────────────┘
```

| 방향                 | 메커니즘                                   | 설명                                                           |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Hub → Slack (알림)   | OpenClaw Webhook API (`POST /hooks/agent`) | 워크플로우 결과를 OpenClaw에 전달, AI가 Slack으로 메시지 전송  |
| Slack → Hub (트리거) | OpenClaw Skill → HTTP call → Hub API       | 사용자가 Slack에서 명령, OpenClaw Skill이 Hub webhook API 호출 |

## 2. 아키텍처

### 전체 구조

```
┌──────────────────────┐     ┌─────────────────────────┐     ┌──────────┐
│   RTB AI Hub         │     │   OpenClaw Gateway      │     │  Slack   │
│                      │     │   (Docker :18789)       │     │          │
│  workflow-engine     │     │                         │     │          │
│  ├─ notify-openclaw  │────→│  POST /hooks/agent      │────→│ #ci-cd   │
│  │  (알림 전송)       │     │  POST /hooks/wake       │     │ @user DM │
│  │                   │     │                         │     │          │
│  webhook-listener    │←────│  Skill: rtb-hub         │←────│ 사용자    │
│  └─ POST /webhooks/* │     │  (HTTP tool call)       │     │ 메시지    │
└──────────────────────┘     └─────────────────────────┘     └──────────┘
```

### Docker Compose 배치

```yaml
# docker-compose.test.yml에 추가
services:
  openclaw-gateway:
    build:
      context: ./vendor/openclaw # 또는 image: openclaw:local
      dockerfile: Dockerfile
    ports:
      - '18789:18789'
    volumes:
      - openclaw-config:/home/node/.openclaw
      - openclaw-workspace:/home/node/.openclaw/workspace
      - ./infrastructure/openclaw/skills:/home/node/.openclaw/workspace/skills # 커스텀 스킬
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - SLACK_APP_TOKEN=${SLACK_APP_TOKEN}
      - OPENCLAW_HOOKS_ENABLED=true
      - OPENCLAW_HOOKS_TOKEN=${OPENCLAW_HOOKS_TOKEN}
    depends_on:
      - redis
    networks:
      - rtb-network
```

## 3. 알림 (Hub → Slack)

### 3.1 OpenClaw Webhook API 사용

OpenClaw Gateway는 `/hooks/agent` 엔드포인트를 제공한다. Hub에서 HTTP POST로 이벤트를 보내면, OpenClaw AI가 메시지를 구성하여 Slack으로 전달한다.

**엔드포인트**: `POST http://openclaw-gateway:18789/hooks/agent`

**인증**: `Authorization: Bearer <OPENCLAW_HOOKS_TOKEN>`

**페이로드**:

```json
{
  "message": "PR #42가 생성되었습니다. PROJ-123: 로그인 페이지 구현. 리뷰를 부탁합니다.",
  "name": "RTB-CI",
  "sessionKey": "hook:rtb:PROJ-123",
  "deliver": true,
  "channel": "slack",
  "to": "C0123456789"
}
```

**필드 설명**:

- `message`: AI에게 전달할 이벤트 내용 (AI가 자연어로 재구성)
- `name`: Hook 이름 (세션 요약에 사용)
- `sessionKey`: 같은 이슈의 이벤트를 하나의 대화로 묶음
- `deliver: true`: AI 응답을 Slack으로 전송
- `channel: "slack"`: Slack 채널로 전달
- `to`: Slack 채널 ID 또는 사용자 ID

### 3.2 알림 유형

| 이벤트          | 시점                         | Slack 채널   | 메시지 예시                                                        |
| --------------- | ---------------------------- | ------------ | ------------------------------------------------------------------ |
| PR 생성         | AI 코드 생성 → PR push 완료  | #ci-cd       | "PROJ-123 PR #42 생성됨. 리뷰어: @user"                            |
| CI 성공         | target-ci 통과               | #ci-cd       | "PROJ-123 CI 통과 (lint✓ test✓ build✓)"                            |
| CI 실패         | target-ci 실패 (재시도 소진) | #ci-cd       | "PROJ-123 CI 실패: lint 에러 3개. 수동 확인 필요"                  |
| CD 배포 완료    | target-cd 성공               | #deployments | "int 환경 develop 브랜치 배포 완료"                                |
| CD 배포 실패    | target-cd 롤백               | #deployments | "int 환경 배포 실패 → 롤백 완료. api 서비스 health check 타임아웃" |
| 워크플로우 에러 | processJiraAutoDev 예외      | #ci-cd       | "PROJ-123 AI 워크플로우 실패: [에러 메시지]"                       |

### 3.3 구현: `notify-openclaw.ts`

```
packages/workflow-engine/src/utils/notify-openclaw.ts
```

```typescript
type NotifyOptions = {
  message: string;
  issueKey?: string;
  channel?: string; // Slack channel ID
  eventType:
    | 'pr_created'
    | 'ci_success'
    | 'ci_failure'
    | 'cd_success'
    | 'cd_failure'
    | 'workflow_error';
};

async function notifyOpenClaw(options: NotifyOptions): Promise<void>;
```

- OpenClaw Gateway URL: `OPENCLAW_GATEWAY_URL` env var (기본: `http://openclaw-gateway:18789`)
- Hook token: `OPENCLAW_HOOKS_TOKEN` env var
- Feature flag: `FEATURE_FLAGS.OPENCLAW_NOTIFY_ENABLED`
- 실패 시 로그만 남기고 워크플로우는 계속 진행 (알림 실패로 워크플로우 중단 금지)

### 3.4 워크플로우 연동 포인트

| 파일                        | 위치                        | 알림 내용      |
| --------------------------- | --------------------------- | -------------- |
| `jira-auto-dev-multi.ts`    | Phase 3 (push + PR) 완료 후 | PR 생성 알림   |
| `jira-auto-dev-multi.ts`    | Phase 2 (CI) 최종 실패 시   | CI 실패 알림   |
| `jira-auto-dev-opencode.ts` | Phase 4 (push + PR) 완료 후 | PR 생성 알림   |
| `target-deploy.ts`          | CD 성공/실패 시             | 배포 결과 알림 |

## 4. 대화형 트리거 (Slack → Hub)

### 4.1 OpenClaw Skill 구조

OpenClaw Skill은 `SKILL.md` 파일 하나로 구성된다. AI에게 사용 가능한 도구와 지시사항을 알려주는 방식.

```
infrastructure/openclaw/skills/rtb-hub/SKILL.md
```

````markdown
---
name: rtb-hub
description: RTB AI Hub 워크플로우를 관리합니다. Jira 작업 시작, 상태 확인, 배포 트리거.
metadata:
  { 'openclaw': { 'requires': { 'env': ['RTB_WEBHOOK_URL'] }, 'primaryEnv': 'RTB_WEBHOOK_URL' } }
---

# RTB AI Hub Integration

You can interact with RTB AI Hub to manage development workflows.

## Available Actions

### Start Jira Auto-Dev

When the user asks to start work on a Jira issue:

1. Use the `exec` tool to call the RTB Hub webhook API
2. POST to `{RTB_WEBHOOK_URL}/webhooks/jira?env=int`
3. Body: standard Jira webhook event format

Example command:
\```bash
curl -X POST "${RTB_WEBHOOK_URL}/webhooks/jira?env=int" \
 -H "Content-Type: application/json" \
 -d '{
"webhookEvent": "issue_updated",
"issue": {
"key": "<ISSUE_KEY>",
"fields": {
"status": {"name": "In Progress"},
"issuetype": {"name": "Story"},
"summary": "<SUMMARY>",
"project": {"key": "<PROJECT_KEY>"},
"labels": ["RTB-AI-HUB"]
}
}
}'
\```

### Check Workflow Status

When the user asks about workflow status:

1. Use the `exec` tool to query the Hub health endpoint
2. GET `${RTB_WEBHOOK_URL}/health`

### Trigger Deploy

When the user asks to deploy to an environment:

1. POST to `${RTB_WEBHOOK_URL}/webhooks/github?env=<env>`
2. Body: push event format with target branch
````

### 4.2 대화 예시

```
User (Slack): "PROJ-123 작업 시작해줘"
OpenClaw AI: → rtb-hub Skill → exec tool → POST /webhooks/jira?env=int
OpenClaw AI: "PROJ-123 작업을 시작했습니다. AI가 코드를 생성 중이에요."

User (Slack): "지금 상태 어때?"
OpenClaw AI: → GET /health
OpenClaw AI: "워크플로우 엔진이 정상 동작 중입니다. 현재 활성 작업: 2건"
```

## 5. 설정 변경 사항

### 5.1 packages/shared/src/constants.ts

```typescript
// FEATURE_FLAGS에 추가
OPENCLAW_NOTIFY_ENABLED: process.env.OPENCLAW_NOTIFY_ENABLED === 'true',
```

### 5.2 .env.advanced.example

```bash
# ─── OpenClaw Integration (알림 + 대화형 트리거) ─────────────────────────────
# OpenClaw Gateway를 통해 Slack으로 워크플로우 알림을 보내고,
# Slack에서 대화형으로 워크플로우를 트리거할 수 있습니다.

# OPENCLAW_NOTIFY_ENABLED=true
# OPENCLAW_GATEWAY_URL=http://openclaw-gateway:18789
# OPENCLAW_HOOKS_TOKEN=your-shared-secret
# OPENCLAW_NOTIFY_CHANNEL=C0123456789

# Slack 설정 (OpenClaw에서 사용)
# SLACK_BOT_TOKEN=xoxb-...
# SLACK_APP_TOKEN=xapp-...
```

### 5.3 OpenClaw Gateway 설정 (openclaw.json)

```json5
{
  hooks: {
    enabled: true,
    token: '${OPENCLAW_HOOKS_TOKEN}',
    path: '/hooks',
  },
  channels: {
    slack: {
      enabled: true,
      appToken: '${SLACK_APP_TOKEN}',
      botToken: '${SLACK_BOT_TOKEN}',
      dm: {
        enabled: true,
        policy: 'pairing',
      },
    },
  },
  skills: {
    entries: {
      'rtb-hub': {
        enabled: true,
        env: {
          RTB_WEBHOOK_URL: 'http://webhook-listener:4000',
        },
      },
    },
  },
}
```

## 6. 파일 목록

### 신규 생성

| 파일                                                    | 설명                               |
| ------------------------------------------------------- | ---------------------------------- |
| `packages/workflow-engine/src/utils/notify-openclaw.ts` | 알림 유틸리티 (Hub→OpenClaw→Slack) |
| `infrastructure/openclaw/skills/rtb-hub/SKILL.md`       | 커스텀 Skill (Slack→Hub 트리거)    |
| `infrastructure/openclaw/openclaw.json`                 | OpenClaw Gateway 설정              |
| `infrastructure/openclaw/workspace/.gitkeep`            | 워크스페이스 디렉토리              |

### 수정

| 파일                                                               | 변경 내용                                   |
| ------------------------------------------------------------------ | ------------------------------------------- |
| `packages/shared/src/constants.ts`                                 | `OPENCLAW_NOTIFY_ENABLED` feature flag 추가 |
| `packages/workflow-engine/src/workflows/jira-auto-dev-multi.ts`    | PR 생성/CI 실패 시 알림 호출 추가           |
| `packages/workflow-engine/src/workflows/jira-auto-dev-opencode.ts` | PR 생성 시 알림 호출 추가                   |
| `packages/workflow-engine/src/workflows/target-deploy.ts`          | CD 성공/실패 시 알림 호출 추가              |
| `docker-compose.test.yml`                                          | openclaw-gateway 서비스 추가                |
| `.env.advanced.example`                                            | OpenClaw 관련 env vars 추가                 |

## 7. 의존성

- **OpenClaw**: Node 22+ 필요. Docker 이미지 자체 빌드 또는 npm global install
- **Slack App**: Socket Mode 활성화된 Slack App 필요 (Bot Token + App Token)
- **Anthropic API Key**: OpenClaw AI가 메시지를 구성하므로 기존 키 공유
- **네트워크**: Docker 내부 네트워크에서 `openclaw-gateway ↔ webhook-listener` 통신 가능해야 함

## 8. 제약사항

- OpenClaw `/hooks/agent`는 비동기 (202 Accepted). 알림 전송 확인은 불가 (fire-and-forget)
- Skill의 exec tool은 OpenClaw Gateway가 실행하므로, Hub API가 Docker 네트워크 내에서 접근 가능해야 함
- OpenClaw는 Node 22 필요 — rtb-ai-hub는 Node 20. Docker 컨테이너 분리로 해결
- 초기에는 AI가 메시지를 자연어로 재구성하므로 지연(수초) 있음. 빠른 알림이 필요하면 Slack API 직접 호출 고려

## 9. 단계별 구현 순서

1. **Docker Compose에 OpenClaw Gateway 추가** + 기본 설정
2. **Slack App 생성** + Socket Mode 토큰 발급
3. **notify-openclaw.ts** 구현 + FEATURE_FLAGS 추가
4. **워크플로우에 알림 호출 삽입** (jira-auto-dev-multi, opencode, target-deploy)
5. **OpenClaw Skill 작성** (rtb-hub)
6. **통합 테스트** (Docker Compose up → Slack 메시지 확인)
