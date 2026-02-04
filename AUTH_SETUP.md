# RTB AI Hub - 인증 시스템 설정 가이드

## 🎯 개요

RTB AI Hub는 사용자별 자격증명 관리를 지원하는 완전한 인증 시스템을 제공합니다:

- **Google Workspace OAuth 로그인**: 회사 계정으로 시스템 접근 제어
- **사용자별 API 키 관리**: Anthropic, OpenAI 등의 API 키를 암호화하여 저장
- **서비스 OAuth 연동**: Jira, GitHub, Figma, Datadog와의 OAuth 2.0 통합
- **세션 관리**: JWT 기반 안전한 세션 관리

## 📋 전제 조건

### 1. Google Cloud Console 설정

**OAuth 2.0 클라이언트 ID 생성:**

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성 또는 선택
3. **API 및 서비스 → 사용자 인증 정보** 이동
4. **사용자 인증 정보 만들기 → OAuth 클라이언트 ID** 선택
5. 애플리케이션 유형: **웹 애플리케이션**
6. 승인된 리디렉션 URI 추가:
   ```
   http://localhost:4001/auth/google/callback
   https://your-domain.com/auth/google/callback  # 프로덕션
   ```
7. 클라이언트 ID와 클라이언트 보안 비밀 저장

**OAuth 동의 화면 설정:**

1. **OAuth 동의 화면** 메뉴 이동
2. 사용자 유형: **내부** (Workspace 조직 내부만 허용)
3. 범위 추가:
   - `userinfo.email`
   - `userinfo.profile`

### 2. 보안 키 생성

```bash
cd /Users/d43103/Workspace/ai/rtb-ai-hub
node scripts/generate-secrets.js
```

출력된 키를 `.env` 파일에 복사:

```bash
CREDENTIAL_ENCRYPTION_KEY=<64자리 hex 문자열>
JWT_SECRET=<base64 문자열>
```

### 3. 환경변수 설정

`.env` 파일 생성:

```bash
cp .env.example .env
```

필수 환경변수 설정:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4001/auth/google/callback
ALLOWED_WORKSPACE_DOMAINS=your-company.com  # 쉼표로 구분하여 여러 도메인 가능

# 보안 키 (위에서 생성한 키 사용)
JWT_SECRET=your-jwt-secret
CREDENTIAL_ENCRYPTION_KEY=your-encryption-key

# 애플리케이션 URL
APP_URL=http://localhost:4001
DASHBOARD_URL=http://localhost:3000

# 데이터베이스 (기존 설정 유지)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=rtb_ai_hub
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

### 4. 서비스별 OAuth 설정 (선택사항)

각 서비스에서 OAuth 앱을 생성하고 `.env`에 추가:

**Jira Cloud:**
```bash
JIRA_CLIENT_ID=your-jira-client-id
JIRA_CLIENT_SECRET=your-jira-client-secret
```

**GitHub:**
```bash
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**Figma:**
```bash
FIGMA_CLIENT_ID=your-figma-client-id
FIGMA_CLIENT_SECRET=your-figma-client-secret
```

## 🚀 시스템 시작

### 전체 시스템 시작 (Docker Compose)

```bash
docker-compose -f docker-compose.test.yml up -d --build
```

서비스 확인:

```bash
docker-compose -f docker-compose.test.yml ps
```

예상 출력:
```
NAME                   STATUS
rtb-postgres           Up (healthy)
rtb-redis              Up (healthy)
rtb-auth-service       Up (healthy)
rtb-webhook-listener   Up (healthy)
rtb-workflow-engine    Up (healthy)
rtb-dashboard          Up
```

### 개별 서비스 시작 (개발 모드)

**터미널 1 - Auth Service:**
```bash
cd packages/auth-service
npm install
npm run build
npm run dev
```

**터미널 2 - Webhook Listener:**
```bash
cd packages/webhook-listener
npm install
npm run dev
```

**터미널 3 - Workflow Engine:**
```bash
cd packages/workflow-engine
npm install
npm run dev
```

## 📚 사용 방법

### 1. 사용자 로그인

**로그인 URL 가져오기:**

```bash
curl http://localhost:4001/auth/google/login
```

응답:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

브라우저에서 `authUrl`을 열어 Google 로그인을 진행합니다.

**로그인 완료 후:**
- 자동으로 Dashboard로 리디렉션됨 (`http://localhost:3000/dashboard?login=success`)
- `session_token`과 `refresh_token` 쿠키가 설정됨

### 2. API 키 등록 (Anthropic)

**Anthropic API 키 저장:**

```bash
curl -X POST http://localhost:4001/credentials/api-key \
  -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "anthropic",
    "apiKey": "sk-ant-api03-your-real-key"
  }'
```

**OpenAI API 키 저장:**

```bash
curl -X POST http://localhost:4001/credentials/api-key \
  -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "openai",
    "apiKey": "sk-your-openai-key"
  }'
```

### 3. OAuth 서비스 연결

**Jira 연결:**

```bash
curl http://localhost:4001/oauth/jira/connect \
  -H "Authorization: Bearer <session_token>"
```

응답:
```json
{
  "authUrl": "https://auth.atlassian.com/authorize?..."
}
```

브라우저에서 `authUrl`을 열어 Jira 인증을 진행합니다.

**GitHub, Figma, Datadog도 동일한 방식으로 연결:**

```bash
GET /oauth/github/connect
GET /oauth/figma/connect
GET /oauth/datadog/connect
```

### 4. 자격증명 확인

**등록된 자격증명 목록 조회:**

```bash
curl http://localhost:4001/credentials \
  -H "Authorization: Bearer <session_token>"
```

응답:
```json
{
  "credentials": [
    {
      "service": "anthropic",
      "authType": "api_key",
      "isConnected": true,
      "connectedAt": "2026-02-04T14:00:00Z"
    },
    {
      "service": "jira",
      "authType": "oauth",
      "isConnected": true,
      "expiresAt": "2026-03-04T14:00:00Z",
      "scope": "read:jira-work write:jira-work"
    }
  ]
}
```

### 5. 인증된 웹훅 사용

**Bearer 토큰과 함께 웹훅 전송:**

```bash
curl -X POST http://localhost:4000/webhooks/figma \
  -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "FILE_UPDATE",
    "file_key": "test123",
    "file_name": "My Design",
    "file_url": "https://figma.com/file/test123"
  }'
```

**동작 방식:**
1. Webhook Listener가 Bearer 토큰을 검증
2. 사용자 ID를 추출하여 큐에 포함
3. Workflow Engine이 사용자별 Anthropic API 키를 사용하여 AI 처리
4. 결과를 데이터베이스에 저장 (user_id 포함)

## 🔐 보안 고려사항

### 1. API 키 암호화

모든 API 키는 AES-256-GCM 알고리즘으로 암호화되어 저장됩니다:

```typescript
// 암호화 예시
const encrypted = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
// 저장: { iv, encrypted, authTag }
```

### 2. JWT 세션

- **세션 토큰**: 7일 유효
- **리프레시 토큰**: 30일 유효
- **자동 갱신**: 토큰 만료 전 자동 갱신

### 3. Workspace 도메인 제한

`ALLOWED_WORKSPACE_DOMAINS`에 설정된 도메인만 로그인 허용:

```bash
ALLOWED_WORKSPACE_DOMAINS=company1.com,company2.com
```

### 4. 자격증명 사용 감사

모든 자격증명 사용이 로그에 기록됩니다:

```sql
SELECT * FROM credential_usage_log
WHERE user_id = 'user_xxx'
ORDER BY created_at DESC;
```

## 🧪 테스트

### 1. 전체 플로우 테스트

```bash
# 1. 로그인
LOGIN_URL=$(curl -s http://localhost:4001/auth/google/login | jq -r .authUrl)
echo "Open this URL in browser: $LOGIN_URL"

# 2. 로그인 완료 후 쿠키에서 세션 토큰 추출
SESSION_TOKEN="<session_token from browser cookie>"

# 3. API 키 등록
curl -X POST http://localhost:4001/credentials/api-key \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"service": "anthropic", "apiKey": "sk-ant-api03-xxx"}'

# 4. 웹훅 테스트
curl -X POST http://localhost:4000/webhooks/figma \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "FILE_UPDATE", "file_key": "test", "file_name": "Test"}'

# 5. 결과 확인
docker exec rtb-postgres psql -U postgres -d rtb_ai_hub \
  -c "SELECT id, type, status, user_id, cost_usd FROM workflow_executions ORDER BY created_at DESC LIMIT 1;"
```

### 2. 데이터베이스 확인

```bash
# 사용자 목록
docker exec rtb-postgres psql -U postgres -d rtb_ai_hub \
  -c "SELECT id, email, name, workspace_domain, last_login FROM users;"

# 사용자별 자격증명
docker exec rtb-postgres psql -U postgres -d rtb_ai_hub \
  -c "SELECT user_id, service, auth_type, is_active FROM user_credentials;"

# 자격증명 사용 로그
docker exec rtb-postgres psql -U postgres -d rtb_ai_hub \
  -c "SELECT user_id, service, action, success, created_at FROM credential_usage_log ORDER BY created_at DESC LIMIT 10;"
```

## 📊 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  사용자 (Google Workspace 계정)                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ Auth Service  │  ← Google OAuth 로그인
         │  :4001        │  ← 자격증명 관리
         └───────┬───────┘
                 │
                 ├───────────────────────────────────┐
                 │                                   │
                 ▼                                   ▼
         ┌───────────────┐                  ┌─────────────┐
         │   PostgreSQL  │                  │   Redis     │
         │   (암호화된   │                  │  (세션)     │
         │    자격증명)   │                  └─────────────┘
         └───────────────┘
                 ▲
                 │
         ┌───────┴───────────────────────────────────┐
         │                                           │
         ▼                                           ▼
┌──────────────────┐                        ┌──────────────────┐
│ Webhook Listener │ ← Bearer Token 인증    │ Workflow Engine  │
│   :4000          │                        │ (사용자별 API 키)│
└──────────────────┘                        └──────────────────┘
```

## 🛠️ 트러블슈팅

### 로그인 실패

**증상**: Google 로그인 후 에러

**해결**:
1. `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET` 확인
2. Google Cloud Console에서 리디렉션 URI 확인
3. `ALLOWED_WORKSPACE_DOMAINS`에 도메인이 포함되어 있는지 확인

### API 키 저장 실패

**증상**: `CREDENTIAL_ENCRYPTION_KEY` 에러

**해결**:
```bash
# 새 암호화 키 생성
node scripts/generate-secrets.js

# .env에 추가하고 Auth Service 재시작
docker-compose -f docker-compose.test.yml restart auth-service
```

### 워크플로우에서 사용자 API 키 사용 안 됨

**증상**: 기본 API 키 사용됨

**해결**:
1. 웹훅 요청에 Bearer 토큰 포함 확인
2. Workflow Engine 로그 확인:
   ```bash
   docker-compose -f docker-compose.test.yml logs workflow-engine | grep "user-specific"
   ```
3. 사용자가 API 키를 등록했는지 확인

## 📚 다음 단계

1. **Dashboard UI 구축**: 로그인, 자격증명 관리 화면
2. **추가 워크플로우 구현**: Jira, GitHub, Datadog 워크플로우
3. **프로덕션 배포**: HTTPS, 관리형 DB, 비밀 관리

## 🔗 관련 문서

- [SETUP.md](./SETUP.md) - 기본 시스템 설정
- [README.md](./README.md) - 프로젝트 개요
- [Google OAuth 문서](https://developers.google.com/identity/protocols/oauth2)
