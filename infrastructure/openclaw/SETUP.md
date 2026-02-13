# OpenClaw Gateway 설정 가이드

OpenClaw Gateway를 RTB AI Hub와 통합하여 7개 AI 에이전트가 Slack을 통해 팀과 소통하고 업무를 조율할 수 있도록 설정합니다.

## 개요

- **Gateway URL**: http://localhost:3000
- **Docker 서비스명**: `rtb-openclaw-gateway`
- **에이전트 수**: 7개 (PM, System Planner, UX Designer, UI Developer, Backend Developer, QA, Ops)
- **통신 방식**: 양방향 (RTB Hub ↔ OpenClaw Gateway ↔ Slack)

## 사전 요구사항

1. Docker & Docker Compose
2. Slack App (Bot Token, App Token 필요)
3. RTB AI Hub가 이미 실행 중이거나 실행 가능한 상태

## 설정 단계

### 1. Slack App 생성

1. [Slack API](https://api.slack.com/apps)로 이동
2. **Create New App** → **From scratch**
3. 앱 이름: `RTB AI Assistant`
4. Workspace 선택

### 2. Bot Token 발급

1. 왼쪽 메뉴 **OAuth & Permissions** 클릭
2. **Scopes** 섹션에서 **Bot Token Scopes** 추가:
   - `chat:write` - 메시지 작성
   - `chat:write.public` - 공개 채널 메시지
   - `channels:read` - 채널 목록 조회
   - `groups:read` - 그룹 조회
   - `im:read` - DM 조회
   - `mpim:read` - 멀티 DM 조회
   - `commands` - 슬래시 명령어
   - `app_mentions:read` - 앱 멘션 읽기
3. **Install to Workspace** 클릭
4. **Bot User OAuth Token** 복사 (형식: `xoxb-...`)

### 3. App Token 발급 (Socket Mode용)

1. 왼쪽 메뉴 **Basic Information** 클릭
2. **App-Level Tokens** 섹션에서 **Generate Token and Scopes** 클릭
3. 토큰 이름: `rtb-ai-socket`
4. Scopes 추가: `connections:write`
5. **Generate** 클릭
6. **App-Level Token** 복사 (형식: `xapp-...`)

### 4. Signing Secret 확인

1. **Basic Information** 페이지의 **App Credentials** 섹션
2. **Signing Secret** 복사

### 5. 환경변수 설정

`.env` 파일에 다음 변수들을 추가:

```bash
# OpenClaw Gateway Configuration
OPENCLAW_GATEWAY_MODE=http
OPENCLAW_GATEWAY_PORT=3000
OPENCLAW_GATEWAY_HOST=0.0.0.0
OPENCLAW_HOOKS_TOKEN=rtb-ai-hub-openclaw-hooks-token-2026

# Agent Configuration
OPENCLAW_AGENTS_ENABLED=true
OPENCLAW_AGENT_MODE=multi
OPENCLAW_COORDINATOR_AGENT=pm-agent

# Slack Integration (3단계에서 발급한 토큰)
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-here
SLACK_APP_TOKEN=xapp-your-slack-app-token-here
SLACK_SIGNING_SECRET=your-slack-signing-secret-here

# RTB Hub Integration
RTB_HUB_WEBHOOK_URL=http://localhost:4000/webhooks/openclaw
RTB_HUB_API_URL=http://localhost:4000
```

### 6. Docker Compose 실행

```bash
# OpenClaw Gateway만 시작
docker-compose up -d openclaw-gateway

# 또는 전체 스택 재시작
docker-compose up -d
```

### 7. Health Check

```bash
# Gateway 상태 확인
curl http://localhost:3000/health

# 응답 예시
{"status":"ok","service":"openclaw-gateway"}
```

### 8. Slack 연결 테스트

Slack에서 다음 명령어 테스트:

```
/rtb-ai status
```

또는 봇을 멘션:

```
@RTB AI Assistant 안녕하세요
```

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Slack                                │
└──────────────┬──────────────────────────────────────────────┘
               │ Socket Mode / Webhooks
               ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Gateway :3000                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Agent Router                                       │    │
│  │  - pm-agent (VisionKeeper)                          │    │
│  │  - system-planner-agent (BlueprintMaster)           │    │
│  │  - ux-designer-agent (ExperienceCraftsman)          │    │
│  │  - ui-dev-agent (PixelPerfect)                      │    │
│  │  - backend-dev-agent (DataGuardian)                 │    │
│  │  - qa-agent (QualityGatekeeper)                     │    │
│  │  - ops-agent (InfrastructureKeeper)                 │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP Webhooks
               ▼
┌─────────────────────────────────────────────────────────────┐
│              RTB Hub :4000                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Webhook Listener                                   │    │
│  │  - /webhooks/openclaw (OpenClaw events)             │    │
│  │  - /webhooks/slack (Slack events)                   │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│              RTB Workflow Engine                            │
│  - Multi-agent pipeline                                     │
│  - Context engine (context_links)                           │
│  - Wiki knowledge injection                                 │
│  - Jira/GitHub/Figma integration                            │
└─────────────────────────────────────────────────────────────┘
```

## 이벤트 흐름

### 1. Slack → OpenClaw → RTB Hub

1. 사용자가 Slack에서 `@RTB AI Assistant` 멘션 또는 `/rtb-ai` 명령어 사용
2. OpenClaw Gateway가 Slack Socket Mode로 이벤트 수신
3. Gateway가 적절한 Agent로 라우팅
4. Agent가 처리 후 RTB Hub webhook으로 결과 전송 (`POST /webhooks/openclaw`)
5. RTB Hub가 workflow 시작 또는 context 업데이트

### 2. RTB Hub → OpenClaw → Slack

1. RTB Hub에서 이벤트 발생 (Jira 상태 변경, PR 생성 등)
2. RTB Hub가 OpenClaw Gateway에 webhook 전송
3. Gateway가 적절한 채널/사용자로 Slack 메시지 전송

## 에이전트별 Slack 채널 설정 (선택사항)

각 에이전트가 담당 채널에만 메시지를 복사하도록 설정:

```bash
# .env에 추가
OPENCLAW_PM_CHANNEL=C0123456789
OPENCLAW_SYSTEM_PLANNER_CHANNEL=C0123456790
OPENCLAW_UX_DESIGNER_CHANNEL=C0123456791
OPENCLAW_UI_DEV_CHANNEL=C0123456792
OPENCLAW_BACKEND_DEV_CHANNEL=C0123456793
OPENCLAW_QA_CHANNEL=C0123456794
OPENCLAW_OPS_CHANNEL=C0123456795
```

## 문제 해결

### Gateway가 시작되지 않음

```bash
# 로그 확인
docker-compose logs openclaw-gateway

# 설정 파일 확인
docker-compose exec openclaw-gateway cat /home/node/.openclaw/openclaw.json
```

### Slack 연결 실패

1. **Socket Mode 활성화 확인**:
   - Slack App 설정 → **Socket Mode** → **Enable Socket Mode**

2. **토큰 유효성 확인**:
   ```bash
   curl -H "Authorization: Bearer xoxb-your-token" \
        https://slack.com/api/auth.test
   ```

### RTB Hub 연결 실패

```bash
# RTB Hub webhook 엔드포인트 확인
curl http://localhost:4000/webhooks/openclaw \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"eventType":"agent:message","timestamp":"2026-01-01T00:00:00Z","source":"test","data":{"message":"test"}}'
```

## 명령어 참조

### Slack 슬래시 명령어

| 명령어                        | 설명              | 예시                               |
| ----------------------------- | ----------------- | ---------------------------------- |
| `/rtb-ai status`              | 시스템 상태 확인  | `/rtb-ai status`                   |
| `/rtb-ai start <jira-key>`    | Jira 작업 시작    | `/rtb-ai start PROJ-123`           |
| `/rtb-ai handoff <from> <to>` | 에이전트 핸드오프 | `/rtb-ai handoff pm-dev developer` |
| `/rtb-ai context <jira-key>`  | 맥락 조회         | `/rtb-ai context PROJ-123`         |
| `/rtb-ai wiki <query>`        | Wiki 검색         | `/rtb-ai wiki 사용자 인증`         |

## 다음 단계

1. **에이전트 테스트**: 각 에이전트가 Slack에서 응답하는지 확인
2. **시나리오 테스트**: [AGENT_SCENARIOS.md](./AGENT_SCENARIOS.md)의 3가지 시나리오 실행
3. **PoC 실행**: 4개 에이전트로 간단한 기능 개발 워크플로우 테스트

## 참고 문서

- [OpenClaw 공식 문서](https://github.com/openclaw/openclaw)
- [AGENT_IDENTITIES.md](./AGENT_IDENTITIES.md) - 에이전트 페르소나
- [AGENT_SCENARIOS.md](./AGENT_SCENARIOS.md) - 시나리오 정의
- [OPENCLAW_GATEWAY_INTEGRATION.md](../architecture/OPENCLAW_GATEWAY_INTEGRATION.md) - 아키텍처 상세
