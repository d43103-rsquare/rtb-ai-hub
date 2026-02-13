# OpenClaw Gateway Integration Tests

OpenClaw Gateway와 RTB AI Hub 간의 양방향 통합 테스트 스크립트 모음입니다.

## 테스트 구조

```
tests/
├── integration/
│   ├── openclaw/
│   │   ├── gateway.test.ts          # Gateway 기본 연결 테스트
│   │   ├── slack-webhook.test.ts    # Slack 웹훅 테스트
│   │   ├── agent-routing.test.ts    # 에이전트 라우팅 테스트
│   │   └── bidirectional.test.ts    # 양방향 통신 테스트
│   ├── scenarios/
│   │   ├── scenario-1-login.test.ts    # 로그인 기능 개발 시나리오
│   │   ├── scenario-2-incident.test.ts # 장애 대응 시나리오
│   │   └── scenario-3-onboarding.test.ts # 신규 입사자 온병 시나리오
│   └── utils/
│       ├── test-helpers.ts          # 테스트 유틸리티
│       └── mock-data.ts             # 테스트용 Mock 데이터
```

## 실행 방법

### 모든 테스트 실행

```bash
pnpm test:integration
```

### 특정 테스트 실행

```bash
# Gateway 연결 테스트
pnpm test:integration -- --testNamePattern="Gateway"

# 에이전트 라우팅 테스트
pnpm test:integration -- --testNamePattern="Agent"

# 시나리오 테스트
pnpm test:integration -- --testNamePattern="Scenario"
```

### 환경별 테스트

```bash
# 개발 환경 (int)
TEST_ENV=int pnpm test:integration

# 스테이징 환경 (stg)
TEST_ENV=stg pnpm test:integration
```

## 테스트 커버리지

### 1. Gateway 연결 테스트

- [x] Gateway Health Check
- [x] Configuration validation
- [x] Agent manifest loading
- [x] Webhook endpoint availability

### 2. Slack 통합 테스트

- [x] Socket Mode 연결
- [x] Bot Token 인증
- [x] 메시지 전송/수신
- [x] 슬래시 명령어 처리

### 3. 에이전트 라우팅 테스트

- [x] PM Agent 응답
- [x] System Planner Agent 응답
- [x] UX Designer Agent 응답
- [x] UI Developer Agent 응답
- [x] Backend Developer Agent 응답
- [x] QA Agent 응답
- [x] Ops Agent 응답

### 4. 양방향 통신 테스트

- [x] Slack → OpenClaw → RTB Hub
- [x] RTB Hub → OpenClaw → Slack
- [x] Context 전달
- [x] 이벤트 콜백

### 5. 시나리오 테스트

- [x] Scenario 1: 로그인 기능 개발
- [x] Scenario 2: 결제 API 장애 대응
- [x] Scenario 3: 신규 입사자 온병

## 테스트 데이터

### Mock Jira Issue

```typescript
{
  key: "PROJ-123",
  summary: "사용자 로그인 기능 구현",
  description: "RTB 플랫폼의 사용자 인증 시스템 구현",
  status: "In Progress",
  assignee: "pm-agent",
  labels: ["auth", "login", "RTB-AI-HUB"]
}
```

### Mock Slack Event

```typescript
{
  type: "app_mention",
  user: "U123456",
  text: "@RTB AI Assistant 로그인 기능 어떻게 진행되고 있어?",
  channel: "C123456",
  ts: "1234567890.123456"
}
```

## CI/CD 통합

GitHub Actions workflow:

```yaml
name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      - name: Install dependencies
        run: pnpm install
      - name: Run integration tests
        run: pnpm test:integration
        env:
          TEST_ENV: int
          OPENCLAW_GATEWAY_URL: http://localhost:3000
          SLACK_BOT_TOKEN: ${{ secrets.TEST_SLACK_BOT_TOKEN }}
```

## 문제 해결

### 테스트 실패 시 체크리스트

1. **Gateway가 실행 중인지 확인**

   ```bash
   curl http://localhost:3000/health
   ```

2. **RTB Hub가 실행 중인지 확인**

   ```bash
   curl http://localhost:4000/health
   ```

3. **Slack Token 유효성 확인**

   ```bash
   curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        https://slack.com/api/auth.test
   ```

4. **네트워크 연결 확인**
   ```bash
   docker network ls
   docker network inspect rtb-ai-hub_default
   ```

## 테스트 결과 보고

테스트 실행 후 `coverage/` 디렉토리에서 상세 리포트 확인:

```bash
# HTML 리포트 열기
open coverage/lcov-report/index.html

# 커버리지 요약
pnpm test:integration -- --coverage --coverageReporters=text-summary
```
