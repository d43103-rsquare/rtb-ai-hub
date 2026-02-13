# OpenCode Docker 설정 가이드

이 가이드는 Docker 환경에서 OpenCode CLI와 OpenCode Server를 함께 실행하는 방법을 설명합니다.

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  RTB AI Hub - OpenCode Integration (Docker)                 │
└─────────────────────────────────────────────────────────────┘

    Jira Webhook
         │
         ▼
  ┌──────────────┐
  │ Webhook      │
  │ Listener     │ :4000
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ BullMQ       │
  │ Queue        │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐         ┌────────────────┐
  │ Workflow     │ ─────→  │ OpenCode       │
  │ Engine       │ :3001   │ Server         │ :3333
  └──────────────┘         └────────┬───────┘
                                    │
                                    ▼
                           ┌────────────────┐
                           │ OpenCode CLI   │
                           │ (with OMO)     │ :4096
                           └────────┬───────┘
                                    │
                                    ├─→ Anthropic API
                                    ├─→ MCP Servers
                                    └─→ Plugins
```

## 📦 컨테이너 구성

| 컨테이너              | 이미지                                | 포트 | 역할              |
| --------------------- | ------------------------------------- | ---- | ----------------- |
| `rtb-opencode-cli`    | `ghcr.io/opencode-ai/opencode:latest` | 4096 | OpenCode CLI 서버 |
| `rtb-opencode-server` | 로컬 빌드                             | 3333 | OpenCode API 래퍼 |

## 🚀 실행 방법

### 1. 기본 실행 (OpenCode 없이)

```bash
# PostgreSQL + Redis만 실행
docker-compose -f docker-compose.test.yml up -d postgres redis

# 로컬에서 서비스 실행
pnpm dev:auth
pnpm dev:webhook
pnpm dev:workflow
```

### 2. OpenCode 포함 실행

```bash
# OpenCode CLI + OpenCode Server 포함
docker-compose -f docker-compose.test.yml --profile opencode up -d

# 상태 확인
docker-compose -f docker-compose.test.yml ps

# 로그 확인
docker-compose -f docker-compose.test.yml logs -f opencode-cli
docker-compose -f docker-compose.test.yml logs -f opencode-server
```

### 3. OpenCode 연결 확인

```bash
# OpenCode CLI Health Check
curl http://localhost:4096/health

# OpenCode Server Health Check
curl http://localhost:3333/health
# 예상 응답: {"status":"ok","server":"opencode-sdk","opencode_cli_url":"http://opencode-cli:4096","opencode_connected":true}
```

## ⚙️ 설정 파일 구조

```
infrastructure/opencode/
├── opencode.json            # OpenCode CLI 메인 설정
├── oh-my-opencode.json      # Oh-My-OpenCode 에이전트 설정
├── README.md                # 설정 커스터마이징 가이드
└── DOCKER_SETUP.md          # 본 문서
```

### 볼륨 마운트

```yaml
volumes:
  # 설정 파일 (읽기 전용)
  - ./infrastructure/opencode:/root/.config/opencode:ro

  # 데이터 (세션, 캐시 - 영구 저장)
  - opencode-data:/root/.opencode/data
```

**설정 파일 우선순위**:

1. 마운트된 설정: `./infrastructure/opencode/*.json`
2. 환경변수: `ANTHROPIC_API_KEY` (docker-compose.yml에서 주입)
3. 기본값: OpenCode CLI 내장 기본 설정

## 🔧 커스터마이징

### 1. 에이전트 모델 변경

`infrastructure/opencode/oh-my-opencode.json` 수정:

```json
{
  "agents": {
    "sisyphus": {
      "model": "anthropic/claude-haiku-4-5", // 빠르고 저렴하게 변경
      "variant": "default"
    }
  }
}
```

변경 후:

```bash
docker-compose -f docker-compose.test.yml restart opencode-cli
```

### 2. MCP 서버 추가

`infrastructure/opencode/opencode.json` 수정:

```json
{
  "mcp": {
    "your-custom-mcp": {
      "type": "local",
      "command": ["npx", "-y", "your-mcp-server@latest"]
    }
  }
}
```

> **참고**: 공식 MCP 서버(GitHub, Jira, Figma, Datadog)는 이미 `opencode.json`에 설정되어 있습니다. Docker 컨테이너 없이 npx/Remote HTTP로 직접 연결됩니다.

### 3. Anthropic API 키 설정

```bash
# .env.ai 파일 수정
ANTHROPIC_API_KEY=sk-ant-your-real-key

# 재시작
docker-compose -f docker-compose.test.yml --profile opencode restart
```

## 📊 리소스 사용량

| 컨테이너        | CPU  | 메모리 | 디스크 |
| --------------- | ---- | ------ | ------ |
| opencode-cli    | ~20% | ~512MB | ~100MB |
| opencode-server | ~5%  | ~128MB | ~50MB  |

**최소 요구사항**: 4GB RAM, 2 CPU cores

## 🐛 문제 해결

### OpenCode CLI 시작 실패

```bash
# 로그 확인
docker-compose -f docker-compose.test.yml logs opencode-cli

# 일반적인 원인:
# 1. ANTHROPIC_API_KEY 미설정
# 2. 포트 4096 이미 사용 중
# 3. 설정 파일 JSON 문법 오류

# 해결:
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml --profile opencode up -d
```

### OpenCode Server 연결 실패

```bash
# Health Check
curl http://localhost:3333/health

# opencode_connected: false인 경우
docker-compose -f docker-compose.test.yml restart opencode-cli
docker-compose -f docker-compose.test.yml restart opencode-server
```

### 설정 파일 적용 안 됨

```bash
# 설정 파일 내용 확인
docker-compose -f docker-compose.test.yml exec opencode-cli \
  cat /root/.config/opencode/opencode.json

# 볼륨 마운트 확인
docker-compose -f docker-compose.test.yml exec opencode-cli \
  ls -la /root/.config/opencode/
```

### 컨테이너 재빌드

```bash
# OpenCode Server 재빌드
docker-compose -f docker-compose.test.yml build opencode-server

# 이미지 캐시 삭제 후 재빌드
docker-compose -f docker-compose.test.yml build --no-cache opencode-server
```

## 📝 로컬 개발 vs Docker

| 항목            | 로컬 개발             | Docker                       |
| --------------- | --------------------- | ---------------------------- |
| **설정**        | `~/.config/opencode/` | `./infrastructure/opencode/` |
| **API 키**      | Shell 환경변수        | `.env.ai` → docker-compose   |
| **세션 데이터** | `~/.opencode/data/`   | `opencode-data` 볼륨         |
| **MCP 연결**    | 로컬 경로 가능        | HTTP/Docker 네트워크만       |
| **Hot Reload**  | ✅ 가능               | ❌ 컨테이너 재시작 필요      |

## 🚀 프로덕션 배포

### 환경변수 분리

```yaml
# docker-compose.prod.yml
services:
  opencode-cli:
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY} # 외부 시크릿 관리
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
```

### 영구 볼륨 백업

```bash
# 세션 데이터 백업
docker run --rm \
  -v rtb-ai-hub_opencode-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/opencode-data-$(date +%Y%m%d).tar.gz -C /data .
```

### 헬스 체크 커스터마이징

```yaml
healthcheck:
  test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:4096/health']
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 30s # OpenCode 플러그인 로딩 대기
```

## 📚 참고 문서

- [OpenCode 공식 문서](https://opencode.ai/docs)
- [Oh-My-OpenCode GitHub](https://github.com/code-yeongyu/oh-my-opencode)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [RTB AI Hub OpenCode Integration](../../OPENCODE_SDK_INTEGRATION.md)

---

**작성일**: 2026-02-09  
**버전**: RTB AI Hub v2.0 + OpenCode SDK v1.1.49
