# OpenCode Server

OpenCode SDK를 사용하여 **실제 OpenCode CLI** 및 **Oh-My-OpenCode 에이전트**와 통합된 API 서버입니다.

## 🎯 목적

- OpenCode API 호환 인터페이스 제공
- **Oh-My-OpenCode 전문 에이전트** 활용 (librarian, oracle, explorer 등)
- RTB AI Hub 워크플로우와 OpenCode 생태계 연결

## 📦 API Endpoints

### POST /api/task

Task를 실행합니다.

**Request:**

```json
{
  "subagent_type": "librarian",
  "description": "Search React hooks documentation",
  "prompt": "Find official React hooks usage examples and best practices",
  "run_in_background": false
}
```

**Supported Agents** (`subagent_type`):

- `sisyphus` (기본값): 범용 작업 실행
- `librarian`: 외부 문서 검색
- `oracle`: 아키텍처 자문
- `explorer`: 내부 코드베이스 탐색
- `metis`: 요구사항 명확화
- `momus`: 작업 계획 검토

**Response (Sync):**

```json
{
  "session_id": "uuid",
  "status": "completed",
  "result": "AI response..."
}
```

**Response (Async):**

```json
{
  "task_id": "uuid",
  "session_id": "uuid",
  "status": "pending"
}
```

### GET /api/task/:id

Task 상태를 확인합니다.

**Response:**

```json
{
  "task_id": "uuid",
  "session_id": "uuid",
  "status": "completed",
  "result": "AI response...",
  "error": null
}
```

### GET /health

서버 상태를 확인합니다.

**Response:**

```json
{
  "status": "ok",
  "server": "opencode-sdk",
  "opencode_cli_url": "http://localhost:4096",
  "opencode_connected": true
}
```

## 🚀 사용 방법

### 로컬 개발

**1단계: OpenCode CLI 시작**

```bash
# OpenCode CLI를 서버 모드로 실행
opencode serve --port 4096
```

**2단계: OpenCode Server 실행**

```bash
cd services/opencode-server
npm install
npm run build

# 환경변수 설정
export OPENCODE_CLI_URL=http://localhost:4096
export PORT=3333

# 실행
npm start

# 또는 개발 모드 (hot reload)
npm run dev
```

### Docker (profiles 사용)

```bash
# OpenCode 서버 포함하여 실행
docker-compose -f docker-compose.test.yml --profile opencode up -d

# 또는 OpenCode만 실행
docker-compose -f docker-compose.test.yml up opencode -d

# 상태 확인
curl http://localhost:3333/health
```

## ⚙️ 환경변수

| 변수               | 설명                          | 기본값                |
| ------------------ | ----------------------------- | --------------------- |
| `PORT`             | 서버 포트                     | 3333                  |
| `OPENCODE_CLI_URL` | OpenCode CLI 서버 주소 (필수) | http://localhost:4096 |
| `NODE_ENV`         | 환경 (development/production) | development           |

## 🔧 개발

### 빌드

```bash
npm run build
```

### 타입 체크

```bash
npm run typecheck
```

## ✅ 주요 기능

- ✅ **실제 OpenCode SDK** 사용 (`@opencode-ai/sdk`)
- ✅ **Oh-My-OpenCode 에이전트** 지원 (librarian, oracle, explorer 등)
- ✅ **Session 관리**: OpenCode 세션과 RTB Task 매핑
- ✅ **동기/비동기** 실행 모드 지원

## 📋 사전 요구사항

**필수**:

- OpenCode CLI 설치 (`brew install opencode` 또는 공식 설치 방법)
- OpenCode CLI가 서버 모드로 실행 중 (`opencode serve --port 4096`)

**선택사항**:

- Oh-My-OpenCode 플러그인 설치 (고급 에이전트 사용 시)

## 🔄 Docker 배포

OpenCode CLI를 Docker 컨테이너로 실행:

```yaml
# docker-compose.yml
services:
  opencode-cli:
    image: your-opencode-image:latest
    ports:
      - '4096:4096'
    command: ['opencode', 'serve', '--port', '4096']
    volumes:
      - opencode-data:/root/.opencode

  opencode-server:
    build: ./services/opencode-server
    ports:
      - '3333:3333'
    environment:
      OPENCODE_CLI_URL: http://opencode-cli:4096
    depends_on:
      - opencode-cli
```

## 🐛 문제 해결

### OpenCode CLI 연결 실패

```bash
# Health 체크
curl http://localhost:3333/health

# opencode_connected: false인 경우
# 1. OpenCode CLI가 실행 중인지 확인
ps aux | grep opencode

# 2. OpenCode CLI 수동 시작
opencode serve --port 4096

# 3. 포트 확인
lsof -i :4096
```

### 포트 충돌

```bash
# 다른 포트 사용
PORT=3334 npm start
```

또는 docker-compose에서:

```yaml
ports:
  - '3334:3333'
```
