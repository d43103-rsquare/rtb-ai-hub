# 환경변수 설정 가이드

RTB AI Hub는 환경변수를 **카테고리별로 분리**하여 관리합니다. 이를 통해 설정의 가독성과 유지보수성을 높였습니다.

## 📁 파일 구조

```
.env.base         # 기본 설정 (포트, 인프라) - 커밋 가능
.env.auth         # 인증 관련 (Google OAuth, JWT) - ⚠️ gitignore
.env.services     # 외부 서비스 (Jira, Figma 등) - ⚠️ gitignore
.env.ai           # AI 설정 (Anthropic, 멀티 에이전트) - ⚠️ gitignore
.env.advanced     # 고급 기능 (멀티 환경, 리포 라우팅) - 선택사항
.env.local        # 로컬 오버라이드 - ⚠️ gitignore
```

### 로딩 순서

환경변수는 다음 순서로 로드되며, 나중 파일이 이전 파일의 값을 덮어씁니다:

```
.env.base → .env.auth → .env.services → .env.ai → .env.advanced → .env.local
```

## 🚀 빠른 시작

### 1. 자동 설정 (권장)

```bash
./scripts/setup-env.sh
```

이 스크립트는 자동으로:

- ✅ 모든 example 파일을 실제 파일로 복사
- ✅ JWT_SECRET과 CREDENTIAL_ENCRYPTION_KEY 생성
- ✅ 설정 체크리스트 표시

### 2. 필수 설정

#### a. `.env.auth` - 인증 설정

```bash
nano .env.auth
```

**최소 설정 (DEV_MODE):**

```bash
DEV_MODE=true
DEV_USER_EMAIL=your-email@company.com
DEV_USER_NAME=Your Name
JWT_SECRET=<generated-by-script>
CREDENTIAL_ENCRYPTION_KEY=<generated-by-script>
```

#### b. `.env.ai` - AI 설정

```bash
nano .env.ai
```

**필수:**

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. 서비스 시작

```bash
./scripts/dev-local.sh
```

### 4. 로그인 테스트

```
http://localhost:4001/auth/dev/login
```

## 📋 상세 설정

### `.env.base` - 기본 설정

**목적**: 애플리케이션 기본 설정 (포트, 데이터베이스, Redis)  
**커밋**: ✅ 가능 (민감한 정보 없음)  
**필수**: ✅

```bash
# 애플리케이션
NODE_ENV=development
LOG_LEVEL=info

# 포트
WEBHOOK_PORT=4000
DASHBOARD_PORT=3000
AUTH_SERVICE_PORT=4001

# PostgreSQL
POSTGRES_HOST=localhost      # Docker: postgres
POSTGRES_PORT=5432
POSTGRES_DB=rtb_ai_hub
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_HOST=localhost          # Docker: redis
REDIS_PORT=6379
```

**Docker 사용 시:**

- `POSTGRES_HOST=postgres`
- `REDIS_HOST=redis`

---

### `.env.auth` - 인증 설정

**목적**: 인증 관련 설정 (Google OAuth, JWT, DEV_MODE)  
**커밋**: ⚠️ 절대 금지  
**필수**: ✅

#### 개발 모드 (DEV_MODE)

```bash
DEV_MODE=true
DEV_USER_EMAIL=your-email@company.com
DEV_USER_NAME=Your Name
```

**장점:**

- Google OAuth 설정 불필요
- `/auth/dev/login` 접속만으로 즉시 로그인
- 로컬 개발에 최적

#### 프로덕션 모드 (Google OAuth)

```bash
DEV_MODE=false
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:4001/auth/google/callback
ALLOWED_WORKSPACE_DOMAINS=your-company.com
```

**설정 방법**: [AUTH_SETUP.md](./AUTH_SETUP.md) 참조

#### 보안 키

```bash
JWT_SECRET=<minimum-32-characters>
CREDENTIAL_ENCRYPTION_KEY=<64-hex-characters>
```

**생성 방법:**

```bash
node scripts/generate-secrets.js
```

---

### `.env.services` - 외부 서비스

**목적**: 외부 서비스 API 키 및 토큰  
**커밋**: ⚠️ 절대 금지  
**필수**: 사용하는 서비스만 설정

#### Jira

```bash
JIRA_HOST=your-org.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-token
JIRA_PROJECT_KEY=PROJ
```

**발급 방법:**

1. Atlassian 계정 설정 → 보안 → API 토큰 생성
2. `JIRA_PROJECT_KEY`: Epic/Issue 생성 시 사용할 프로젝트 키

#### Figma

```bash
FIGMA_ACCESS_TOKEN=your-token
```

**발급 방법:**

1. Figma → 설정 → Account → Personal access tokens

#### GitHub

```bash
GITHUB_TOKEN=ghp_your-token
GITHUB_REPO=your-org/your-repo
```

**발급 방법:**

1. GitHub → Settings → Developer settings → Personal access tokens
2. 권한: `repo` 전체 필요

#### Datadog

```bash
DD_API_KEY=your-api-key
DD_APP_KEY=your-app-key
```

#### 기타 서비스 (선택사항)

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
PAGERDUTY_API_KEY=your-key
```

---

### `.env.ai` - AI 설정

**목적**: AI 클라이언트 및 멀티 에이전트 설정  
**커밋**: ⚠️ 절대 금지  
**필수**: ✅ (ANTHROPIC_API_KEY)

#### Anthropic Claude

```bash
ANTHROPIC_API_KEY=sk-ant-your-key
```

**발급 방법:**

1. https://console.anthropic.com/settings/keys

#### 멀티 에이전트 모드

```bash
USE_MULTI_AGENT=false
```

**옵션:**

- `false` (기본값): AI workflow disabled (에러 발생)
- `true`: 5단계 에이전트 파이프라인 활성화
  - Analyzer → Planner → Developer → Reviewer → Oracle
  - OpenCode 실패 시 폴백으로 사용

#### Wiki 지식 DB 연동

```bash
WIKI_PATH=/Users/you/Workspace/ai/rtb-wiki
```

**동작:**

- 설정 시: 에이전트가 RTB 도메인 지식(DB 스키마, 쿼리 패턴) 자동 참조
- 비워두면: wiki 기능 비활성화 (기존 동작 유지)

---

### `.env.advanced` - 고급 기능 (선택사항)

**목적**: 멀티 환경, 리포 라우팅, MCP 엔드포인트 오버라이드  
**커밋**: 상황에 따라  
**필수**: ❌ (기본값으로 동작)

#### 멀티 환경 자격증명

환경별(int/stg/prd) 다른 자격증명 사용:

```bash
# INT Environment
INT_JIRA_HOST=dev-org.atlassian.net
INT_JIRA_EMAIL=dev@company.com
INT_JIRA_API_TOKEN=dev-token
INT_GITHUB_REPO=org/dev-repo

# STG Environment
STG_JIRA_HOST=staging-org.atlassian.net
STG_JIRA_EMAIL=staging@company.com
STG_JIRA_API_TOKEN=stg-token
STG_GITHUB_REPO=org/staging-repo
```

**폴백**: 환경별 설정이 없으면 `.env.services`의 기본 자격증명 사용

#### 멀티 리포지토리 라우팅

MSA 환경에서 Jira Component별 리포지토리 자동 라우팅:

```bash
# Jira Component → GitHub Repo 매핑
REPO_ROUTING_REPOS=Backend=org/be-api,Frontend=org/fe-app,Infrastructure=org/infra

# Environment → Base Branch 매핑
REPO_ROUTING_BRANCHES=int=develop,stg=staging,prd=main
```

#### MCP 엔드포인트 (로컬 개발용)

Docker 내부에서는 자동 설정. 로컬 개발 시만 필요:

```bash
MCP_JIRA_INT_ENDPOINT=http://localhost:3010
MCP_FIGMA_INT_ENDPOINT=http://localhost:3011
MCP_GITHUB_INT_ENDPOINT=http://localhost:3012
MCP_DATADOG_INT_ENDPOINT=http://localhost:3013
```

---

### `.env.local` - 로컬 오버라이드

**목적**: 로컬 환경에서 임시로 값 변경  
**커밋**: ⚠️ 절대 금지  
**필수**: ❌

**사용 예:**

```bash
# 로컬에서만 로그 레벨 변경
LOG_LEVEL=debug

# 로컬에서만 다른 포트 사용
WEBHOOK_PORT=5000
```

**특징:**

- 가장 마지막에 로드되므로 모든 값 덮어쓰기 가능
- 팀원마다 다른 설정 필요 시 유용

---

## 🔒 보안 주의사항

### ⚠️ 절대 커밋하지 말 것

```bash
.env.auth       # JWT_SECRET, Google OAuth
.env.services   # API 토큰, 서비스 키
.env.ai         # Anthropic API 키
.env.local      # 로컬 오버라이드
```

### ✅ 커밋 가능

```bash
.env.base            # 기본 설정 (민감한 정보 없음)
.env.*.example       # 템플릿 파일들
```

### 🛡️ 보안 체크리스트

- [ ] `.gitignore`에 민감한 파일 등록 확인
- [ ] `JWT_SECRET`은 최소 32자 이상
- [ ] `CREDENTIAL_ENCRYPTION_KEY`는 64자 hex
- [ ] 프로덕션에서 `DEV_MODE=false` 확인
- [ ] HTTPS 사용 (프로덕션)

---

## 🐛 문제 해결

### "환경변수를 찾을 수 없음" 오류

**원인**: 필수 파일이 없음

**해결:**

```bash
./scripts/setup-env.sh
```

### "Invalid JWT_SECRET" 오류

**원인**: JWT_SECRET이 32자 미만 또는 설정되지 않음

**해결:**

```bash
node scripts/generate-secrets.js
# 출력된 JWT_SECRET을 .env.auth에 복사
```

### Docker에서 DB 연결 실패

**원인**: `POSTGRES_HOST=localhost`로 설정됨

**해결:**

```bash
# .env.local 파일 생성
POSTGRES_HOST=postgres
REDIS_HOST=redis
```

### 서비스별 설정이 적용 안 됨

**원인**: 로딩 순서 문제

**확인:**

```bash
# package.json의 dev 스크립트 확인
dotenv -e .env.base -e .env.auth -e .env.services -e .env.ai -e .env.advanced -e .env.local
```

순서대로 로드되므로 나중 파일이 우선순위 높음

---

## 💡 팁

### 빠른 편집

```bash
# 한 번에 모든 필수 파일 열기
nano .env.auth .env.ai
```

### 환경변수 확인

```bash
# 특정 서비스에서 실제 로드된 환경변수 확인
cd packages/webhook-listener
pnpm dev
# 터미널에 로그로 출력됨
```

### 팀 공유

```bash
# example 파일만 커밋
git add .env.*.example
git commit -m "docs: Update environment variable examples"
```

### 마이그레이션 (기존 .env에서)

```bash
# 기존 .env 파일을 카테고리별로 분리
cp .env .env.backup
./scripts/setup-env.sh

# .env.backup에서 값을 복사하여 각 카테고리 파일에 붙여넣기
# .env.auth: DEV_MODE, JWT_SECRET, GOOGLE_*
# .env.services: JIRA_*, FIGMA_*, GITHUB_*, DD_*
# .env.ai: ANTHROPIC_API_KEY, USE_MULTI_AGENT, WIKI_PATH
```

---

## 📚 관련 문서

- [AUTH_SETUP.md](./AUTH_SETUP.md) - Google OAuth 상세 설정
- [README.md](./README.md) - 프로젝트 전체 가이드
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 기술 구현 세부사항
