# RTB AI Hub - 설정 가이드

## 빠른 시작

### 1. 사전 요구사항
- Docker & Docker Compose 설치
- Git 설치
- AI 서비스용 API 키 (Anthropic, OpenAI)

### 2. 클론 및 설정

```bash
git clone <repository-url>
cd rtb-ai-hub

cp .env.example .env
```

### 3. API 키 추가

`.env`를 편집하고 실제 API 키를 추가하세요:

```bash
# Figma→Jira 워크플로우에 필수
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxx

# 선택사항 (향후 워크플로우용)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OMO_API_KEY=your-omo-key-here

# 외부 서비스 (MCP 통합 테스트 준비가 되었을 때 추가)
JIRA_HOST=your-org.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-token

FIGMA_ACCESS_TOKEN=your-figma-token
GITHUB_TOKEN=ghp_your-github-token
```

### 4. 모든 서비스 시작

```bash
docker-compose -f docker-compose.test.yml up -d --build
```

### 5. 서비스 확인

```bash
docker-compose -f docker-compose.test.yml ps
```

예상 출력 (모두 정상):
```
NAME                   STATUS
rtb-postgres           Up (healthy)
rtb-redis              Up (healthy)
rtb-webhook-listener   Up (healthy)
rtb-workflow-engine    Up (healthy)
```

## 시스템 테스트

### 테스트 1: Figma Webhook (AI 기반 워크플로우)

Figma webhook을 전송하여 AI 분석을 트리거합니다:

```bash
curl -X POST http://localhost:4000/webhooks/figma \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "FILE_UPDATE",
    "file_key": "abc123",
    "file_name": "Mobile App Redesign",
    "file_url": "https://figma.com/file/abc123"
  }'
```

**예상 동작:**
- 반환: `{"status":"accepted","eventId":"abc123"}`
- Workflow engine이 작업 처리 (로그 확인)
- AI가 Figma 디자인 분석
- 결과가 PostgreSQL에 저장됨

**로그 확인:**
```bash
docker-compose -f docker-compose.test.yml logs -f workflow-engine
```

**데이터베이스 확인:**
```bash
docker exec rtb-postgres psql -U postgres -d rtb_ai_hub \
  -c "SELECT id, type, status, ai_model, cost_usd, started_at, completed_at FROM workflow_executions ORDER BY created_at DESC LIMIT 5;"
```

### 테스트 2: 기타 Webhooks (큐잉만 - 아직 AI 처리 없음)

```bash
# Jira webhook
curl -X POST http://localhost:4000/webhooks/jira \
  -H "Content-Type: application/json" \
  -d '{"issue_key": "PROJ-123", "event_type": "issue_created"}'

# GitHub webhook
curl -X POST http://localhost:4000/webhooks/github \
  -H "Content-Type: application/json" \
  -d '{"action": "opened", "pull_request": {"number": 42}}'

# Datadog webhook
curl -X POST http://localhost:4000/webhooks/datadog \
  -H "Content-Type: application/json" \
  -d '{"alert_id": "12345", "alert_name": "High CPU Usage"}'
```

## 아키텍처 개요

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   Webhook   │─────▶│  Webhook         │─────▶│   BullMQ    │
│  (Figma)    │      │  Listener :4000  │      │   (Redis)   │
└─────────────┘      └──────────────────┘      └─────────────┘
                                                      │
                                                      ▼
                     ┌──────────────────┐      ┌─────────────┐
                     │   Workflow       │◀─────│   Worker    │
                     │   Engine         │      │   Queue     │
                     └──────────────────┘      └─────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   PostgreSQL     │
                     │   :5433          │
                     └──────────────────┘
                              ▲
                              │
                     ┌──────────────────┐
                     │   AI Clients     │
                     │  (Anthropic/GPT) │
                     └──────────────────┘
```

## 서비스 포트

- **Webhook Listener**: http://localhost:4000
- **Workflow Engine Health**: http://localhost:3001/health
- **PostgreSQL**: localhost:5433
- **Redis**: localhost:6380
- **Dashboard** (시작 시): http://localhost:3000

## 문제 해결

### 컨테이너가 시작되지 않음
```bash
# 오류 로그 확인
docker-compose -f docker-compose.test.yml logs

# 처음부터 다시 빌드
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d --build
```

### AI 워크플로우가 인증 오류로 실패
- **원인**: `.env`에 `ANTHROPIC_API_KEY`가 없거나 유효하지 않음
- **해결**: `.env`에 실제 Anthropic API 키를 추가하고 재시작:
  ```bash
  docker-compose -f docker-compose.test.yml restart workflow-engine
  ```

### Redis 퇴출 정책 경고
- **원인**: Redis 설정 문제 (최신 버전에서 수정됨)
- **해결**: Redis 컨테이너 재빌드:
  ```bash
  docker-compose -f docker-compose.test.yml up -d --build redis
  ```

### 데이터베이스 연결 오류
```bash
# PostgreSQL이 준비되었는지 확인
docker exec rtb-postgres pg_isready -U postgres

# 데이터베이스 수동 확인
docker exec rtb-postgres psql -U postgres -d rtb_ai_hub -c "\dt"
```

### Webhook listener가 500 반환
```bash
# webhook listener 로그 확인
docker-compose -f docker-compose.test.yml logs webhook-listener

# Redis 접근 가능 여부 확인
docker exec rtb-webhook-listener ping -c 3 redis
```

## 데이터베이스 스키마

### workflow_executions
실행 이력 및 AI 사용량 저장:
- `id`: 고유 실행 ID
- `type`: 워크플로우 타입 (예: "figma-to-jira")
- `status`: "pending", "running", "completed", "failed"
- `ai_model`: 사용된 AI 모델 (예: "claude-opus")
- `cost_usd`: USD로 추정된 비용
- `tokens_input/output`: 토큰 사용량
- `duration`: 실행 시간 (밀리초)

### 쿼리 예제

```sql
-- 최근 워크플로우 실행
SELECT id, type, status, ai_model, cost_usd, duration 
FROM workflow_executions 
ORDER BY created_at DESC 
LIMIT 10;

-- 워크플로우 타입별 총 AI 비용
SELECT type, COUNT(*) as executions, SUM(cost_usd) as total_cost
FROM workflow_executions
WHERE status = 'completed'
GROUP BY type;

-- 워크플로우별 평균 실행 시간
SELECT type, AVG(duration) as avg_ms, MAX(duration) as max_ms
FROM workflow_executions
WHERE status = 'completed'
GROUP BY type;
```

## 개발 모드

Docker 없이 서비스를 로컬에서 실행하려면:

```bash
# 의존성 설치
npm install

# shared 패키지 빌드
cd packages/shared && npm run build && cd ../..

# 터미널 1: Webhook Listener
cd packages/webhook-listener
npm run dev

# 터미널 2: Workflow Engine
cd packages/workflow-engine
npm run dev

# 터미널 3: Dashboard (향후)
cd packages/dashboard
npm run dev
```

**참고**: PostgreSQL과 Redis가 로컬에서 실행 중이어야 합니다:
```bash
docker-compose -f docker-compose.test.yml up -d postgres redis
```

## 모니터링 및 관찰 가능성

### 실시간 로그 확인
```bash
# 모든 서비스
docker-compose -f docker-compose.test.yml logs -f

# 특정 서비스
docker-compose -f docker-compose.test.yml logs -f workflow-engine

# grep 필터로 추적
docker-compose -f docker-compose.test.yml logs -f | grep ERROR
```

### 헬스 체크
```bash
# Webhook listener
curl http://localhost:4000/health

# Workflow engine
curl http://localhost:3001/health
```

### Redis 큐 모니터링
```bash
docker exec rtb-redis redis-cli INFO keyspace
docker exec rtb-redis redis-cli KEYS "bull:*"
```

## 프로덕션 배포

프로덕션 환경에서는:
1. `docker-compose.yml` 사용 (`docker-compose.test.yml`이 아님)
2. `NODE_ENV=production` 설정
3. API 키는 비밀 관리 도구 사용 (AWS Secrets Manager, Vault)
4. 적절한 로그 집계 구성
5. 모니터링 설정 (Datadog, Prometheus)
6. 외부 엔드포인트에 SSL/TLS 활성화
7. 관리형 PostgreSQL 및 Redis 사용 (RDS, ElastiCache)

## 다음 단계

1. ✅ **현재**: AI 분석을 포함한 Figma→Jira 워크플로우
2. **2단계**: 나머지 워크플로우 구현:
   - Jira 자동 개발 (티켓에서 코드 자동 생성)
   - 자동 리뷰 (PR에 대한 AI 코드 리뷰)
   - 배포 모니터링
   - 인시던트→Jira 자동화
3. **3단계**: 실시간 메트릭이 있는 대시보드 UI
4. **4단계**: MCP 서버 통합 (Jira, GitHub, Figma API)

## 지원

문제나 질문이 있는 경우:
1. 로그 확인: `docker-compose -f docker-compose.test.yml logs`
2. 이 설정 가이드 검토
3. 아키텍처 세부사항은 주 README.md 확인
4. `.env`에 API 키가 올바르게 설정되었는지 확인
