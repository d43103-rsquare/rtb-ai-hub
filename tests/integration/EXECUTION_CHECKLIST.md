# OpenClaw Integration Test Execution Checklist

## 사전 준비

### 1. 환경 확인

- [ ] Docker & Docker Compose 설치됨
- [ ] `.env` 파일에 필수 환경변수 설정됨
- [ ] RTB-Wiki 리포지토리 클론됨 (`~/Workspace/poc/rtb-wiki`)
- [ ] Work 리포지토리 클론됨 (`~/Workspace/poc/rtb-new`)

### 2. Slack App 설정

- [ ] Slack App 생성 완료 (`RTB AI Assistant`)
- [ ] Bot Token 발급 (`SLACK_BOT_TOKEN=xoxb-...`)
- [ ] App Token 발급 (`SLACK_APP_TOKEN=xapp-...`)
- [ ] Signing Secret 확인 (`SLACK_SIGNING_SECRET=...`)
- [ ] Socket Mode 활성화
- [ ] Bot이 테스트 채널에 초대됨

### 3. 필수 환경변수

```bash
# .env 파일에 다음이 설정되어 있는지 확인
cat .env | grep -E "^(OPENCLAW|SLACK|RTB_HUB|GITHUB|JIRA|ANTHROPIC)"
```

필수 항목:

- [ ] `OPENCLAW_GATEWAY_URL=http://localhost:3000`
- [ ] `OPENCLAW_HOOKS_TOKEN=rtb-ai-hub-openclaw-hooks-token-2026`
- [ ] `SLACK_BOT_TOKEN=xoxb-...`
- [ ] `SLACK_APP_TOKEN=xapp-...`
- [ ] `ANTHROPIC_API_KEY=sk-ant-...`

## 테스트 실행 순서

### Phase 1: 인프라 기동 (5분)

```bash
# 1. 전체 스택 시작
docker-compose up -d

# 2. 서비스 상태 확인
./scripts/test-e2e.sh --quick
```

체크리스트:

- [ ] PostgreSQL 실행 중 (port 5432)
- [ ] Redis 실행 중 (port 6379)
- [ ] OpenClaw Gateway 실행 중 (port 3000)
- [ ] RTB Hub Webhook 실행 중 (port 4000)
- [ ] RTB Workflow Engine 실행 중
- [ ] RTB Dashboard 실행 중 (port 3000)

### Phase 2: Gateway 검증 (5분)

```bash
# Health Check
curl http://localhost:3000/health

# 에이전트 목록 확인
curl http://localhost:3000/agents
```

체크리스트:

- [ ] Gateway Health Check 200 OK
- [ ] 7개 에이전트 모두 등록됨
- [ ] pm-agent가 coordinator로 설정됨
- [ ] 설정 파일 로딩됨

### Phase 3: Slack 연결 검증 (5분)

Slack에서 테스트:

```
@RTB AI Assistant 안녕하세요
```

체크리스트:

- [ ] Bot이 메시지 수신
- [ ] pm-agent가 응답
- [ ] 응답에 에이전트 이름 포함
- [ ] 응답 시간 < 5초

### Phase 4: 통합 테스트 실행 (10분)

```bash
# Gateway 연결 테스트
pnpm test:integration -- --testNamePattern="Gateway"

# 에이전트 라우팅 테스트
pnpm test:integration -- --testNamePattern="Agent"

# 양방향 통신 테스트
pnpm test:integration -- --testNamePattern="Bidirectional"
```

체크리스트:

- [ ] 모든 Gateway 테스트 통과
- [ ] 모든 Agent 테스트 통과
- [ ] 모든 Bidirectional 테스트 통과

### Phase 5: 시나리오 테스트 (30분)

```bash
# 시나리오 1: 로그인 기능 개발
./scripts/test-e2e.sh --scenario=1

# 시나리오 2: 장애 대응
./scripts/test-e2e.sh --scenario=2

# 시나리오 3: 온병
./scripts/test-e2e.sh --scenario=3
```

체크리스트:

- [ ] 시나리오 1 통과 (로그인 개발)
- [ ] 시나리오 2 통과 (장애 대응)
- [ ] 시나리오 3 통과 (온병)

## 상세 검증 항목

### Gateway 기능 검증

| 항목          | 명령어                                                             | 예상 결과         |
| ------------- | ------------------------------------------------------------------ | ----------------- |
| Health Check  | `curl http://localhost:3000/health`                                | `{"status":"ok"}` |
| Agent 목록    | `curl http://localhost:3000/agents`                                | 7개 에이전트      |
| PM Agent 정보 | `curl http://localhost:3000/agents/pm-agent`                       | 상세 정보         |
| 설정 확인     | `curl -H "Authorization: Bearer ..." http://localhost:3000/config` | 설정 JSON         |

### RTB Hub 기능 검증

| 항목         | 명령어                              | 예상 결과         |
| ------------ | ----------------------------------- | ----------------- |
| Health Check | `curl http://localhost:4000/health` | `{"status":"ok"}` |
| Webhook 수신 | POST `/webhooks/openclaw`           | 200 OK            |
| Context API  | GET `/api/context/PROJ-123`         | Context JSON      |

### Slack 연동 검증

| 항목          | Slack 명령어               | 예상 결과   |
| ------------- | -------------------------- | ----------- |
| 멘션 응답     | `@RTB AI Assistant 안녕`   | 인사 응답   |
| 상태 확인     | `/rtb-ai status`           | 시스템 상태 |
| 작업 시작     | `/rtb-ai start PROJ-123`   | 확인 메시지 |
| 컨텍스트 조회 | `/rtb-ai context PROJ-123` | 티켓 정보   |

## 문제 발생 시 대응

### Gateway 연결 실패

```bash
# 1. 로그 확인
docker-compose logs openclaw-gateway

# 2. 설정 파일 확인
docker-compose exec openclaw-gateway cat /home/node/.openclaw/openclaw.json

# 3. 재시작
docker-compose restart openclaw-gateway
```

### Slack 연결 실패

```bash
# 1. 토큰 유효성 확인
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     https://slack.com/api/auth.test

# 2. Gateway 로그 확인
docker-compose logs openclaw-gateway | grep -i slack

# 3. Socket Mode 상태 확인
curl http://localhost:3000/channels/slack/status
```

### 테스트 실패

```bash
# 1. 상세 로그 확인
pnpm test:integration -- --verbose

# 2. 특정 테스트만 실행
pnpm test:integration -- --testNamePattern="Gateway"

# 3. 환경 재설정
./scripts/test-e2e.sh --quick
```

## 테스트 결과 보고

### 성공 기준

- 모든 Gateway 테스트: ✅ 통과
- 모든 Agent 테스트: ✅ 통과
- 모든 Bidirectional 테스트: ✅ 통과
- 시나리오 1: ✅ 통과 (30분 이내)
- 시나리오 2: ✅ 통과 (15분 이내)
- 시나리오 3: ✅ 통과 (45분 이내)

### 결과 수집

```bash
# 테스트 결과 저장
pnpm test:integration -- --reporter=json > test-results/integration.json
pnpm test:e2e -- --reporter=json > test-results/e2e.json

# 리포트 생성
pnpm test:integration -- --reporter=html
```

## 다음 단계

테스트 모두 통과 후:

1. **PoC Phase 1** (Week 1-2): 4개 에이전트로 실제 기능 개발
   - PM + System Planner + UX Designer + Backend Developer
   - 1개 실제 Jira 티켓으로 엔드투엔드 테스트

2. **Pilot Phase** (Week 3-4): 7개 에이전트 전체 활성화
   - 2주간 제한된 팀(3-5명)으로 실제 업무 적용
   - 피드백 수집 및 개선

3. **Full Rollout** (Week 5-8): 전체 팀 적용
   - 모든 개발 워크플로우에 통합
   - 모니터링 및 최적화

## 연락처 및 지원

- 기술 문의: [Team Slack #rtb-ai-hub]
- 긴급 이슈: [Ops Agent @ops-agent]
- 문서: `/Users/d43103/Workspace/ai/rtb-ai-hub/docs/architecture/`
