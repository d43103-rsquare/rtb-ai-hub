# End-to-End Testing Guide

RTB AI Hub와 OpenClaw Gateway를 통합한 전체 시스템의 End-to-End(E2E) 테스트 가이드입니다.

## 개요

이 가이드는 7개 AI 에이전트(PM, System Planner, UX Designer, UI Developer, Backend Developer, QA, Ops)가 Slack을 통해 팀과 소통하고 업무를 조율하는 전체 플로우를 검증하는 방법을 설명합니다.

## 테스트 환경 구성

### 사전 요구사항

```bash
# 1. 전체 스택이 실행 중이어야 함
docker-compose up -d

# 2. OpenClaw Gateway가 정상 작동 중인지 확인
curl http://localhost:3000/health

# 3. RTB Hub가 정상 작동 중인지 확인
curl http://localhost:4000/health

# 4. Slack App이 설정되어 있어야 함
# infrastructure/openclaw/SETUP.md 참조
```

### 환경변수 확인

```bash
# .env 파일에서 다음 값들이 설정되어 있는지 확인
cat .env | grep -E "(OPENCLAW|SLACK|RTB_HUB)"

# 예상 출력:
# OPENCLAW_GATEWAY_URL=http://localhost:3000
# OPENCLAW_HOOKS_TOKEN=rtb-ai-hub-openclaw-hooks-token-2026
# SLACK_BOT_TOKEN=xoxb-...
# SLACK_APP_TOKEN=xapp-...
# RTB_HUB_WEBHOOK_URL=http://localhost:4000/webhooks/openclaw
```

## 테스트 실행

### 1. 빠른 연결 테스트

```bash
# 모든 필수 서비스가 실행 중인지 확인
./scripts/test-e2e.sh --quick
```

### 2. 전체 E2E 테스트 스위트

```bash
# 모든 E2E 테스트 실행 (약 10-15분 소요)
pnpm test:e2e

# 특정 시나리오만 실행
pnpm test:e2e -- --testNamePattern="Scenario 1"
pnpm test:e2e -- --testNamePattern="Scenario 2"
pnpm test:e2e -- --testNamePattern="Scenario 3"
```

### 3. 수동 테스트 절차

#### 3.1 Slack 연결 테스트

**Slack에서 실행:**

```
@RTB AI Assistant 안녕하세요
```

**예상 응답:**

- PM Agent(VisionKeeper)가 인사 메시지 응답
- 메시지에 에이전트 이름과 역할 표시

#### 3.2 Jira 티켓 생성 테스트

**Slack에서 실행:**

```
/rtb-ai start PROJ-123
```

**검증 항목:**

- [ ] PM Agent가 티켓 내용 확인
- [ ] Wiki 지식 DB 검색
- [ ] System Planner Agent에게 아키텍처 설계 요청
- [ ] UX Designer Agent에게 UX 설계 요청
- [ ] 각 에이전트가 Slack에 진행 상황 보고

#### 3.3 핸드오프 테스트

**Slack에서 실행:**

```
/rtb-ai handoff pm-dev backend
```

**검증 항목:**

- [ ] PM Agent가 현재 상태 정리
- [ ] Backend Developer Agent에게 컨텍스트 전달
- [ ] 핸드오프 완료 메시지 수신

#### 3.4 컨텍스트 조회 테스트

**Slack에서 실행:**

```
/rtb-ai context PROJ-123
```

**검증 항목:**

- [ ] Jira 티켓 정보 표시
- [ ] 연결된 Figma 링크 표시
- [ ] 연결된 GitHub PR 표시
- [ ] Wiki 문서 참조 표시

## 테스트 시나리오

### 시나리오 1: 로그인 기능 개발 (30분)

```
[시작] PM Agent가 Jira 티켓(PROJ-123) 분석
    ↓
System Planner Agent: 아키텍처 설계
    ↓
UX Designer Agent: UX 플로우 설계
    ↓
UI Developer Agent: 로그인 폼 구현
    ↓
Backend Developer Agent: 로그인 API 구현
    ↓
QA Agent: 테스트 케이스 작성
    ↓
Ops Agent: 프로덕션 배포
    ↓
[완료] Slack에 완료 알림
```

**검증 체크리스트:**

- [ ] Jira에 7개의 subtask 생성됨
- [ ] 각 에이전트별로 Slack 채널에 메시지 게시
- [ ] GitHub PR이 생성되고 컨텍스트 포함됨
- [ ] 배포 완료 후 상태 업데이트

### 시나리오 2: 결제 API 장애 대응 (15분)

```
[시작] Datadog P1 알림
    ↓
Ops Agent: 장애 감지 및 Jira 티켓 생성
    ↓
PM Agent: 이해관계자 알림
    ↓
Backend Developer Agent: 로그 분석
    ↓
Ops Agent: 롤백 실행
    ↓
QA Agent: 수정 검증
    ↓
[완료] 장애 복구 확인 및 보고
```

**검증 체크리스트:**

- [ ] P1 알림 즉시 감지 (10초 이내)
- [ ] Jira Incident 티켓 자동 생성
- [ ] Slack #alerts 채널에 알림
- [ ] 롤백이 5분 이내에 완료
- [ ] 장애 분석 보고서 생성

### 시나리오 3: 신규 입사자 온병 (45분)

```
[시작] PM Agent가 온병 계획 수립
    ↓
System Planner Agent: 시스템 아키텍처 설명
    ↓
Ops Agent: 개발 환경 설정
    ↓
UX Designer Agent: 디자인 시스템 설명
    ↓
PM Agent: 첫 업무 할당
    ↓
[완료] 온병 진행 상황 보고
```

**검증 체크리스트:**

- [ ] 온병 계획 문서 생성
- [ ] 개발 환경 설정 스크립트 제공
- [ ] 첫 Jira 티켓 할당
- [ ] 멘토(Backend Dev Agent) 자동 지정
- [ ] 진행 상황이 Slack에 매일 보고됨

## 테스트 데이터

### Jira 테스트 티켓

```json
{
  "key": "PROJ-123",
  "summary": "사용자 로그인 기능 구현",
  "description": "RTB 플랫폼의 사용자 인증 시스템을 구현합니다. OAuth 2.0 기반 소셜 로그인과 세션 관리가 필요합니다.",
  "status": "In Progress",
  "labels": ["auth", "login", "RTB-AI-HUB"],
  "components": ["Frontend", "Backend"],
  "priority": "High"
}
```

### Slack 테스트 메시지

```json
{
  "type": "app_mention",
  "user": "U1234567890",
  "text": "@RTB AI Assistant PROJ-123 로그인 기능 어떻게 진행되고 있어?",
  "channel": "C1234567890",
  "ts": "1234567890.123456"
}
```

## 문제 해결

### Gateway 연결 실패

**증상:** `curl http://localhost:3000/health`가 실패

**해결:**

```bash
# Gateway 로그 확인
docker-compose logs openclaw-gateway

# 설정 파일 확인
docker-compose exec openclaw-gateway cat /home/node/.openclaw/openclaw.json

# Gateway 재시작
docker-compose restart openclaw-gateway
```

### Slack 메시지 전송 실패

**증상:** Slack에 메시지가 도착하지 않음

**해결:**

```bash
# Slack 토큰 유효성 확인
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     https://slack.com/api/auth.test

# Socket Mode 상태 확인
curl http://localhost:3000/channels/slack/status
```

### 에이전트 응답 없음

**증상:** 특정 에이전트가 응답하지 않음

**해결:**

```bash
# 에이전트 상태 확인
curl http://localhost:3000/agents

# 특정 에이전트 상태 확인
curl http://localhost:3000/agents/pm-agent

# 에이전트 로그 확인
docker-compose logs openclaw-gateway | grep pm-agent
```

## CI/CD 통합

### GitHub Actions Workflow

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *' # 매일 새벽 2시

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup environment
        run: |
          cp .env.example .env
          echo "SLACK_BOT_TOKEN=${{ secrets.SLACK_BOT_TOKEN }}" >> .env
          echo "SLACK_APP_TOKEN=${{ secrets.SLACK_APP_TOKEN }}" >> .env

      - name: Start services
        run: docker-compose up -d

      - name: Wait for services
        run: |
          ./scripts/wait-for-services.sh

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-test-results
          path: test-results/
```

## 성능 기준

### 응답 시간 목표

| 작업               | 목표 시간  | 최대 시간 |
| ------------------ | ---------- | --------- |
| Slack 메시지 수신  | < 1초      | 3초       |
| 에이전트 응답 생성 | < 5초      | 10초      |
| Jira 티켓 생성     | < 10초     | 30초      |
| 전체 시나리오 완료 | 시나리오별 | +20%      |

### 부하 테스트

```bash
# 동시에 10개의 요청 처리
./scripts/load-test.sh --concurrent 10 --duration 60

# 예상 결과:
# - 성공률: 100%
# - 평균 응답 시간: < 5초
# - 에러율: 0%
```

## 테스트 결과 보고

### 테스트 실행 후 리포트 생성

```bash
# HTML 리포트 생성
pnpm test:e2e -- --reporter=html

# 결과 확인
open test-results/e2e-report.html
```

### 리포트 내용

- 전체 테스트 수 및 통과/실패 현황
- 각 시나리오별 실행 시간
- 에이전트별 응답 시간
- Slack 메시지 전송 성공률
- 스크린샷 (실패 시)

## 다음 단계

테스트가 모두 통과하면:

1. **PoC 실행**: 4개 에이전트(PM, System Planner, UX, Backend)로 실제 기능 개발
2. **파일럿 테스트**: 2주간 제한된 팀으로 실제 업무에 적용
3. **전체 롤아웃**: 7개 에이전트 모두 활성화

## 참고 문서

- [SETUP.md](../infrastructure/openclaw/SETUP.md) - OpenClaw Gateway 설정
- [AGENT_SCENARIOS.md](../architecture/AGENT_SCENARIOS.md) - 상세 시나리오 설명
- [tests/integration/README.md](./README.md) - 통합 테스트 문서
