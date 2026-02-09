# RTB AI Hub

Figma 디자인 → Jira 티켓 → 자동 개발 → 코드 리뷰 → 배포 → 모니터링까지 전체 워크플로우를 자동화하는 AI 기반 자동화 허브입니다.

## 🎯 주요 기능

### 핵심 워크플로우

- **Figma → Jira**: AI가 분석한 컴포넌트 명세를 바탕으로 Figma 디자인에서 Jira Epic 및 하위 작업을 자동 생성합니다
- **Jira → 자동 개발**: Jira 티켓에서 AI 기반 코드 생성, GitHub PR을 자동으로 생성합니다
- **자동 리뷰**: 모든 Pull Request에 대한 AI 코드 리뷰
- **배포 모니터링**: AI 기반 이상 탐지를 통한 배포 후 모니터링
- **인시던트 대응**: Datadog P1 알림에서 근본 원인 분석과 함께 Jira 티켓 자동 생성

### 인증 및 운영

- **단일 AI 계정**: 환경변수(`ANTHROPIC_API_KEY`)로 공유 AI 키 운영
- **DEV_MODE**: 로컬 개발 시 `/auth/dev/login`으로 즉시 로그인 (Google OAuth 불필요)
- **Google Workspace OAuth**: 프로덕션 환경에서 회사 계정 기반 접근 제어
- **JWT-only 세션**: DB 의존 없는 JWT 기반 세션 관리
- **이메일 기반 Jira 매핑**: Google 인증 이메일로 Jira 사용자 자동 연결

## 🏗️ 아키텍처

```
┌────────────────────────────────────────────────────────┐
│  Users (Google Workspace / DEV_MODE)                   │
└────────────┬───────────────────────────────────────────┘
             │
             ▼
    ┌────────────────┐
    │ Auth Service   │  ← DEV_MODE: /auth/dev/login (auto-login)
    │  :4001         │  ← Production: Google OAuth + JWT
    └────────┬───────┘
             │
             ├──────────────────────────────────────┐
             │                                      │
             ▼                                      ▼
    ┌────────────────┐                    ┌────────────────┐
    │  PostgreSQL    │                    │     Redis      │
    │  (Users,       │                    │  (Queue)       │
    │   Executions,  │                    └────────────────┘
    │   Costs)       │                             ▲
    └────────┬───────┘                             │
             │                                     │
             │    ┌────────────────────────────────┘
             │    │
             ▼    ▼
┌─────────────────────────────────────────────────────────┐
│  Webhook Sources (Figma, Jira, GitHub, Datadog)        │
│  (?env=int/stg/prd or X-Env header)                    │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────┐
    │ Webhook        │ ← HMAC Signature Verification
    │ Listener :4000 │ ← Env routing (?env= or X-Env)
    └────────┬───────┘
             │
             ▼
    ┌────────────────┐
    │ BullMQ Queue   │ ← Job data includes env
    └────────┬───────┘
             │
             ▼
    ┌────────────────┐
    │ Workflow       │ ← Env-based AI key (ANTHROPIC_API_KEY)
    │ Engine         │ ← Tracks execution + costs
    └────────┬───────┘
             │
             ▼
    ┌────────────────────────────────────────────────────┐
    │  MCP Servers (per-env containers)                  │
    │  mcp-jira-int, mcp-jira-stg, mcp-figma-int, ...   │
    └────────┬───────────────────────────────────────────┘
             │
             ▼
    ┌────────────────┐
    │  Dashboard     │
    │   :3000        │
    └────────────────┘
```

## 🚀 빠른 시작

### 사전 요구사항

- Docker & Docker Compose
- Node.js 20+
- **pnpm 8+** (고속 패키지 관리자)
- **Google Cloud 계정** (OAuth용)
- API 키 (로그인 후 사용자별로 관리):
  - Anthropic Claude (AI 워크플로우용)
  - 선택사항: Jira, Figma, GitHub, Datadog OAuth 앱

> **💡 pnpm 설치**: `npm install -g pnpm` 또는 `corepack enable && corepack prepare pnpm@latest --activate`

### 설정

#### 1. 환경 설정

**자동 설정 (권장):**

```bash
./scripts/setup-env.sh
```

이 스크립트는 자동으로 카테고리별 환경변수 파일을 생성합니다:

- ✅ `.env.base` - 기본 설정 (포트, 인프라)
- ✅ `.env.auth` - 인증 관련 (Google OAuth, JWT)
- ✅ `.env.services` - 외부 서비스 (Jira, Figma, GitHub 등)
- ✅ `.env.ai` - AI 설정 (Anthropic, 멀티 에이전트)
- ✅ `.env.advanced` - 고급 기능 (선택사항)

**최소 설정** (DEV_MODE — Google OAuth 없이 즉시 사용):

```bash
# 1. .env.auth 편집
nano .env.auth

DEV_MODE=true
DEV_USER_EMAIL=your-email@company.com
DEV_USER_NAME=Your Name
JWT_SECRET=<generated-by-script>

# 2. .env.ai 편집
nano .env.ai

ANTHROPIC_API_KEY=sk-ant-your-key
```

> **프로덕션 환경**에서는 `DEV_MODE=false`로 설정하고 Google OAuth를 구성하세요.  
> 자세한 설정은 **[ENV_SETUP.md](./ENV_SETUP.md)** 및 **[AUTH_SETUP.md](./AUTH_SETUP.md)**를 참조하세요.

생성된 키를 `.env`에 복사하세요.

#### 2. Google OAuth 설정

자세한 Google Cloud Console 설정은 **[AUTH_SETUP.md](./AUTH_SETUP.md)**를 참조하세요.

간단한 버전:

1. [Google Cloud Console](https://console.cloud.google.com/)에서 OAuth 2.0 클라이언트 ID 생성
2. 리디렉션 URI 추가: `http://localhost:4001/auth/google/callback`
3. "내부" 앱으로 설정 (Workspace 사용자만)

#### 3. 환경 설정

```bash
cp .env.example .env
```

자격 증명으로 `.env`를 편집하세요:

```bash
# Google OAuth (필수)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
ALLOWED_WORKSPACE_DOMAINS=your-company.com

# 보안 키 (1단계에서 생성)
JWT_SECRET=<generated>
CREDENTIAL_ENCRYPTION_KEY=<generated>

# 데이터베이스 (Docker용 기본값)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
REDIS_HOST=redis
REDIS_PORT=6379

# Repository Configuration (선택사항)
# Wiki Repository - 읽기 전용 도메인 지식 참조
WIKI_REPO_URL=https://github.com/your-org/rtb-wiki.git
WIKI_LOCAL_PATH=/workspace/rtb-wiki

# Work Repository - 브랜치 생성, PR 등 작업용
WORK_REPO_URL=https://github.com/your-org/rtb-product.git
WORK_REPO_LOCAL_PATH=/workspace/rtb-product
WORK_REPO_DEFAULT_BRANCH=develop
```

**Repository 설정 설명:**

- **Wiki Repo** (읽기 전용): AI 에이전트가 참조할 도메인 지식 저장소. `pnpm dev` 실행 시 자동으로 클론되고 업데이트됩니다.
- **Work Repo** (읽기/쓰기): AI가 실제 코드 작업을 수행할 저장소. 브랜치 생성, 커밋, PR 생성 등에 사용됩니다.
- 설정하지 않으면 해당 기능이 비활성화되며, 기존 동작에는 영향이 없습니다.
- `pnpm dev` 실행 시 자동으로 클론/업데이트되므로 수동 설정 불필요합니다.

#### 2. 서비스 시작

**옵션 A: 통합 개발 환경 (권장)**

```bash
# 한 번에 모든 서비스 시작 (인프라 + repo 초기화 + 빌드 + 서비스)
pnpm dev
```

**실행 순서:**

1. Docker infra 시작 (PostgreSQL, Redis)
2. Git repo 초기화 (Wiki + Work repo 자동 클론/업데이트)
3. shared 패키지 빌드
4. 4개 서비스 동시 실행 (auth, webhook, workflow, dashboard)

**옵션 B: 개별 서비스 실행**

```bash
# 인프라만 시작
pnpm dev:infra

# Repo 초기화 (선택사항 - pnpm dev에 포함됨)
pnpm dev:init-repos

# 각 서비스를 별도 터미널에서 실행
pnpm dev:auth        # Auth :4001
pnpm dev:webhook     # Webhook :4000
pnpm dev:workflow    # Workflow Engine
pnpm dev:dashboard   # Dashboard :3000
```

**옵션 B: Docker (전체 스택)**

```bash
docker-compose -f docker-compose.test.yml up -d --build
```

#### 3. 로그인 테스트

DEV_MODE가 켜져 있으면 브라우저에서 바로 로그인:

```
http://localhost:4001/auth/dev/login
```

→ 자동으로 대시보드(`http://localhost:3000/dashboard`)로 리디렉트됩니다.

### 접근 포인트

- **대시보드**: http://localhost:3000
- **Auth Service**: http://localhost:4001
- **Webhook API**: http://localhost:4000
- **헬스 체크**:
  - Auth: http://localhost:4001/health
  - Webhook: http://localhost:4000/health

### 최초 사용자 설정

1. **로그인** (DEV_MODE):

```bash
# 브라우저에서 열기 — 자동 로그인 후 대시보드로 이동
open http://localhost:4001/auth/dev/login
```

2. **Webhook 테스트**:

```bash
curl -X POST http://localhost:4000/webhooks/figma \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "FILE_UPDATE",
    "file_key": "test123",
    "file_name": "My Design"
  }'
```

AI 워크플로우는 환경변수의 `ANTHROPIC_API_KEY`를 사용합니다.

## 📡 Webhook 엔드포인트 (멀티 환경 지원)

### Figma

```
POST http://localhost:4000/webhooks/figma?env=stg
Content-Type: application/json

{
  "event_type": "FILE_UPDATE",
  "file_key": "abc123",
  "file_name": "Design System"
}
```

**환경 지정**: `?env=int|stg|prd` (기본값: int) 또는 `X-Env` 헤더

### Jira

```
POST http://localhost:4000/webhooks/jira?env=stg
Content-Type: application/json

{
  "webhookEvent": "issue_updated",
  "issue": {
    "key": "PROJ-123",
    "fields": {
      "status": { "name": "In Progress" },
      "summary": "Implement login page"
    }
  }
}
```

**환경 지정**: `?env=int|stg|prd` (기본값: int) 또는 `X-Env` 헤더

### GitHub

```
POST http://localhost:4000/webhooks/github?env=stg
X-GitHub-Event: pull_request
Content-Type: application/json

{
  "action": "opened",
  "pull_request": {
    "number": 42,
    "title": "Add authentication"
  }
}
```

**환경 지정**: `?env=int|stg|prd` (기본값: int) 또는 `X-Env` 헤더

### Datadog

```
POST http://localhost:4000/webhooks/datadog?env=stg
Content-Type: application/json

{
  "title": "High error rate detected",
  "priority": "P1",
  "event_type": "alert"
}
```

**환경 지정**: `?env=int|stg|prd` (기본값: int) 또는 `X-Env` 헤더

## 🌐 멀티 환경 지원

RTB AI Hub는 단일 인프라에서 3개의 논리적 환경을 지원합니다:

- **int** (개발): 개발 및 테스트 환경 (기본값)
- **stg** (검증): 스테이징 및 QA 환경
- **prd** (운영): 프로덕션 환경

### 환경 지정 방법

Webhook 요청 시 다음 두 가지 방법으로 환경을 지정할 수 있습니다:

1. **쿼리 파라미터**: `?env=stg`
2. **HTTP 헤더**: `X-Env: stg`

쿼리 파라미터와 헤더가 모두 제공된 경우 쿼리 파라미터가 우선합니다. 환경을 지정하지 않으면 기본값인 `int`가 사용됩니다.

### 환경별 격리

각 환경은 다음과 같이 격리됩니다:

- **MCP 서버 컨테이너**: 환경별로 별도의 컨테이너 실행 (예: `mcp-jira-int`, `mcp-jira-stg`, `mcp-figma-int`)
- **자격 증명**: 환경별 독립적인 API 키 및 OAuth 토큰 사용
- **데이터베이스**: `workflow_executions` 및 `webhook_events` 테이블에 `env` 컬럼으로 환경 구분

### 환경별 자격 증명 설정

`.env` 파일에서 환경별 자격 증명을 설정할 수 있습니다:

```bash
# 기본 자격 증명 (모든 환경의 폴백)
JIRA_HOST=your-org.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-token

# INT 환경 전용 (선택사항)
INT_JIRA_HOST=dev-org.atlassian.net
INT_JIRA_EMAIL=dev@company.com
INT_JIRA_API_TOKEN=dev-token

# STG 환경 전용 (선택사항)
STG_JIRA_HOST=staging-org.atlassian.net
STG_JIRA_EMAIL=staging@company.com
STG_JIRA_API_TOKEN=staging-token

# PRD 환경 전용 (선택사항)
PRD_JIRA_HOST=prod-org.atlassian.net
PRD_JIRA_EMAIL=prod@company.com
PRD_JIRA_API_TOKEN=prod-token
```

환경별 자격 증명이 없으면 기본 자격 증명(접두사 없음)으로 폴백됩니다.

## 🔧 개발

### 로컬 개발 환경 (추천) ⚡

**원클릭 자동 설정**:

```bash
./scripts/dev-local.sh
```

이 스크립트는 자동으로:

- ✅ pnpm 설치 확인
- ✅ 의존성 설치 (0.4초!)
- ✅ shared 패키지 빌드
- ✅ Docker 인프라 시작 (PostgreSQL, Redis)

**개별 서비스 실행** (Hot Reload 지원):

```bash
# 터미널 1 - Auth Service
pnpm dev:auth

# 터미널 2 - Webhook Listener
pnpm dev:webhook

# 터미널 3 - Workflow Engine
pnpm dev:workflow

# 터미널 4 - Dashboard
pnpm dev:dashboard
```

### 빌드 명령어

```bash
# 전체 패키지 빌드 (7초)
pnpm build

# 특정 패키지만 빌드
pnpm build:shared
pnpm build:auth
pnpm build:webhook
pnpm build:workflow
pnpm build:dashboard
```

### Docker 명령어

```bash
# 빌드
pnpm docker:build

# 실행
pnpm docker:up

# 로그 확인
pnpm docker:logs

# 중지
pnpm docker:down
```

### 성능 최적화 ⚡

이 프로젝트는 pnpm을 사용하여 **300배 빠른 설치 속도**를 제공합니다:

| 작업       | Before (npm) | After (pnpm) |
| ---------- | ------------ | ------------ |
| **설치**   | ~120초       | **0.4초** ⚡ |
| **빌드**   | 타임아웃     | **7초** ⚡   |
| **디스크** | ~2GB         | **500MB** 💾 |

**pnpm 장점**:

- ✅ 심볼릭 링크로 패키지 공유 (중복 제거)
- ✅ 병렬 설치 (16개 동시)
- ✅ 글로벌 캐시 (`~/.pnpm-store`)
- ✅ Workspace 프로토콜로 로컬 패키지 즉시 링크

### 서비스 로컬 실행

```bash
# 터미널 1 - Webhook Listener
cd packages/webhook-listener
npm run dev

# 터미널 2 - Workflow Engine
cd packages/workflow-engine
npm run dev

# 터미널 3 - Dashboard
cd packages/dashboard
npm run dev
```

### 모든 패키지 빌드

```bash
cd packages/shared && npm run build
cd ../webhook-listener && npm run build
cd ../workflow-engine && npm run build
cd ../dashboard && npm run build
```

## 📦 프로젝트 구조

```
rtb-ai-hub/
├── packages/
│   ├── shared/              # 공유 타입 & 유틸리티
│   │   └── src/agent-types.ts  # 멀티 에이전트 타입 (AgentRole, AgentContext 등)
│   ├── auth-service/        # 인증 (Google OAuth / DEV_MODE)
│   ├── webhook-listener/    # Express API (webhooks)
│   ├── workflow-engine/     # BullMQ 워커 + AI
│   │   └── src/
│   │       ├── agents/              # 멀티 에이전트 오케스트레이션
│   │       │   ├── base-agent.ts         # 에이전트 기본 클래스
│   │       │   ├── orchestrator.ts       # 파이프라인 실행기
│   │       │   ├── state-store.ts        # Redis 기반 세션 관리
│   │       │   ├── registry.ts           # 에이전트 레지스트리
│   │       │   ├── pipelines.ts          # 워크플로우별 파이프라인 정의
│   │       │   └── implementations/     # 5개 에이전트 구현체
│   │       │       ├── analyzer-agent.ts
│   │       │       ├── planner-agent.ts
│   │       │       ├── developer-agent.ts
│   │       │       ├── reviewer-agent.ts
│   │       │       └── oracle-agent.ts
│   │       ├── utils/
│   │       │   └── wiki-knowledge.ts    # rtb-wiki 지식 DB 연계
│   │       └── workflows/
│   │           ├── jira-auto-dev.ts     # 라우터 (OpenCode/Multi-Agent 전환)
│   │           └── jira-auto-dev-multi.ts  # 멀티 에이전트 워크플로우
│   └── dashboard/           # React 대시보드
├── mcp-servers/             # MCP 서버 컨테이너
│   ├── jira/
│   ├── figma/
│   ├── github/
│   └── datadog/
├── infrastructure/
│   ├── postgres/            # DB 스키마 (5개 테이블)
│   └── redis/               # Redis 설정
├── drizzle/                 # DB 마이그레이션 파일
│   └── 0001_add_env_column.sql
├── scripts/
│   ├── generate-secrets.js  # 보안 키 생성기
│   └── dev-local.sh         # 로컬 개발 환경 자동 설정
├── pnpm-workspace.yaml      # pnpm 모노레포 설정
├── .npmrc                   # pnpm 성능 최적화
├── docker-compose.test.yml  # 테스트 환경
├── AUTH_SETUP.md            # 인증 설정 가이드
└── IMPLEMENTATION_SUMMARY.md # 구현 세부사항
```

## ⚙️ 기술 스택

### 백엔드

- **런타임**: Node.js 20 + TypeScript
- **패키지 관리자**: pnpm 10 (300배 빠른 설치)
- **API 프레임워크**: Express.js + Helmet (보안)
- **큐 시스템**: BullMQ + Redis
- **데이터베이스**: PostgreSQL 17
- **인증**: Google OAuth 2.0 + JWT
- **암호화**: AES-256-GCM (자격 증명)

### 프론트엔드

- **프레임워크**: React 18 + TypeScript
- **빌드**: Vite
- **라우팅**: React Router v6
- **스타일링**: Tailwind CSS
- **HTTP 클라이언트**: Axios

### AI & 외부 서비스

- **AI**: Anthropic Claude (멀티 에이전트 파이프라인 지원)
- **통합**: Figma, Jira, GitHub, Datadog
- **MCP**: Model Context Protocol 서버
- **지식 DB**: rtb-wiki Obsidian vault 연계 (도메인 지식 자동 주입)

### 인프라

- **컨테이너**: Docker + Docker Compose
- **캐싱**: Redis 7 (세션 + 큐 + 에이전트 메모리)
- **프록시**: Nginx (프로덕션)

## 🤖 AI 워크플로우

### 1. Figma → Jira (figma-to-jira)

**트리거**: Figma 파일이 "Ready for Dev"로 표시됨
**프로세스**:

1. AI가 Figma 컴포넌트 및 스타일 분석
2. 컴포넌트 명세 생성 (TypeScript 인터페이스, Tailwind 클래스)
3. 계층적 Jira 이슈 생성:
   - **Story**: 전체 기능 개요
   - **Task**: 각 컴포넌트별 구현 작업 (Story 하위)
   - **Subtask**: 구현/테스트/검증으로 세분화 (Task 하위)
4. 스토리 포인트 및 개발 시간 추정

### 2. Jira → 자동 개발 (jira-auto-dev)

**트리거**: Jira 티켓이 "In Progress"로 전환됨 (`auto-dev-enabled` 라벨 포함)

**프로세스** (OpenCode 우선, Multi-Agent 폴백):

1. **OpenCode 시도** (`USE_OPENCODE_AGENTS=true`):
   - OpenCode CLI 에이전트를 통한 고품질 코드 생성
   - 실패 시 Multi-Agent로 폴백

2. **Multi-Agent 모드** (`USE_MULTI_AGENT=true`):
   - **Analyzer** — 요구사항 분석 + 도메인 지식 반영
   - **Planner** — 파일 구조, 의존성, 구현 계획 수립
   - **Developer** — 실제 코드 생성 (정확한 테이블명, 컬럼명, 쿼리 패턴 포함)
   - **Reviewer** — 코드 품질, 보안, 도메인 규칙 검증
   - 실패 시 **Oracle**이 원인 분석 → 자동 재시도

3. **No fallback to single-agent** - 품질 보장을 위해 저품질 결과물 자동 생성 방지

### 3. 자동 리뷰 (auto-review)

**트리거**: GitHub Pull Request 열림
**프로세스**:

1. AI가 품질, 버그, 보안에 대한 코드 리뷰
2. Jira 요구사항과의 일치 여부 확인
3. GitHub에 리뷰 댓글 게시
4. 리뷰 상태로 Jira 업데이트

### 4. 배포 모니터링 (deploy-monitor)

**트리거**: GitHub 배포 생성됨
**프로세스**:

1. 배포 후 Datadog 메트릭 모니터링
2. AI가 이상 징후 분석
3. 문제 감지 시 롤백 권장
4. Jira 티켓을 "Done"으로 업데이트

### 5. 인시던트 → Jira (incident-to-jira)

**트리거**: Datadog P1/P2 알림
**프로세스**:

1. AI가 로그, 트레이스, 메트릭 분석
2. 근본 원인 식별
3. 분석 내용과 함께 Jira Bug 티켓 생성
4. 당직 엔지니어에게 할당 (PagerDuty 통해)

## 🤖 멀티 에이전트 파이프라인

`USE_MULTI_AGENT=true` 환경변수로 활성화되는 5단계 AI 에이전트 파이프라인입니다.

```
Jira Issue → [Analyzer] → [Planner] → [Developer] → [Reviewer] → GitHub PR
                                                         ↑
                                                     [Oracle] (실패 시 진단 + 재시도)
```

### 에이전트 역할

| 에이전트  | 역할                              | AI 티어 |
| --------- | --------------------------------- | ------- |
| Analyzer  | 요구사항 분석, 기술 명세 추출     | haiku   |
| Planner   | 파일 구조, 의존성, 구현 계획      | sonnet  |
| Developer | 실제 코드 생성                    | sonnet  |
| Reviewer  | 코드 품질, 보안, 도메인 규칙 검증 | sonnet  |
| Oracle    | 파이프라인 실패 진단, 복구 전략   | sonnet  |

### 특징

- **Wave 기반 병렬 실행** (v2.1+): 독립적인 에이전트들을 동일 wave에 배치하여 Promise.all로 병렬 실행. 워크플로우 속도 향상 (최대 40%)
- **Redis 기반 상태 관리**: 에이전트 간 컨텍스트 공유 (StateStore)
- **품질 우선**: Multi-agent 실패 시 에러 throw (저품질 single-agent fallback 제거)
- **Feature Flag**: `USE_MULTI_AGENT=false`이면 AI workflow disabled (에러 발생)

#### Wave 기반 실행 예시 (JIRA_AUTO_DEV)

```
Wave 1: [Analyzer] ───────────────────┐
                                      ▼
Wave 2:                         [Planner] ──────┐
                                                ▼
Wave 3:                                   [Developer] ───┐
                                                         ▼
Wave 4:                                            [Reviewer]
```

- **Wave 1**: 분석 단계 (단독 실행)
- **Wave 2**: 계획 단계 (Analyzer 완료 후)
- **Wave 3**: 구현 단계 (Planner 완료 후)
- **Wave 4**: 리뷰 단계 (Developer 완료 후)

향후 독립적인 탐색 에이전트를 Wave 1에 추가하면 병렬 실행으로 성능 향상 가능

## 📚 Wiki 지식 DB 연계

GitHub 저장소를 로컬에 자동으로 클론하여 에이전트가 RTB 도메인 지식(DB 스키마, 쿼리 패턴, 아키텍처)을 참조할 수 있습니다.

### 동작 방식

1. **자동 클론/업데이트**: workflow-engine 시작 시 `WIKI_REPO_URL`에서 자동으로 클론. 이미 존재하면 `git pull`로 업데이트
2. **테이블명 추출**: Jira 이슈 텍스트에서 테이블명 추출 (`obj_bld_mst`, `prd_pdm_mst` 등)
3. **도메인 매칭**: 한국어/영어 키워드로 도메인 매칭 (빌딩→obj, 매물→prd, 딜→gtd)
4. **자동 주입**: 매칭된 wiki 문서를 에이전트 프롬프트에 자동 주입 (~8,000 토큰)

### 설정

```bash
# .env
WIKI_REPO_URL=https://github.com/your-org/rtb-wiki.git
WIKI_LOCAL_PATH=/workspace/rtb-wiki
```

설정하지 않으면 wiki 기능이 비활성화되며 기존 동작에 영향 없습니다.

## 🔒 보안

### 구현된 보안 기능

- **JWT-only 세션**: DB 의존 없는 경량 인증 (7일 세션, 30일 갱신 토큰)
- **Google Workspace OAuth**: 프로덕션 환경에서 회사 도메인 기반 접근 제어
- **DEV_MODE 분리**: 개발/프로덕션 인증 완전 분리
- **Webhook HMAC 서명 검증**: GitHub, Jira, Figma, Datadog 4개 프로바이더
- **Rate Limiting**: 공개 엔드포인트 속도 제한
- **HttpOnly 쿠키**: JavaScript로 세션 토큰 접근 불가
- **Helmet**: Express 보안 헤더 자동 적용

### 보안 모범 사례

- ✅ **절대 커밋하지 말 것** `.env` 파일 또는 API 키
- ✅ **프로덕션에서 HTTPS 사용**
- ✅ **프로덕션에서 DEV_MODE=false 확인**
- ✅ **Webhook 서명 검증 활성화**
- ✅ **JWT_SECRET은 최소 32자 이상 사용**

## 📊 모니터링

- **로그**: Pino를 통한 JSON 구조화 로깅
- **메트릭**: PostgreSQL 메트릭 테이블
- **AI 비용**: 워크플로우 실행별로 추적
- **대시보드**: 실시간 워크플로우 상태

## 🐛 문제 해결

### 서비스가 시작되지 않음

```bash
# 로그 확인
docker-compose logs workflow-engine
docker-compose logs webhook-listener

# 서비스 재시작
docker-compose restart
```

### 큐가 처리되지 않음

```bash
# Redis 연결 확인
docker-compose exec redis redis-cli ping

# 워커 로그 확인
docker-compose logs -f workflow-engine
```

### 데이터베이스 연결 오류

```bash
# PostgreSQL 확인
docker-compose exec postgres psql -U postgres -d rtb_ai_hub -c "\dt"
```

## 📈 예상 효과 (10인 팀 기준)

| 지표              | 이전   | 이후    | 개선      |
| ----------------- | ------ | ------- | --------- |
| Figma → 개발 시작 | 2-3일  | 2-3시간 | **90% ↓** |
| PR 리뷰 시간      | 4시간  | 30분    | **87% ↓** |
| 인시던트 대응     | 30분   | 5분     | **83% ↓** |
| 주간 반복 작업    | 40시간 | 8시간   | **80% ↓** |
| 스프린트 처리량   | 50 SP  | 75 SP   | **50% ↑** |

**v2.1+ 추가 개선**: Wave 기반 병렬 실행으로 멀티 에이전트 워크플로우 시간 **최대 40% 단축** (독립적인 에이전트를 동일 wave에 배치 시)

## 🤝 기여

이것은 개발/데모 프로젝트입니다. 프로덕션 사용을 위해서는:

1. 모든 엔드포인트에 인증 추가
2. Webhook 서명 검증 구현
3. 포괄적인 테스트 스위트 추가
4. CI/CD 파이프라인 설정
5. 프로덕션 데이터베이스 백업 구성

## 📄 라이선스

MIT

## 📚 문서

### 환경 설정

- **[ENV_SETUP.md](./ENV_SETUP.md)** - 카테고리별 환경변수 설정 가이드 ⭐
- **[AUTH_SETUP.md](./AUTH_SETUP.md)** - 완전한 인증 설정 가이드 (Google OAuth)
- **[SETUP.md](./SETUP.md)** - 기본 시스템 설정 및 테스트

### OpenCode 통합 (신규)

- **[OPENCODE_SDK_INTEGRATION.md](./OPENCODE_SDK_INTEGRATION.md)** - OpenCode SDK 통합 완료 보고서 🎉 NEW
- **[infrastructure/opencode/MCP_INTEGRATION.md](./infrastructure/opencode/MCP_INTEGRATION.md)** - OpenCode ↔ RTB MCP 연동 가이드 🔗 NEW
- **[OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md)** - OpenCode & Oh-My-OpenCode 개념 가이드 🚀
- **[infrastructure/opencode/README.md](./infrastructure/opencode/README.md)** - OpenCode 설정 파일 커스터마이징
- **[infrastructure/opencode/DOCKER_SETUP.md](./infrastructure/opencode/DOCKER_SETUP.md)** - Docker 환경 실행 가이드 🐳

### 기술 문서

- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - 기술 구현 세부사항

## 🔗 외부 링크

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Jira MCP Server](https://github.com/anthropics/mcp-server-jira)
- [Figma MCP Server](https://github.com/anthropics/mcp-server-figma)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Anthropic Claude](https://docs.anthropic.com/)
