# Docker OpenCode 통합 가이드

RTB AI Hub에서 OpenCode를 Docker로 실행하는 방법입니다.

## 🎯 3가지 실행 모드

### 모드 1: OpenCode 없이 실행 (기본) ⚡

가장 빠르고 간단한 방식. 기존 Claude API 직접 호출을 사용합니다.

```bash
# 기본 서비스만 실행
docker-compose -f docker-compose.test.yml up -d

# 서비스 확인
docker-compose -f docker-compose.test.yml ps
```

**언제 사용:**

- 빠른 로컬 개발
- OpenCode 기능이 필요 없을 때
- CI/CD 파이프라인

### 모드 2: OpenCode Mock 서버 사용 🐳

OpenCode API 인터페이스를 제공하는 Mock 서버를 Docker로 실행합니다.

```bash
# OpenCode Mock 포함하여 모든 서비스 실행
docker-compose -f docker-compose.test.yml --profile opencode up -d

# 또는 OpenCode만 추가 실행
docker-compose -f docker-compose.test.yml up -d  # 기본 서비스 먼저
docker-compose -f docker-compose.test.yml up opencode -d  # OpenCode 추가

# 상태 확인
curl http://localhost:3333/health
```

**언제 사용:**

- OpenCode API 인터페이스 테스트
- Docker 환경에서 완전한 통합 테스트
- 실제 OpenCode 없이 개발

**Mock 서버 특징:**

- ✅ OpenCode API 호환 인터페이스
- ✅ Claude API 직접 호출
- ❌ Oh-My-OpenCode 에이전트 미지원
- ❌ MCP tool 자동 연결 미지원

### 모드 3: 로컬 실제 OpenCode 연동 🚀

호스트에서 실제 OpenCode를 실행하고 Docker 서비스와 연동합니다.

**Step 1: 환경변수 설정**

```bash
# .env.ai 또는 .env.local
OPENCODE_API_URL=http://host.docker.internal:3333
```

**Step 2: 로컬에서 OpenCode 실행**

```bash
# 실제 OpenCode 서버 실행 (가상 명령어)
opencode serve --port 3333 --api-mode

# 또는 OpenCode가 npm 패키지인 경우
npx opencode serve --port 3333
```

**Step 3: Docker 서비스 시작**

```bash
# OpenCode 프로필 없이 실행 (호스트 OpenCode 사용)
docker-compose -f docker-compose.test.yml up -d

# workflow-engine이 host.docker.internal:3333으로 접근
```

**언제 사용:**

- 실제 Oh-My-OpenCode 에이전트 활용
- OpenCode 디버깅 및 개발
- 최대 기능 활용

---

## 📦 서비스 구성

### OpenCode 프로필 포함 시

```
docker-compose -f docker-compose.test.yml --profile opencode ps
```

| 서비스           | 포트     | 설명                    |
| ---------------- | -------- | ----------------------- |
| postgres         | 5432     | PostgreSQL 데이터베이스 |
| redis            | 6379     | Redis (Queue + Cache)   |
| auth-service     | 4001     | 인증 서비스             |
| webhook-listener | 4000     | Webhook API             |
| workflow-engine  | 3001     | 워크플로우 실행 엔진    |
| dashboard        | 3000     | React 대시보드          |
| **opencode**     | **3333** | **OpenCode Mock 서버**  |

---

## 🔧 OpenCode Mock 서버 관리

### 로그 확인

```bash
# 실시간 로그
docker-compose -f docker-compose.test.yml logs -f opencode

# 최근 100줄
docker-compose -f docker-compose.test.yml logs --tail=100 opencode
```

### 재시작

```bash
# OpenCode만 재시작
docker-compose -f docker-compose.test.yml restart opencode

# 재빌드 후 시작
docker-compose -f docker-compose.test.yml up -d --build opencode
```

### 중지/제거

```bash
# OpenCode만 중지
docker-compose -f docker-compose.test.yml stop opencode

# OpenCode 컨테이너 제거
docker-compose -f docker-compose.test.yml rm -f opencode

# 전체 중지
docker-compose -f docker-compose.test.yml down
```

---

## 🧪 테스트

### OpenCode Mock 서버 테스트

```bash
# Health check
curl http://localhost:3333/health

# Task 실행 (동기)
curl -X POST http://localhost:3333/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "description": "Test task",
    "prompt": "Say hello",
    "run_in_background": false
  }'

# Task 실행 (비동기)
curl -X POST http://localhost:3333/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "description": "Test task",
    "prompt": "Say hello",
    "run_in_background": true
  }'

# Task 상태 확인
curl http://localhost:3333/api/task/{task_id}
```

### workflow-engine에서 OpenCode 호출 테스트

```bash
# Jira 웹훅 트리거 (OpenCode 워크플로우 사용)
curl -X POST http://localhost:4000/webhooks/jira \
  -H "Content-Type: application/json" \
  -d '{
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "summary": "Test OpenCode integration",
        "description": "Testing OpenCode workflow"
      }
    }
  }'

# 워크플로우 로그 확인
docker-compose -f docker-compose.test.yml logs -f workflow-engine
```

---

## ⚙️ 환경변수

### OpenCode Mock 서버

| 변수                | 설명                 | 기본값             |
| ------------------- | -------------------- | ------------------ |
| `PORT`              | 서버 포트            | 3333               |
| `ANTHROPIC_API_KEY` | Claude API 키 (필수) | `.env.ai`에서 로드 |
| `NODE_ENV`          | 환경                 | development        |

### workflow-engine

| 변수               | 설명                    | 기본값                               |
| ------------------ | ----------------------- | ------------------------------------ |
| `OPENCODE_API_URL` | OpenCode API URL        | `http://opencode:3333` (Docker 내부) |
| `OPENCODE_API_KEY` | OpenCode API Key (선택) | -                                    |

---

## 🐛 문제 해결

### OpenCode 연결 실패

**증상:**

```
Error: connect ECONNREFUSED 172.18.0.7:3333
```

**해결:**

```bash
# 1. OpenCode가 실행 중인지 확인
docker-compose -f docker-compose.test.yml ps opencode

# 2. Health check
curl http://localhost:3333/health

# 3. 네트워크 확인
docker network inspect rtb-ai-hub_rtb-network

# 4. OpenCode 로그 확인
docker-compose -f docker-compose.test.yml logs opencode
```

### Claude API 키 미설정

**증상:**

```json
{
  "status": "ok",
  "anthropic_configured": false
}
```

**해결:**

```bash
# .env.ai 파일 확인
cat .env.ai | grep ANTHROPIC_API_KEY

# 환경변수 설정 후 재시작
docker-compose -f docker-compose.test.yml --profile opencode restart opencode
```

### 포트 충돌

**증상:**

```
Error: port 3333 is already allocated
```

**해결:**

```bash
# 1. 사용 중인 프로세스 확인
lsof -i :3333

# 2. docker-compose.test.yml 수정
# ports:
#   - '3334:3333'  # 다른 포트 매핑

# 3. .env.ai 업데이트
# OPENCODE_API_URL=http://localhost:3334
```

---

## 📊 성능 비교

| 모드     | 시작 시간 | 메모리 | AI 품질    | Oh-My-OpenCode |
| -------- | --------- | ------ | ---------- | -------------- |
| **없음** | 10초      | 500MB  | ⭐⭐⭐     | ❌             |
| **Mock** | 15초      | 650MB  | ⭐⭐⭐     | ❌             |
| **실제** | 20초+     | 800MB+ | ⭐⭐⭐⭐⭐ | ✅             |

---

## 🚀 프로덕션 배포

프로덕션 환경에서는 **실제 OpenCode**를 사용하는 것을 권장합니다:

1. **OpenCode Docker 이미지 준비**

```dockerfile
# docker-compose.yml
opencode:
  image: your-registry/opencode:latest
  environment:
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
  networks:
    - rtb-network
```

2. **환경변수 설정**

```bash
# .env.ai (프로덕션)
OPENCODE_API_URL=http://opencode:3333
```

3. **배포**

```bash
docker-compose up -d
```

---

## 📚 관련 문서

- [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) - OpenCode 통합 가이드
- [services/opencode-server/README.md](./services/opencode-server/README.md) - Mock 서버 세부사항
- [ENV_SETUP.md](./ENV_SETUP.md) - 환경변수 설정
