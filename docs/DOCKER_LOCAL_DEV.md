# Docker 기반 로컬 개발 가이드

Docker를 사용하여 로컬 개발 환경의 인프라(PostgreSQL, Redis, OpenClaw Gateway)를 관리하고, 애플리케이션 서비스는 로컬에서 실행하여 hot reload를 지원하는 개발 환경 설정 가이드입니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Docker Containers                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ PostgreSQL  │  │    Redis    │  │ OpenClaw Gateway│ │
│  │   :5432     │  │   :6379     │  │    :3000        │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
└─────────┼────────────────┼──────────────────┼──────────┘
          │                │                  │
          └────────────────┼──────────────────┘
                           │ host.docker.internal
┌──────────────────────────┼──────────────────────────────┐
│  Local Machine           │                              │
│  ┌───────────────────────┼──────────────────────────┐  │
│  │  Application Services │                          │  │
│  │  - Auth Service (:4001)                          │  │
│  │  - Webhook Listener (:4000)                      │  │
│  │  - Workflow Engine (:3001)                       │  │
│  │  - Dashboard (:5173)                             │  │
│  └───────────────────────┴──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 장점

1. **일관된 인프라**: 팀 전체가 동일한 DB 버전 사용
2. **간편한 설정**: PostgreSQL, Redis, OpenClaw 자동 설정
3. **Hot Reload 유지**: 애플리케이션 코드 수정 시 즉시 반영
4. **데이터 영속성**: Docker 볼륨으로 DB 데이터 유지
5. **격리**: 로컬 시스템에 직접 설치하지 않음

## 빠른 시작

### 1. 초기 설정

```bash
# 환경 설정 파일 생성
./scripts/dev-docker.sh setup

# .env.local 파일을 편집하여 API 키 추가
nano .env.local
```

### 2. Docker 인프라 시작

```bash
# 모든 Docker 서비스 시작
./scripts/dev-docker.sh start

# 또는 직접 docker-compose 사용
docker-compose -f docker-compose.dev.yml --env-file .env.local up -d
```

### 3. 애플리케이션 서비스 시작 (로컬)

별도 터미널에서 각각 실행:

```bash
# 터미널 1: Webhook Listener
pnpm dev:webhook

# 터미널 2: Workflow Engine
pnpm dev:workflow

# 터미널 3: Dashboard
pnpm dev:dashboard

# 터미널 4: Auth Service (필요시)
pnpm dev:auth
```

### 4. 상태 확인

```bash
# 모든 서비스 상태 확인
./scripts/dev-docker.sh status

# 특정 서비스 로그 확인
./scripts/dev-docker.sh logs openclaw
./scripts/dev-docker.sh logs postgres
./scripts/dev-docker.sh logs redis
```

## 환경 변수 설정

### .env.local 템플릿

```bash
# Database (Docker)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rtb_ai_hub
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

REDIS_HOST=localhost
REDIS_PORT=6379

# Application (Local)
WEBHOOK_PORT=4000
AUTH_SERVICE_PORT=4001
DASHBOARD_PORT=5173

# OpenClaw (Docker)
OPENCLAW_GATEWAY_URL=http://localhost:3000
OPENCLAW_HOOKS_TOKEN=rtb-ai-hub-openclaw-hooks-token-2026

# RTB Hub 연동 (Docker → Local)
# OpenClaw가 Docker 낸에서 로컬 서비스에 접근할 때 사용
RTB_HUB_WEBHOOK_URL=http://host.docker.internal:4000/webhooks/openclaw
RTB_HUB_API_URL=http://host.docker.internal:4000

# Slack (필수)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# AI (필수)
ANTHROPIC_API_KEY=sk-ant-your-key
```

## 주요 명령어

### Docker 인프라 관리

```bash
# 시작
./scripts/dev-docker.sh start

# 중지
./scripts/dev-docker.sh stop

# 재시작
./scripts/dev-docker.sh restart

# 상태 확인
./scripts/dev-docker.sh status

# 로그 확인
./scripts/dev-docker.sh logs              # 모든 서비스
./scripts/dev-docker.sh logs openclaw     # OpenClaw만
./scripts/dev-docker.sh logs postgres     # PostgreSQL만
./scripts/dev-docker.sh logs redis        # Redis만

# 전체 초기화 (데이터 삭제)
./scripts/dev-docker.sh cleanup
```

### 애플리케이션 서비스 (로컬)

```bash
# 개별 시작
pnpm dev:auth        # Auth Service (:4001)
pnpm dev:webhook     # Webhook Listener (:4000)
pnpm dev:workflow    # Workflow Engine (:3001)
pnpm dev:dashboard   # Dashboard (:5173)

# 또는 전체 한번에 (pnpm parallel)
pnpm dev             # 모든 서비스 동시 시작
```

## 네트워크 연결

### Local → Docker

로컬 서비스에서 Docker 컨테이너 접근:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- OpenClaw: `http://localhost:3000`

### Docker → Local

Docker 컨테이너에서 로컬 서비스 접근:

- Webhook Listener: `http://host.docker.internal:4000`
- RTB Hub API: `http://host.docker.internal:4000`

**주요**: OpenClaw Gateway가 RTB Hub에 webhook을 별낼 때 `host.docker.internal`을 사용해야 합니다.

## 문제 해결

### OpenClaw가 RTB Hub에 연결되지 않음

**증상**: OpenClaw 로그에 connection refused 오류

**해결**:

```bash
# .env.local 확인
RTB_HUB_WEBHOOK_URL=http://host.docker.internal:4000/webhooks/openclaw

# webhook-listener가 로컬에서 실행 중인지 확인
curl http://localhost:4000/health
```

### PostgreSQL 연결 실패

**증상**: 로컬 앱에서 DB 연결 오류

**해결**:

```bash
# PostgreSQL 상태 확인
./scripts/dev-docker.sh status

# PostgreSQL 로그 확인
./scripts/dev-docker.sh logs postgres

# 직접 연결 테스트
psql -h localhost -U postgres -d rtb_ai_hub
```

### 포트 충돌

**증상**: Address already in use 오류

**해결**:

```bash
# 사용 중인 포트 확인
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :3000  # OpenClaw
lsof -i :4000  # Webhook

# .env.local에서 포트 변경
POSTGRES_PORT=5433
REDIS_PORT=6380
OPENCLAW_GATEWAY_PORT=3001
```

### 데이터 초기화

```bash
# 모든 Docker 데이터 삭제 (주의: DB 데이터도 삭제됨)
./scripts/dev-docker.sh cleanup

# 특정 서비스만 재시작
docker-compose -f docker-compose.dev.yml restart openclaw-gateway
```

## 고급 설정

### Docker Compose 직접 사용

```bash
# 서비스별 시작
docker-compose -f docker-compose.dev.yml up -d postgres redis
docker-compose -f docker-compose.dev.yml up -d openclaw-gateway

# 스케일 조정 (OpenClaw 2개 인스턴스)
docker-compose -f docker-compose.dev.yml up -d --scale openclaw-gateway=2

# 특정 서비스 로그
docker-compose -f docker-compose.dev.yml logs -f openclaw-gateway
```

### 볼륨 관리

```bash
# 볼륨 목록
docker volume ls | grep rtb

# 볼륨 백업
docker run --rm -v rtb-ai-hub_postgres-dev-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# 볼륨 복원
docker run --rm -v rtb-ai-hub_postgres-dev-data:/data -v $(pwd):/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/postgres-backup.tar.gz -C /data"
```

## 성능 최적화

### macOS에서 빠른 파일 동기화

Docker Desktop → Settings → Resources → File sharing:

- 프로젝트 경로 추가
- `:delegated` 플래그 사용

### 메모리 할당

Docker Desktop → Settings → Resources:

- Memory: 4GB 이상 권장
- CPUs: 2 이상 권장

## CI/CD와의 일관성

이 Docker 설정은 CI/CD 환경(`docker-compose.test.yml`)과 유사한 구조를 가집니다:

- 동일한 PostgreSQL/Redis 버전
- 동일한 환경 변수 구조
- OpenClaw Gateway 포함

## 다음 단계

1. **설정 완료**: `./scripts/dev-docker.sh setup` 실행
2. **인프라 시작**: `./scripts/dev-docker.sh start` 실행
3. **앱 실행**: `pnpm dev:webhook`, `pnpm dev:workflow` 등 실행
4. **테스트**: `./scripts/validate-integration.sh`로 검증

## 참고 문서

- [기본 README](../README.md)
- [OpenClaw 설정](../infrastructure/openclaw/SETUP.md)
- [통합 테스트](../tests/integration/README.md)
- [E2E 테스트](../tests/integration/E2E_TESTING.md)
