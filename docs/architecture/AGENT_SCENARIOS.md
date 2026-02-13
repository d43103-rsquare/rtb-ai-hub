# OpenClaw Agent 시나리오 기반 시뮬레이션

## 개요

7개 Agent가 실제 협업하는 시나리오를 정의합니다. 각 시나리오는 Trigger → Collaboration → Result의 흐름을 따릅니다.

---

## 시나리오 1: 로그인 기능 개발

### 개요

가장 일반적인 개발 시나리오입니다. PM의 초기 요구사항부터 배포까지 전 과정을 시뮬레이션합니다.

### Timeline: 45분

```
T+0분    T+10분   T+20분   T+30분   T+40분   T+45분
  │        │        │        │        │        │
  ▼        ▼        ▼        ▼        ▼        ▼
Trigger  Planning  Design   Dev      QA     Deploy
  │        │        │        │        │        │
 PM     System   UX/UI   Backend  QA      Ops
 Agent   Planner  Dev     +UI Dev  Agent   Agent
         Agent    Agents
```

### Phase 1: Trigger (0-2분)

**실제 사용자 입력:**

```
[Slack #product-channel]
👤 실제 PM: "@openclaw 로그인 기능이 필요해요.
사용자들이 계정을 만들고 로그인할 수 있게 해주세요.
2주 안에 MVP 출시가 목표입니다."
```

**OpenClaw 응답:**

```
🤖 OpenClaw: "로그인 기능 개발을 시작하겠습니다.
PM Agent를 호출하여 요구사항을 분석하겠습니다..."
```

### Phase 2: PM Agent 분석 (2-7분)

**PM Agent (VisionKeeper) 사고 과정:**

```
💭 Analysis:
• 사용자 문제: 신규/기존 사용자 접근성
• 비즈니스 가치: 사용자 참여도 증가, 데이터 수집
• 제약사항: 2주 MVP, 보안 필수

💭 Scope Definition:
✓ IN SCOPE:
  - 이메일/비밀번호 회원가입
  - 이메일/비밀번호 로그인
  - 로그인 세션 관리
  - 기본적인 비밀번호 재설정

✗ OUT OF SCOPE (Phase 2):
  - 소셜 로그인 (Google, Kakao)
  - 2FA/MFA
  - SSO 통합

💭 Success Criteria:
1. 로그인 성공률 95%+
2. 평균 로그인 시간 < 3초
3. 회원가입 완료율 70%+
4. 보안 취약점 없음
```

**PM Agent → Slack:**

```
🎯 PM Agent (VisionKeeper):

📋 PROJ-123 분석 완료

사용자 가치:
• 신규 사용자 온본딩 개선
• 기존 사용자 참여도 증가
• 개인화된 서비스 제공 가능

MVP 범위 (2주):
✓ 이메일/비밀번호 인증
✓ 세션 관리
✓ 비밀번호 재설정
✗ 소셜 로그인 (Phase 2로 이동)

성공 기준:
• 로그인 성공률 95%+
• 로그인 시간 < 3초
• 보안 취약점 0개

System Planner Agent에게 기술 검토를 요청합니다...
```

### Phase 3: System Planner Agent 검토 (7-12분)

**System Planner Agent (BlueprintMaster) 사고 과정:**

```
💭 Architecture Decisions:

1. Authentication Strategy:
   Option A: Session-based (Express-session)
   Option B: JWT (jsonwebtoken)

   Decision: JWT ✓
   Reason: 확장성, 마이크로서비스 대비, 모바일 API 대응

2. Password Hashing:
   - bcrypt with cost factor 12
   - salt 자동 생성

3. Database Changes:
   ALTER TABLE users ADD COLUMN:
   - email (unique, indexed)
   - password_hash (varchar(255))
   - email_verified_at (timestamp)
   - failed_login_attempts (int)
   - locked_until (timestamp)

4. API Design:
   POST /api/v1/auth/register
   POST /api/v1/auth/login
   POST /api/v1/auth/logout
   POST /api/v1/auth/refresh
   POST /api/v1/auth/forgot-password
   POST /api/v1/auth/reset-password

5. Security Considerations:
   - Rate limiting: 5 requests/minute per IP
   - CORS 설정
   - HTTPS only
   - Input validation (zod)
   - SQL injection 방지 (prepared statements)
```

**System Planner → Slack:**

````
🏗️ System Planner Agent (BlueprintMaster):

아키텍처 제안:

🔐 인증: JWT (Access + Refresh Token)
• 확장성 우수, 모바일 대응
• 추후 소셜 로그인 통합 용이

🗄️ DB 스키마:
```sql
ALTER TABLE users ADD COLUMN:
  - email (UNIQUE, INDEX)
  - password_hash (bcrypt)
  - email_verified_at
  - login_attempts
````

🌐 API 엔드포인트:
• POST /auth/register
• POST /auth/login
• POST /auth/refresh
• POST /auth/forgot-password

⚠️ 트레이드오프:
✓ Session 대비 확장성 ↑
✓ 추후 소셜 로그인 대비
⚠️ Token 관리 복잡성

UX Designer Agent에게 사용자 흐름 설계를 요청합니다...

```

### Phase 4: UX Designer Agent 설계 (12-18분)

**UX Designer Agent (ExperienceCraftsman) 작업:**
```

💭 User Flow Design:

회원가입 흐름:

1. Landing → 이메일 입력
   - 실시간 이메일 형식 검증
   - 중복 이메일 체크 (debounced)
2. 비밀번호 설정
   - 강도 표시 (Weak/Moderate/Strong)
   - 요구사항: 8자+, 대소문자, 숫자
3. 비밀번호 확인
   - 일치 여부 실시간 표시
4. 약관 동의
   - 전체 동의 + 개별 선택
5. 가입 완료
   - 환영 메시지
   - 이메일 인증 안내
   - 다음 단계 CTA

로그인 흐름:

1. 이메일 입력 (자동완성 지원)
2. 비밀번호 입력 (표시/숨김 토글)
3. "Remember me" 옵션
4. 로그인 버튼 (로딩 상태)
5. 성공 시 리다이렉트

에러 처리:
• 잘못된 이메일 형식
• 비밀번호 불일치
• 계정 없음
• 계정 잠김

```

**UX Designer → Slack:**
```

🎨 UX Designer Agent (ExperienceCraftsman):

사용자 흐름 설계 완료:

📱 회원가입 (5단계):
1️⃣ 이메일 입력
└─ 실시간 중복 체크

2️⃣ 비밀번호 설정
└─ 강도 표시 (Weak/Moderate/Strong)

3️⃣ 비밀번호 확인
4️⃣ 약관 동의
5️⃣ 완료 + 이메일 인증 안내

🔑 로그인:
이메일 → 비밀번호 → [Remember me] → 로그인

♿ 접근성:
• 키보드 네비게이션
• 스크린 리더 지원
• ARIA 라벨

Developer Agents에게 핸드오프합니다...

```

### Phase 5: 개발 (18-35분)

**Backend Dev Agent (DataGuardian) + UI Dev Agent (PixelPerfect) 병렬 작업:**

**Backend Dev 진행:**
```

💭 Backend Implementation Plan:

Task 1: Database Migration (5분)

- CREATE MIGRATION add_auth_fields_to_users
- 테스트 데이터 검증

Task 2: Auth Service (10분)

- AuthService class
- register(), login(), refreshToken()
- Password hashing with bcrypt
- JWT token generation

Task 3: API Routes (5분)

- Express routes with validation
- Error handling middleware
- Rate limiting

Task 4: Tests (5분)

- Unit tests for AuthService
- Integration tests for API

```

**UI Dev 진행:**
```

💭 Frontend Implementation Plan:

Task 1: Components (10분)

- LoginForm.tsx
- RegisterForm.tsx
- PasswordInput (with strength meter)
- AuthLayout.tsx

Task 2: Hooks (5분)

- useAuth()
- useLogin()
- useRegister()

Task 3: Integration (5분)

- API client setup
- Form validation (react-hook-form + zod)
- Error handling

```

**개발 완료 후 Slack:**
```

💻 Backend Dev Agent (DataGuardian):
✅ API 구현 완료

엔드포인트:
• POST /auth/register - 201 Created
• POST /auth/login - 200 OK + Tokens
• POST /auth/refresh - 200 OK
• POST /auth/forgot-password - 202 Accepted

보안:
• bcrypt (cost: 12)
• JWT (access: 15min, refresh: 7d)
• Rate limiting: 5req/min

테스트:
• Unit: 12개 ✅
• Integration: 8개 ✅
• Coverage: 87%

---

🎨 UI Dev Agent (PixelPerfect):
✅ UI 구현 완료

컴포넌트:
• LoginForm (반응형)
• RegisterForm (5단계)
• PasswordStrengthMeter

성능:
• First Paint: 1.2s
• Bundle: +45KB (gzipped)
• Lighthouse: 92점

접근성:
• WCAG 2.1 AA 준수
• 키보드 네비게이션 ✅

QA Agent에게 테스트를 요청합니다...

```

### Phase 6: QA Agent 테스트 (35-40분)

**QA Agent (QualityGatekeeper) 테스트:**
```

💭 Test Plan:

1. Functional Testing:
   ✓ 회원가입 성공
   ✓ 회원가입 실패 (중복 이메일)
   ✓ 로그인 성공
   ✓ 로그인 실패 (잘못된 비밀번호)
   ✓ 로그인 실패 (존재하지 않는 계정)
   ✓ 토큰 갱신
   ✓ 로그아웃

2. Edge Cases:
   ✓ SQL injection 시도
   ✓ XSS 시도
   ✓ Rate limiting 테스트
   ✓ Very long password (>100 chars)
   ✓ Unicode 이메일

3. Performance Testing:
   ✓ 로그인 API 응답 시간: avg 180ms
   ✓ 100 concurrent users

4. Accessibility Testing:
   ✓ 스크린 리더 테스트
   ✓ 키보드 네비게이션
   ✓ 색상 대비

```

**QA Agent → Slack:**
```

🧪 QA Agent (QualityGatekeeper):

테스트 결과:

✅ 통과: 28개
⚠️ 주의: 2개
❌ 실패: 0개

통과 항목:
• 모든 기능 시나리오
• 보안 취약점 테스트
• 성능 테스트
• 접근성 테스트

주의 항목:

1. 비밀번호 재설정 이메일이 스팸함으로 감 (Acceptable)
2. 모바일 Safari에서 input zoom 발생 (Minor)

품질 게이트: ✅ PASSED

Ops Agent에게 배포를 요청합니다...

```

### Phase 7: 배포 (40-45분)

**Ops Agent (InfrastructureKeeper) 배포:**
```

⚙️ Ops Agent (InfrastructureKeeper):

배포 진행:

1️⃣ CI/CD 파이프라인
✓ Lint passed
✓ Tests passed (28/28)
✓ Build successful
✓ Docker image pushed

2️⃣ Database Migration
✓ Migration applied successfully
✓ Rollback plan verified

3️⃣ Deployment (int)
✓ Blue-green deployment
✓ Health check passed
✓ Old version scaled down

4️⃣ 모니터링
📊 Error rate: 0%
📊 Response time: p95 220ms
📊 CPU usage: 35%

✅ int 환경 배포 완료
URL: https://int.rtb.com/login

---

🎉 최종 보고서:

PROJ-123 로그인 기능 개발 완료

⏱️ 소요 시간: 45분 (Agent 협업)
📦 배포 환경: int
✅ 품질 게이트: PASSED

구현된 기능:
✓ 이메일/비밀번호 회원가입
✓ 이메일/비밀번호 로그인
✓ JWT 세션 관리
✓ 비밀번호 재설정
✓ 반응형 UI

다음 단계:
• 실제 팀원 검토
• stg 환경 배포 (승인 필요)
• 소셜 로그인 (Phase 2)

````

### 결과물

```yaml
# 최종 산출물

deliverables:
  documentation:
    - api_specification.md
    - db_schema_changes.md
    - user_flow_diagrams.md

  code:
    backend:
      - auth.service.ts
      - auth.controller.ts
      - auth.routes.ts
      - jwt.middleware.ts
      - 20240115_add_auth_fields.sql
    frontend:
      - LoginForm.tsx
      - RegisterForm.tsx
      - useAuth.ts
      - auth.api.ts

  tests:
    - auth.unit.test.ts
    - auth.integration.test.ts
    - auth.e2e.test.ts

  deployment:
    - docker_image: rtb-app:v1.2.0
    - migration_status: applied
    - monitoring_dashboard: [link]

metrics:
  development_time: "45 minutes (agent collaboration)"
  human_review_time: "15 minutes (estimated)"
  test_coverage: "87%"
  performance: "p95 220ms"
  bugs_found: 0
````

---

## 시나리오 2: 장애 대응 (Incident Response)

### 개요

Datadog P1 알림 발생 시 Agent들이 자동으로 대응하는 시나리오입니다.

### Timeline: 20분

```
T+0    T+2    T+5    T+10   T+15   T+20
 │      │      │      │      │      │
 ▼      ▼      ▼      ▼      ▼      ▼
Alert  Triage  Fix   Verify  Deploy Close
 │      │      │      │      │      │
Datadog Ops+   Backend QA     Ops    PM
         Dev
```

### Phase 1: Alert (0분)

**Datadog Alert:**

```
🔴 P1 ALERT: auth-service

Error Rate: 45% (> threshold 5%)
Latency: p95 8s (> threshold 2s)
Affected Users: 1,200+

Error Pattern:
TypeError: Cannot read property 'email' of undefined
    at /app/services/auth.service.js:45:12
```

**OpenClaw 자동 응답:**

```
🚨 Incident Response Activated

Alert ID: INC-2026-0115-001
Severity: P1
Service: auth-service
Detected: 2026-01-15 14:23:00 KST

Ops Agent와 Backend Dev Agent를 호출합니다...
```

### Phase 2: Ops Agent + Backend Dev Agent 협업 (2-5분)

**Ops Agent 초기 분석:**

```
⚙️ Ops Agent (InfrastructureKeeper):

초기 분석:

📊 메트릭스 (14:23 KST):
• Error Rate: 45% → 급증 시작: 14:18
• CPU: 85% (평소 40%)
• Memory: 70% (정상)
• DB Connections: 150/200

🔍 로그 패턴:
14:18:05 - First error
14:18:30 - Error rate > 10%
14:19:00 - Error rate > 30%

💡 잠정적 원인:
• 14:15에 배포된 v1.2.1
• DB connection pool 증가
• auth.service.js:45 에러 집중

Backend Dev Agent에게 코드 분석을 요청합니다...
```

**Backend Dev Agent 코드 분석:**

````
💻 Backend Dev Agent (DataGuardian):

코드 분석:

🔍 문제 위치: auth.service.js:45
```javascript
// v1.2.1 변경사항
const user = await db.users.findByEmail(email);
// Line 45: return { email: user.email }; // ← 여기!
````

💥 Root Cause:
v1.2.1에서 사용자 조회 실패 시
null 반환 → null.email 접근 → TypeError

🛠️ Fix:

```javascript
const user = await db.users.findByEmail(email);
if (!user) {
  throw new AuthError('USER_NOT_FOUND');
}
return { email: user.email };
```

⚡ 긴급 조치:

1. DB connection pool 즉시 확장 (200→300)
2. Null check hotfix 배포
3. Error rate 모니터링

Ops Agent에게 배포 승인을 요청합니다...

```

### Phase 3: 긴급 수정 및 배포 (5-10분)

**Ops Agent 긴급 배포:**
```

⚙️ Ops Agent (InfrastructureKeeper):

긴급 배포 진행:

1️⃣ Hotfix Branch: hotfix/auth-null-check
✓ Commit: fix(auth): add null check for user lookup
✓ CI: Tests passed (32/32)

2️⃣ 배포 (롤링 업데이트):
Pod 1/3: Updated, Health check ✅
Pod 2/3: Updated, Health check ✅
Pod 3/3: Updated, Health check ✅

3️⃣ 모니터링 (14:28 KST):
📉 Error Rate: 45% → 0.5%
📉 Latency: p95 8s → 180ms
✅ Recovery confirmed

QA Agent에게 검증을 요청합니다...

```

### Phase 4: QA 검증 (10-15분)

**QA Agent 검증:**
```

🧪 QA Agent (QualityGatekeeper):

회귀 테스트:
✅ 로그인 성공
✅ 로그인 실패 (존재하지 않는 사용자)
✅ 로그인 실패 (잘못된 비밀번호)
✅ 회원가입
✅ 토큰 갱신

에러 시나리오:
✅ 존재하지 않는 이메일 → 401 (이전: 500)
✅ 잘못된 비밀번호 → 401
✅ 빈 이메일 → 400

성능:
✅ p95 latency < 200ms
✅ Error rate < 1%

✅ 검증 완료

```

### Phase 5: 사후 분석 및 문서화 (15-20분)

**Ops Agent 보고서:**
```

📋 Incident Report: INC-2026-0115-001

⏱️ Timeline:
14:15 - v1.2.1 배포
14:18 - First error detected
14:23 - P1 Alert triggered
14:25 - Root cause identified
14:28 - Hotfix deployed
14:32 - Recovery confirmed

🎯 Root Cause:
v1.2.1에서 사용자 조회 실패 시 null 체크 누락

🛠️ Resolution:
auth.service.js에 null check 추가

💡 Action Items:

1. [Backend Dev] 모든 service layer null check 검토
2. [QA] Edge case 테스트 케이스 추가
3. [Ops] Canary deployment 도입 검토

📊 Impact:
• Duration: 17 minutes
• Affected Users: 1,247명
• Data Loss: None
• Revenue Impact: Minimal

✅ Incident Closed

```

---

## 시나리오 3: 신규 입사자 온보딩

### 개요
신규 백엔드 개발자가 입사했을 때, Agent들이 구조화된 온보딩을 제공하는 시나리오입니다.

### Timeline: 4주

```

Week 1 Week 2 Week 3 Week 4
│ │ │ │
▼ ▼ ▼ ▼
Setup Domain First Independent
& Env Knowledge Ticket Contribution
│ │ │ │
Ops+ PM+ Backend All
Backend System +QA Agents
Agent Planner

```

### Day 1: Setup (Ops Agent + Backend Dev Agent)

**신규 입사자:**
```

👤 신규 개발자 (김신규):
"안녕하세요, 백엔드 개발자 김신규입니다.
어디서부터 시작하면 될까요?"

```

**Ops Agent 응답:**
```

⚙️ Ops Agent (InfrastructureKeeper):

환영합니다, 김신규님! 🎉

📋 Day 1 체크리스트:

1️⃣ 개발 환경 설정
✓ GitHub 초대장 발송
✓ Notion 권한 부여
✓ VPN 계정 생성

2️⃣ 도구 설치
• Node.js 20.x
• Docker Desktop
• PostgreSQL 15
• Redis (local)

3️⃣ 프로젝트 클론

```bash
git clone git@github.com:rtb/product.git
cd product
pnpm install
pnpm db:setup
pnpm dev
```

4️⃣ Wiki 필수 문서
📚 읽을 것: RTB_CONTEXT.md
📚 읽을 것: DEVELOPMENT_GUIDE.md

질문이 있으면 언제든지 물어보세요!

```

### Day 2-3: 도메인 교육 (PM Agent + System Planner Agent)

**PM Agent 도메인 소개:**
```

🎯 PM Agent (VisionKeeper):

RTB 비즈니스 소개:

🏢 우리는 부동산 테크 회사입니다.

핵심 도메인:

1. obj (Object/빌딩)
   - 빌딩, 유닛(호실), 필지 관리
   - 예: obj_bld_mst, obj_unit_mst

2. prd (Product/매물)
   - 임대/매매 매물 정보
   - 예: prd_pdm_mst, prd_img_mst

3. gtd (Deal/계약)
   - 거래 진행, 계약 관리
   - 예: gtd_deal_mst, gtd_task_mst

4. mbr (Member/회원)
   - 거래처, 담당자 관리

사용자 유형:
• 중개사: 매물 등록, 거래 진행
• 임차인/매수인: 매물 검색, 문의
• 관리자: 승인, 통계

```

**System Planner Agent 기술 아키텍처:**
```

🏗️ System Planner Agent (BlueprintMaster):

시스템 아키텍처:

┌─────────────────────────────────────┐
│ Frontend (Next.js) │
│ - React, TypeScript, Tailwind │
└──────────────┬──────────────────────┘
│ API (REST/GraphQL)
▼
┌─────────────────────────────────────┐
│ Backend (Node.js) │
│ - Express, TypeScript │
│ - Layered Architecture │
│ ├─ Controller │
│ ├─ Service │
│ ├─ Repository │
│ └─ Entity │
└──────────────┬──────────────────────┘
│
┌───────┴───────┐
▼ ▼
┌──────────────┐ ┌──────────────┐
│ PostgreSQL │ │ Redis │
│ - manage DB │ │ - Session │
│ - gokr DB │ │ - Cache │
└──────────────┘ └──────────────┘

코딩 표준:
• TypeScript strict mode
• ESLint + Prettier
• Test coverage 80%+
• PR 리뷰 필수

질문 있으시면 Backend Dev Agent에게 연결해드립니다.

```

### Week 2: 첫 티켓 (Backend Dev Agent 멘토링)

**Backend Dev Agent 할당:**
```

💻 Backend Dev Agent (DataGuardian):

첫 번째 티켓을 준비했습니다!

🎫 GOOD-FIRST-ISSUE: PROJ-456
"사용자 프로필 조회 API 추가"

요구사항:
• GET /api/v1/users/:id/profile
• 응답: { id, email, name, createdAt }
• 인증 필요

학습 포인트:
• Express 라우트 설정
• Service layer 패턴
• JWT 인증 미들웨어
• 단위 테스트 작성

👨‍🏫 멘토링 방식:

1. 먼저 스스로 구현 시도 (2시간)
2. 질문은 언제든지 환영
3. 코드 리뷰는 상세히 제공
4. Best practice 공유

시작하시겠습니까?

```

### Week 3-4: 독립적 기여

**QA Agent 테스트 승인:**
```

🧪 QA Agent (QualityGatekeeper):

✅ 첫 PR 승인 축하합니다!

PR #123 "사용자 프로필 조회 API"

리뷰 결과:
✓ 코드 품질: Excellent
✓ 테스트 커버리지: 92%
✓ 성능: p95 45ms
✓ 문서화: 완료

개선 제안 (선택):
• N+1 쿼리 방지를 위해 join 사용 검토
• 캐싱 적용 가능성

다음 단계:
• stg 환경 배포
• Production 배포 예정 (목요일)

잘하셨습니다! 🎉

````

### 온보딩 완료 보고서

```yaml
onboarding_report:
  employee: "김신규"
  role: "Backend Developer"
  period: "4 weeks"

  completed:
    week_1:
      - "개발 환경 설정"
      - "도메인 지식 습득"
      - "Wiki 필독 완료"

    week_2:
      - "첫 티켓 완료 (프로필 API)"
      - "코드 리뷰 참여"
      - "팀 미팅 참석"

    week_3:
      - "두 번째 티켓 (독립 진행)"
      - "PR 2개 머지"
      - "테스트 작성 능력 향상"

    week_4:
      - "Production 배포 참여"
      - "온콜 로테이션 준비"
      - "멘토링 문서화"

  metrics:
    tickets_completed: 5
    prs_merged: 4
    code_reviews: 8
    test_coverage_avg: 88%

  feedback:
    strengths:
      - "빠른 학습 능력"
      - "꼼꼼한 테스트 작성"
      - "활발한 질문"

    improvements:
      - "성능 최적화 심화 학습"
      - "Error handling 패턴"

  next_steps:
    - "System Planner Agent와 아키텍처 학습"
    - "성능 튜닝 워크숍 참석"
    - "다음 신규 입사자 멘토링"

  status: "✅ 온보딩 완료 - 독립적 기여 가능"
````

---

## 시나리오 비교

| 시나리오    | 소요 시간 | 참여 Agent | 복잡도     | 실제 가치 |
| ----------- | --------- | ---------- | ---------- | --------- |
| 로그인 개발 | 45분      | 7개 Agent  | ⭐⭐⭐⭐   | 높음      |
| 장애 대응   | 20분      | 4개 Agent  | ⭐⭐⭐⭐⭐ | 매우 높음 |
| 온보딩      | 4주       | 5개 Agent  | ⭐⭐⭐     | 중간      |

---

## 다음 단계

1. **OpenClaw 설정 파일 작성**: 이 시나리오를 실행 가능한 설정으로 변환
2. **구현 우선순위**: PoC로 구현할 시나리오 선택

계속 진행하시겠습니까?
