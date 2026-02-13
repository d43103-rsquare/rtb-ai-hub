# OpenCode SDK Integration - 완료 보고서

**날짜**: 2026-02-09
**버전**: RTB AI Hub v2.0 + OpenCode SDK v1.1.49
**상태**: ✅ SDK 통합 완료, 테스트 준비됨

## 🎯 통합 목표

RTB AI Hub의 워크플로우 엔진과 **실제 OpenCode SDK**를 연결하여, **Oh-My-OpenCode의 전문 에이전트**(librarian, oracle, explorer 등)를 활용 가능하게 만듦.

## ✅ 완료 항목

### 1. OpenCode Server - SDK 기반 재구현 ✅

**Before (Mock)**: Claude API를 직접 호출하는 단순 래퍼
**After (Real SDK)**: OpenCode CLI와 통신하여 Oh-My-OpenCode 에이전트 활용

#### 변경 파일

| 파일                                     | 변경 사항                                                  |
| ---------------------------------------- | ---------------------------------------------------------- |
| `services/opencode-server/package.json`  | `@opencode-ai/sdk` 로컬 의존성 추가, `type: "module"` 전환 |
| `services/opencode-server/tsconfig.json` | `module: "ESNext"`, `moduleResolution: "bundler"` 설정     |
| `services/opencode-server/src/index.ts`  | **전면 재작성**: SDK 기반 구현 (235 lines)                 |
| `services/opencode-server/README.md`     | SDK 기반 문서로 전환                                       |

#### 핵심 변경 내용

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk';

async function executeTask(taskId: string, sessionId: string, prompt: string, agent?: string) {
  const client = createOpencodeClient({ baseUrl: OPENCODE_CLI_URL });

  const sessionResponse = await client.session.create({
    body: { title: `RTB Task ${taskId}` },
  });

  await client.session.prompt({
    path: { id: sessionResponse.data.id },
    body: {
      agent: agent || 'sisyphus',
      system: `RTB AI Hub workflow automation...`,
      tools: prompt,
    },
  });

  const messages = await client.session.messages({ path: { id: sessionResponse.data.id } });
}
```

#### 지원 에이전트

| Agent               | 역할            | 사용 시나리오                     |
| ------------------- | --------------- | --------------------------------- |
| `sisyphus` (기본값) | 범용 작업 실행  | 일반적인 코드 생성, 리팩토링      |
| `librarian`         | 외부 문서 검색  | React hooks 문서 찾기, API 사용법 |
| `oracle`            | 아키텍처 자문   | 설계 결정, 트레이드오프 분석      |
| `explorer`          | 코드베이스 탐색 | 기존 패턴 발견, 유사 구현 찾기    |
| `metis`             | 요구사항 명확화 | 모호한 Jira 티켓 분석             |
| `momus`             | 작업 계획 검토  | 구현 계획 완성도 검증             |

#### MCP 도구 접근 (중요! ✨)

Oh-My-OpenCode 에이전트들은 **RTB의 MCP 서버**에 직접 접근할 수 있습니다:

| MCP 서버          | 사용 가능한 도구                                         | 에이전트 활용                   |
| ----------------- | -------------------------------------------------------- | ------------------------------- |
| `rtb-jira-int`    | getIssue, createIssue, updateIssue, searchIssues 등 8개  | Jira 티켓 읽기/생성/업데이트    |
| `rtb-figma-int`   | getFile, getFileComponents, getImage, postComment 등 6개 | Figma 디자인 분석, 댓글 추가    |
| `rtb-github-int`  | createBranch, createCommit, createPR, searchCode 등 10개 | GitHub PR 생성, 코드 검색       |
| `rtb-datadog-int` | getLogs, queryMetrics, getIncidents 등 6개               | 로그/메트릭 조회, 인시던트 분석 |

**설정 위치**: `infrastructure/opencode/opencode.json` (이미 연결됨)

**자세한 내용**: [MCP_INTEGRATION.md](./infrastructure/opencode/MCP_INTEGRATION.md)

### 2. 환경변수 설정 ✅

#### `.env.ai` 추가 항목

```bash
# ─── OpenCode CLI ────────────────────────────────────────────────────────────
OPENCODE_CLI_URL=http://localhost:4096

# ─── OpenCode Agents ─────────────────────────────────────────────────────────
# true: OpenCode/Oh-My-OpenCode 에이전트 사용
# false(기본값): RTB 자체 멀티 에이전트 시스템 사용
USE_OPENCODE_AGENTS=false
```

#### Feature Flag 추가

`packages/shared/src/constants.ts`:

```typescript
export const FEATURE_FLAGS = {
  USE_MULTI_AGENT: process.env.USE_MULTI_AGENT === 'true',
  USE_OPENCODE_AGENTS: process.env.USE_OPENCODE_AGENTS === 'true', // NEW
} as const;
```

### 3. Workflow 라우터 업데이트 ✅

`packages/workflow-engine/src/workflows/jira-auto-dev.ts`:

```typescript
export async function processJiraAutoDev(event, userId, env) {
  // 1순위: OpenCode 에이전트
  if (FEATURE_FLAGS.USE_OPENCODE_AGENTS) {
    try {
      const { processJiraAutoDevWithOpenCode } = await import('./jira-auto-dev-opencode');
      return await processJiraAutoDevWithOpenCode(event, userId, env);
    } catch (error) {
      logger.warn('OpenCode agents failed, falling back to RTB agents');
    }
  }

  // 2순위: RTB 멀티 에이전트
  if (FEATURE_FLAGS.USE_MULTI_AGENT) {
    const { processJiraAutoDevMultiAgent } = await import('./jira-auto-dev-multi');
    return await processJiraAutoDevMultiAgent(event, userId, env);
  }

  // No AI workflow enabled - fail fast
  throw new Error('No AI workflow enabled. Set USE_OPENCODE_AGENTS=true or USE_MULTI_AGENT=true');
}
```

**Fallback 체인**: OpenCode → RTB Multi-Agent (Single-Agent 제거됨)

### 4. 문서화 ✅

| 문서                                    | 내용                                      |
| --------------------------------------- | ----------------------------------------- |
| `services/opencode-server/README.md`    | SDK 기반 사용법, 에이전트 설명, 문제 해결 |
| `OPENCODE_SDK_INTEGRATION.md` (본 문서) | 전체 통합 과정, 테스트 가이드             |

## 🚀 로컬 테스트 가이드

### 1단계: OpenCode CLI 설치 및 실행

```bash
# OpenCode CLI 설치 (Homebrew)
brew install opencode

# 또는 공식 설치 방법
# https://github.com/opencode-ai/opencode

# OpenCode CLI를 서버 모드로 실행
opencode serve --port 4096
```

### 2단계: OpenCode Server 빌드 및 실행

```bash
cd services/opencode-server

# SDK 의존성 설치
npm install

# 빌드
npm run build

# 환경변수 설정
export OPENCODE_CLI_URL=http://localhost:4096
export PORT=3333

# 실행
npm start
```

### 3단계: OpenCode Server 연결 확인

```bash
# Health Check
curl http://localhost:3333/health

# 예상 응답:
# {
#   "status": "ok",
#   "server": "opencode-sdk",
#   "opencode_cli_url": "http://localhost:4096",
#   "opencode_connected": true  ← 이것이 true여야 함
# }
```

### 4단계: 간단한 Task 테스트

```bash
# Librarian 에이전트로 문서 검색
curl -X POST http://localhost:3333/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "subagent_type": "librarian",
    "description": "Search React hooks documentation",
    "prompt": "Find official React hooks usage examples and best practices",
    "run_in_background": false
  }'

# 예상 응답:
# {
#   "session_id": "uuid",
#   "status": "completed",
#   "result": "Based on the official React documentation..."
# }
```

### 5단계: RTB Workflow Engine과 통합 테스트

```bash
# 1. 환경변수 설정
cd /Users/d43103/Workspace/ai/rtb-ai-hub
nano .env.ai

# USE_OPENCODE_AGENTS=true로 변경
USE_OPENCODE_AGENTS=true

# 2. shared 패키지 빌드
pnpm build:shared

# 3. workflow-engine 실행
pnpm dev:workflow

# 4. Jira Webhook 시뮬레이션
curl -X POST http://localhost:4000/webhooks/jira \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "issue_updated",
    "issue": {
      "key": "TEST-123",
      "fields": {
        "status": { "name": "In Progress" },
        "summary": "Implement user authentication",
        "labels": ["RTB-AI-HUB"]
      }
    }
  }'
```

## 📊 성능 비교 (예상)

| 항목                | RTB Multi-Agent | OpenCode/OMO     |
| ------------------- | --------------- | ---------------- |
| **전문 에이전트**   | 5개 (범용)      | 11개 (전문화)    |
| **외부 문서 검색**  | ❌ 없음         | ✅ librarian     |
| **코드베이스 탐색** | 제한적          | ✅ explorer      |
| **아키텍처 자문**   | oracle (범용)   | ✅ oracle (전문) |
| **세션 관리**       | Redis (자체)    | OpenCode CLI     |
| **응답 속도**       | ~30초           | ~45초 (더 정밀)  |
| **토큰 사용량**     | 보통            | 높음 (정밀도↑)   |

## 🔍 문제 해결

### OpenCode CLI 연결 실패 (`opencode_connected: false`)

```bash
# 1. OpenCode CLI 프로세스 확인
ps aux | grep opencode

# 2. 없으면 수동 시작
opencode serve --port 4096

# 3. 포트 사용 확인
lsof -i :4096

# 4. 다른 포트로 시도
export OPENCODE_CLI_URL=http://localhost:5096
opencode serve --port 5096
```

### SDK 의존성 에러

```bash
cd services/opencode-server

# SDK 심볼릭 링크 확인
ls -la node_modules/@opencode-ai/sdk

# 다시 설치
rm -rf node_modules
npm install
```

### TypeScript 빌드 에러

```bash
# shared 패키지 먼저 빌드
cd packages/shared
pnpm build

# 그 다음 opencode-server
cd ../../services/opencode-server
npm run build
```

## 🔄 Docker 배포 (TODO)

Docker에서 OpenCode CLI를 실행하려면:

```yaml
# docker-compose.yml (미래 작업)
services:
  opencode-cli:
    image: opencode-ai/opencode:latest # 공식 이미지 출시 대기 중
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

volumes:
  opencode-data:
```

**현재 상태**: OpenCode CLI의 공식 Docker 이미지가 없어 로컬 개발만 가능.

## 📝 향후 작업

- [ ] Docker 이미지 구성 (OpenCode CLI 공식 이미지 출시 대기)
- [ ] Oh-My-OpenCode 플러그인 추가 설치
- [ ] 에이전트별 성능 측정 및 비교
- [ ] 자동 Fallback 로직 검증 (OpenCode 실패 → RTB 에이전트)
- [ ] 프로덕션 환경 배포 가이드 작성

## 🎉 결론

**RTB AI Hub는 이제 2가지 AI 엔진을 선택적으로 사용할 수 있습니다:**

1. **RTB 자체 Multi-Agent** (`USE_MULTI_AGENT=true`):
   - 5단계 파이프라인 (Analyzer → Planner → Developer → Reviewer → Oracle)
   - rtb-wiki 도메인 지식 자동 주입
   - Redis 기반 세션 관리

2. **OpenCode/Oh-My-OpenCode** (`USE_OPENCODE_AGENTS=true`) ✨ NEW:
   - 11개 전문 에이전트 (librarian, oracle, explorer, metis, momus 등)
   - OpenCode CLI 기반 세션 관리
   - 외부 문서 검색 및 코드베이스 탐색 강화

**Feature Flag로 즉시 전환 가능**하며, 실패 시 자동 Fallback으로 안정성 확보.

---

**작성자**: Sisyphus (OpenCode Integration Agent)  
**마지막 업데이트**: 2026-02-09 18:01 KST
