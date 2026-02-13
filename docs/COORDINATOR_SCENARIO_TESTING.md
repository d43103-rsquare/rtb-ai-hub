# Team AI Coordinator 시나리오 테스트 가이드

> **Communication Coordinator의 9개 기능을 로컬에서 실제 동작 시나리오로 테스트하는 방법**

---

## 📋 목차

1. [구현 현황](#-구현-현황)
2. [환경 설정](#-1단계-환경-설정)
3. [시나리오 테스트](#-2단계-시나리오-테스트)
4. [통합 시나리오](#-3단계-통합-시나리오-테스트)
5. [검증 방법](#-4단계-검증-방법)
6. [트러블슈팅](#-트러블슈팅)

---

## 📊 구현 현황

**Phase A+B+C 전체 구현 완료** (2026-02-11)

| Phase | 기능                     | 상태 | 테스트 | 트리거 방식           |
| ----- | ------------------------ | ---- | ------ | --------------------- |
| A-1   | Role-aware Notifications | ✅   | 15개   | 이벤트 기반 (즉시)    |
| A-2   | PR Context Enrichment    | ✅   | 22개   | PR 생성 시 (즉시)     |
| A-3   | Daily Team Digest        | ✅   | 17개   | BullMQ 크론 (매일)    |
| B-1   | Cross-Reference Engine   | ✅   | 19개   | DB CRUD (즉시)        |
| B-2   | Smart Handoff            | ✅   | 14개   | Jira 상태 변경 (즉시) |
| B-3   | Blocker Detection        | ✅   | 19개   | BullMQ 크론 (2회/일)  |
| C-1   | Impact Analysis          | ✅   | 40개   | PR 생성 시 (즉시)     |
| C-2   | Decision Journal         | ✅   | 26개   | PR/Jira 댓글 감지     |
| C-3   | Meeting Prep             | ✅   | 20개   | BullMQ 크론 (1회/일)  |

**총 192개 테스트**, 474개 전체 테스트 중

---

## 🚀 1단계: 환경 설정

### 1-1. .env.coordinator 파일 생성

프로젝트 루트에 `.env.coordinator` 파일을 생성하고 다음 내용을 추가합니다:

```bash
cat > .env.coordinator << 'EOF'
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TEAM AI COORDINATOR — 전체 활성화 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─── Slack 연동 (필수) ──────────────────────────────────────────────
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
OPENCLAW_NOTIFY_ENABLED=true
OPENCLAW_NOTIFY_CHANNEL=C0123456789  # 기본 채널 (fallback)

# ─── Phase A: Quick Wins ────────────────────────────────────────────

# A-1: 역할별 맞춤 알림
TEAM_ROLE_CHANNELS=designer=C01234,developer=C05678,reviewer=C09012,qa=C03456,pm=C04567,lead=C05890

# A-2: PR 맥락 자동 첨부 (항상 활성화, flag 없음)

# A-3: 일일 팀 다이제스트
TEAM_DIGEST_ENABLED=true
TEAM_DIGEST_CRON="0 0 * * 1-5"        # 평일 오전 9시 (KST)
TEAM_DIGEST_CHANNEL=C0123456789       # 다이제스트 전용 채널

# ─── Phase B: Team Intelligence ────────────────────────────────────

# B-1: 맥락 연결 엔진 (항상 활성화, flag 없음)

# B-2: 스마트 핸드오프
SMART_HANDOFF_ENABLED=true

# B-3: 블로커 감지
BLOCKER_DETECTION_ENABLED=true
BLOCKER_CHECK_CRON="0 2,6 * * 1-5"    # 평일 오전 11시, 오후 3시 (KST)
BLOCKER_STALE_DAYS=3                  # 3일 이상 정체된 티켓
BLOCKER_STALE_WARNING_DAYS=2          # 2일부터 경고
BLOCKER_REVIEW_DELAY_HOURS=24         # 24시간 이상 리뷰 대기
BLOCKER_REVIEW_CRITICAL_HOURS=48      # 48시간 이상은 critical
BLOCKER_ALERT_CHANNEL=C0123456789     # 블로커 알림 채널

# ─── Phase C: Decision Facilitation ────────────────────────────────

# C-1: PR 영향 분석
IMPACT_ANALYSIS_ENABLED=true
IMPACT_SIMILAR_CHANGE_LIMIT=10        # 유사 변경 검색 개수
IMPACT_HIGH_THRESHOLD=10              # 10개 이상 파일 변경 = high risk
IMPACT_MEDIUM_THRESHOLD=3             # 3~9개 파일 = medium risk

# C-2: 의사결정 저널
DECISION_JOURNAL_ENABLED=true
DECISION_CONFIDENCE_THRESHOLD=0.7     # 70% 이상 신뢰도만 기록
DECISION_WEEKLY_DIGEST_DAY=1          # 월요일에 주간 다이제스트

# C-3: 회의 준비 자동화
MEETING_PREP_ENABLED=true
DAILY_SCRUM_PREP_CRON="50 23 * * 0-4" # 평일 전날 밤 11:50 (KST)
SPRINT_REVIEW_PREP_HOURS=24           # 스프린트 종료 24시간 전
MEETING_PREP_CHANNEL=C0123456789      # 회의 준비 채널

# ─── 로컬 테스트용 크론 설정 (빠른 트리거) ─────────────────────────
# 실제 운영에서는 위의 기본값 사용. 로컬 테스트 시 아래 주석 해제:

# TEAM_DIGEST_CRON="*/5 * * * *"      # 5분마다 실행 (테스트용)
# BLOCKER_CHECK_CRON="*/10 * * * *"   # 10분마다 실행 (테스트용)
# DAILY_SCRUM_PREP_CRON="*/15 * * * *" # 15분마다 실행 (테스트용)

EOF
```

### 1-2. Slack Bot Token 발급

1. **Slack App 생성**: https://api.slack.com/apps
   - **Create New App** → **From scratch**
   - **App Name**: "RTB AI Coordinator"
   - **Workspace**: 귀사의 Slack workspace 선택

2. **Bot Token Scopes 추가**:
   - **OAuth & Permissions** 메뉴로 이동
   - **Scopes** 섹션에서 다음 권한 추가:
     - `chat:write` (메시지 전송)
     - `channels:read` (채널 목록 조회)
     - `users:read` (사용자 정보 조회)

3. **Workspace에 설치**:
   - **Install to Workspace** 버튼 클릭
   - 권한 승인

4. **Bot Token 복사**:
   - **Bot User OAuth Token** (xoxb-로 시작) 복사
   - `.env.coordinator`의 `SLACK_BOT_TOKEN`에 붙여넣기

### 1-3. Slack 채널 ID 확인

**방법 1: Slack 웹에서 확인**

1. Slack 웹 브라우저에서 채널 열기
2. 채널명 우클릭 → **Copy link**
3. URL 끝부분이 채널 ID입니다:
   ```
   https://app.slack.com/client/T01234/C0123456789
                                      ^^^^^^^^^^^
                                      채널 ID
   ```

**방법 2: Slack API로 확인**

```bash
curl https://slack.com/api/conversations.list \
  -H "Authorization: Bearer xoxb-your-bot-token" \
  | jq '.channels[] | {name: .name, id: .id}'
```

### 1-4. Bot을 채널에 초대

각 채널에서 다음 명령어를 입력하여 봇을 초대합니다:

```
/invite @RTB AI Coordinator
```

### 1-5. DB 마이그레이션 실행

Communication Coordinator는 2개의 추가 테이블이 필요합니다:

```bash
# 방법 1: Drizzle Kit 사용 (권장)
pnpm db:push

# 방법 2: SQL 직접 실행
psql -U postgres -d rtb_ai_hub -f drizzle/0003_add_context_links.sql
psql -U postgres -d rtb_ai_hub -f drizzle/0004_add_decision_journal.sql
```

**테이블 확인:**

```bash
psql -U postgres -d rtb_ai_hub -c "\dt"
# context_links 테이블 확인
# decision_journal 테이블 확인
```

### 1-6. 서비스 시작

```bash
# .env.coordinator를 로드하여 서비스 시작
pnpm dev --env-file=.env.coordinator

# 또는 .env.local에 .env.coordinator 내용을 복사 후:
pnpm dev
```

**확인:**

```bash
# workflow-engine 로그에서 스케줄러 시작 메시지 확인
[workflow-engine] DigestScheduler started with cron: 0 0 * * 1-5
[workflow-engine] BlockerScheduler started with cron: 0 2,6 * * 1-5
[workflow-engine] MeetingPrepScheduler started with cron: 50 23 * * 0-4
```

---

## 🧪 2단계: 시나리오 테스트

### Scenario 1: A-1 역할별 맞춤 알림 (즉시 실행)

**목표**: Jira 이슈가 "In Progress"로 변경되면 디자이너/개발자/PM에게 각각 다른 메시지 전송

**실행 방법:**

```bash
# Jira 이슈 상태 변경 시뮬레이션
curl -X POST http://localhost:4000/webhooks/jira?env=int \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "issue_updated",
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "status": { "name": "In Progress" },
        "summary": "디자인 시스템 컴포넌트 구현",
        "issuetype": { "name": "Task" },
        "labels": ["RTB-AI-HUB"]
      }
    },
    "changelog": {
      "items": [
        {
          "field": "status",
          "fromString": "To Do",
          "toString": "In Progress"
        }
      ]
    }
  }'
```

**검증:**

1. **workflow-engine 로그 확인:**

   ```bash
   [workflow-engine] notifyByRole: event=workflow_started, roles=[developer,pm,lead]
   ```

2. **Slack 각 채널 확인:**
   - **C05678 (developer 채널)**:
     ```
     🚀 PROJ-123가 In Progress로 변경됨
     브랜치: feature/PROJ-123-xxx
     CI 실행: 진행 중
     ```
   - **C04567 (pm 채널)**:
     ```
     📊 PROJ-123 개발 시작
     예상 완료: 2일 후
     스프린트 진행률: 60% → 65%
     ```
   - **C05890 (lead 채널)**:
     ```
     📈 PROJ-123 착수
     담당자: 박개발
     현재 In Progress: 5개 → 6개
     ```

---

### Scenario 2: A-2 PR 맥락 자동 첨부 (즉시 실행)

**목표**: PR 생성 시 Jira/Figma/Wiki 맥락이 자동으로 PR body에 추가됨

**실행 방법:**

```bash
# 1. 로컬 브랜치 생성 + 코드 변경
git checkout -b feature/PROJ-123-design-system
echo "// 테스트 코드" > test.ts
git add test.ts
git commit -m "[PROJ-123] Add design system component"
git push origin feature/PROJ-123-design-system

# 2. GitHub PR 생성
gh pr create \
  --title "feat: Add design system component" \
  --body "Implements PROJ-123" \
  --base develop
```

**검증:**

GitHub PR 페이지에서 자동으로 추가된 섹션 확인:

```markdown
## 🎯 Jira Context

- **Issue**: [PROJ-123](https://rsquare.atlassian.net/browse/PROJ-123)
- **Summary**: 디자인 시스템 컴포넌트 구현
- **Type**: Task
- **Status**: In Progress

## 🎨 Figma Context

- **Design file**: [Design System v2](https://figma.com/file/abc123)
- **Components**: Button, Input, Card
- **Last updated**: 2026-02-10

## 📚 Wiki Knowledge

- RTB 디자인 시스템 가이드 (design-system.md)
- 컴포넌트 네이밍 규칙 (component-naming.md)
- 테이블 참조: obj_component_mst, prd_design_mst

## ✅ CI/CD Status

- **Lint**: ✅ Passed
- **Test**: ✅ Passed (52 tests)
- **Build**: ✅ Passed (3.2s)
```

---

### Scenario 3: B-1 맥락 연결 엔진 (즉시 실행)

**목표**: Jira↔Figma↔GitHub↔Preview↔Deploy 간 관계가 DB에 자동 저장됨

**실행 방법:**

```bash
# 1. Scenario 1+2 실행하여 Jira 이슈 + PR 생성

# 2. 맥락 조회 API 호출
curl http://localhost:4000/api/context/PROJ-123 | jq .
```

**검증:**

**API 응답:**

```json
{
  "jiraKey": "PROJ-123",
  "figmaUrl": "https://figma.com/file/abc123",
  "figmaNodeId": "123:456",
  "githubPrs": [
    {
      "number": 42,
      "url": "https://github.com/dev-rsquare/rtb-v2-mvp/pull/42",
      "branch": "feature/PROJ-123-design-system",
      "status": "open"
    }
  ],
  "previews": [
    {
      "url": "http://localhost:5100",
      "branch": "feature/PROJ-123-design-system",
      "status": "running"
    }
  ],
  "deployments": [],
  "wikiPages": ["design-system.md", "component-guide.md"],
  "createdAt": "2026-02-12T01:30:00Z",
  "updatedAt": "2026-02-12T01:35:00Z"
}
```

**PostgreSQL 직접 확인:**

```bash
psql -U postgres -d rtb_ai_hub -c "
  SELECT jira_key, figma_url, github_prs::text, created_at
  FROM context_links
  WHERE jira_key = 'PROJ-123';
"
```

---

### Scenario 4: B-2 스마트 핸드오프 (즉시 실행)

**목표**: Jira 상태가 "In Progress" → "Code Review"로 변경되면 리뷰어에게 브리핑 전송

**실행 방법:**

```bash
# Jira 상태 변경 시뮬레이션 (개발 완료 → 리뷰 요청)
curl -X POST http://localhost:4000/webhooks/jira?env=int \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "issue_updated",
    "issue": {
      "key": "PROJ-123",
      "fields": {
        "status": { "name": "Code Review" },
        "summary": "디자인 시스템 컴포넌트 구현",
        "issuetype": { "name": "Task" }
      }
    },
    "changelog": {
      "items": [
        {
          "field": "status",
          "fromString": "In Progress",
          "toString": "Code Review"
        }
      ]
    }
  }'
```

**검증:**

1. **workflow-engine 로그:**

   ```bash
   [workflow-engine] Smart handoff triggered: In Progress → Code Review
   [workflow-engine] Generating briefing for reviewer...
   ```

2. **Slack C09012 (reviewer 채널)에 메시지 도착:**

   ```
   📋 PROJ-123 업무 인수 브리핑 — In Progress → Code Review

   👤 담당자: 박개발 → 김리뷰

   ━━━ 📝 구현 요약 ━━━
   • PR: #42 (feature/PROJ-123-design-system)
   • 변경 파일: 5개 (Button.tsx, Input.tsx, Card.tsx, ...)
   • 테스트: 12개 추가 (100% 커버리지)
   • CI 상태: ✅ 모두 통과

   ━━━ 🔍 리뷰 포인트 ━━━
   • Figma 디자인과 일치 여부 확인
   • RTB 디자인 시스템 규칙 준수 여부 (wiki: design-system.md)
   • 접근성(A11y) 체크리스트 통과 여부
   • 컴포넌트 재사용성 검토

   ━━━ 🔗 관련 링크 ━━━
   • Jira: https://rsquare.atlassian.net/browse/PROJ-123
   • PR: https://github.com/dev-rsquare/rtb-v2-mvp/pull/42
   • Figma: https://figma.com/file/abc123
   • Preview: http://localhost:5100
   • Wiki: design-system.md, component-guide.md
   ```

---

### Scenario 5: A-3 일일 팀 다이제스트 (크론 스케줄)

**목표**: 매일 아침 팀 현황을 자동으로 Slack에 전송

**실행 방법 (빠른 테스트):**

```bash
# 1. 크론 간격을 5분으로 변경 (.env.coordinator 수정)
TEAM_DIGEST_CRON="*/5 * * * *"

# 2. workflow-engine 재시작
pkill -f workflow-engine
pnpm dev:workflow

# 3. 5분 후 자동 실행 대기
```

**또는 즉시 실행 (테스트 API 추가 시):**

```bash
curl -X POST http://localhost:4000/api/test/trigger-digest
```

**검증:**

Slack TEAM_DIGEST_CHANNEL에 메시지 도착:

```
📊 팀 다이제스트 — 2026-02-12 (수)

━━━ 🎯 스프린트 현황 ━━━
Sprint 24: 12/20 완료 (60%)
• 완료: 12개 (60 SP)
• 진행중: 5개 (25 SP)
• 대기: 3개 (15 SP)
• 목표 달성률: 85% (예상)

━━━ 📈 GitHub 활동 ━━━
• PR 생성: 3개
• PR 머지: 2개
• 리뷰 대기: 4개 (평균 18시간 대기)
• 활발한 기여자: 박개발(5 commits), 김백엔드(3 commits)

━━━ 🚀 배포 현황 ━━━
• int: v1.2.3 (정상) — 최근 배포: 2시간 전
• stg: v1.2.2 (정상) — 최근 배포: 1일 전
• prd: v1.2.1 (정상) — 최근 배포: 3일 전

━━━ ⚠️ 주의 필요 ━━━
• PROJ-111: 3일째 In Progress (블로커 의심)
• PROJ-99: 리뷰 48시간 대기 중
• PROJ-88: CI 실패 2회 연속

━━━ 🎉 어제의 성과 ━━━
• PROJ-200: 성능 개선 완료 (로딩 시간 40% 단축)
• PROJ-201: UI 리뉴얼 배포 (사용자 만족도 95%)
```

---

### Scenario 6: B-3 블로커 감지 (크론 스케줄)

**목표**: 3일 이상 정체된 티켓을 자동으로 감지하고 알림

**실행 방법 (빠른 테스트):**

```bash
# 1. 정체된 티켓 생성 (3일 전 업데이트)
psql -U postgres -d rtb_ai_hub -c "
  INSERT INTO workflow_executions (id, workflow_type, status, env, input, created_at, updated_at)
  VALUES (
    'test-blocker-1',
    'JIRA_AUTO_DEV',
    'IN_PROGRESS',
    'int',
    '{\"issueKey\": \"PROJ-111\", \"summary\": \"오래된 작업\"}',
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '3 days'
  );
"

# 2. 크론 간격을 10분으로 변경
BLOCKER_CHECK_CRON="*/10 * * * *"

# 3. workflow-engine 재시작 후 10분 대기
```

**또는 즉시 실행:**

```bash
curl -X POST http://localhost:4000/api/test/trigger-blocker-check
```

**검증:**

Slack BLOCKER_ALERT_CHANNEL에 메시지 도착:

```
🚨 블로커 감지 — 2026-02-12 11:00

━━━ ⏸️ 정체된 작업 (2개) ━━━

🔴 CRITICAL — PROJ-111
• 상태: In Progress (4일째)
• 마지막 업데이트: 3일 전
• 담당자: @박개발
• 이슈: PG사 API 응답 없음 (댓글 참조)
• 제안: 일일 스탠드업에서 논의 필요

🟡 WARNING — PROJ-99
• 상태: Code Review (2일째)
• 리뷰어: @김리뷰 (48시간 대기 중)
• PR: #88 (변경 파일 15개)
• 제안: 리뷰 우선순위 상향 또는 추가 리뷰어 지정

━━━ 📋 전체 현황 ━━━
• In Progress 3일 이상: 1개
• Code Review 24시간 이상: 1개
• 블로커 총 개수: 2개

━━━ 💡 조치 방안 ━━━
1. PROJ-111: PG사 고객지원 에스컬레이션
2. PROJ-99: 리뷰어 추가 또는 분할 리뷰
```

---

### Scenario 7: C-1 PR 영향 분석 (즉시 실행)

**목표**: PR 생성 시 변경 영향 범위, 리스크 레벨, 추천 리뷰어를 자동 분석

**실행 방법:**

```bash
# 1. 여러 파일을 수정하는 PR 생성
git checkout -b feature/PROJ-456-refactor

# 10개 파일 수정 (high risk 트리거)
for i in {1..10}; do
  echo "// refactor $i" > "src/component$i.tsx"
done

git add .
git commit -m "[PROJ-456] Refactor components"
git push origin feature/PROJ-456-refactor

# 2. GitHub PR 생성
gh pr create \
  --title "refactor: Component architecture" \
  --body "Refactors PROJ-456"
```

**검증:**

GitHub PR body에 자동 추가된 섹션:

```markdown
## 🎯 Impact Analysis

### 📊 Risk Assessment

**Risk Level**: 🔴 HIGH

- **Files Changed**: 10 (threshold: 3 = medium, 10 = high)
- **Lines Changed**: +450 / -320 = 770 total
- **Module Classification**: UI Components (core module)
- **Past Incidents**: 2 similar changes caused regressions (last 30 days)

### 🔍 Affected Modules

- `src/components/` (10 files)
  - Button.tsx, Input.tsx, Card.tsx, Modal.tsx, ...
- **Critical dependencies**:
  - `Button` (used by 25+ files)
  - `Input` (used by 18+ files)
  - `Form` (used by 12+ files)

### 👥 Recommended Reviewers

1. **김아키텍트** — Component architecture expert
   - Reason: 15 similar reviews, 95% approval rate
   - Expertise: Component design, performance optimization
2. **박시니어** — UI system owner
   - Reason: Authored 60% of changed files
   - Expertise: Design system, accessibility

### ⚠️ Similar Past Changes

- **PR #38** (2025-01-15): Button refactor
  - Result: 3 bugs found in QA (hover state, mobile view)
  - Lesson: Add visual regression tests
- **PR #29** (2025-01-08): Form component rewrite
  - Result: Hotfix needed (validation logic broken)
  - Lesson: Test all form validation scenarios

### ✅ Recommendations

- [ ] Add E2E tests for all affected components
- [ ] Request design review before merge
- [ ] Deploy to staging first, monitor for 24h
- [ ] Add visual regression tests (Percy/Chromatic)
- [ ] Check accessibility compliance (WCAG 2.1 AA)
```

Slack C09012 (reviewer 채널)에도 요약 전송:

```
🎯 High Risk PR — #456 영향 분석

Risk: 🔴 HIGH (10 files, core module)
Reviewers: @김아키텍트 @박시니어
주의: 과거 유사 변경 시 2회 회귀 발생

상세: https://github.com/.../pull/456
```

---

### Scenario 8: C-2 의사결정 저널 (즉시 실행)

**목표**: PR 댓글이나 Jira 댓글에서 기술 의사결정을 자동 감지하고 기록

**실행 방법:**

```bash
# PR 댓글 시뮬레이션 (의사결정 키워드 포함)
curl -X POST http://localhost:4000/webhooks/github?env=int \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issue_comment" \
  -d '{
    "action": "created",
    "issue": {
      "number": 42,
      "pull_request": {}
    },
    "comment": {
      "body": "결정: 상태 관리는 Zustand 대신 Redux Toolkit을 사용하기로 했습니다. 이유: 팀원 대부분이 RTK 경험이 있고, DevTools 지원이 우수하기 때문입니다. @김아키텍트 @박개발 동의",
      "user": { "login": "tech-lead" },
      "created_at": "2026-02-12T01:30:00Z"
    }
  }'
```

**검증:**

1. **PostgreSQL 확인:**

```bash
psql -U postgres -d rtb_ai_hub -c "
  SELECT id, title, context, tags, participants
  FROM decision_journal
  ORDER BY created_at DESC
  LIMIT 1;
"
```

**출력:**

```
id: dec_abc123
title: Redux Toolkit을 상태 관리 라이브러리로 선택
context: PR #42 (feature/PROJ-123-design-system) 댓글
tags: {state-management,redux,architecture}
participants: {tech-lead,김아키텍트,박개발}
rationale: 팀원 대부분이 RTK 경험 보유, DevTools 지원 우수
alternatives: {Zustand}
```

2. **Slack 즉시 알림 (기본 채널):**

```
💡 기술 의사결정 기록됨

제목: Redux Toolkit을 상태 관리 라이브러리로 선택
맥락: PR #42 (feature/PROJ-123-design-system)
참여자: @tech-lead, @김아키텍트, @박개발
태그: #state-management #redux #architecture

━━━ 📝 이유 ━━━
• 팀원 대부분이 RTK 경험 보유
• DevTools 지원 우수
• Zustand 대비 타입 안정성 우수
• 대규모 애플리케이션에 검증됨

━━━ 🔄 대안 ━━━
• Zustand (더 간단하지만 팀 경험 부족)

━━━ 🔗 관련 링크 ━━━
• PR 댓글: https://github.com/.../pull/42#comment-123
• 관련 이슈: PROJ-123
```

3. **주간 다이제스트 (월요일 자동 전송):**

```
📚 주간 기술 의사결정 요약 — 2026-02-10 ~ 2026-02-16

━━━ 🎯 이번 주 주요 결정 (3개) ━━━

1. Redux Toolkit 사용 결정 (2026-02-12)
   • 맥락: PR #42
   • 참여자: tech-lead, 김아키텍트, 박개발
   • 태그: #state-management #redux

2. Tailwind v4 마이그레이션 합의 (2026-02-10)
   • 맥락: Jira PROJ-300
   • 참여자: 정디자이너, 박프론트, 김리드
   • 태그: #styling #migration

3. Next.js 15 업그레이드 연기 (2026-02-14)
   • 맥락: 스프린트 계획 회의
   • 참여자: 전체 개발팀
   • 태그: #framework #upgrade
```

---

### Scenario 9: C-3 회의 준비 자동화 (크론 스케줄)

**목표**: 데일리 스크럼 전날 밤 회의 자료를 자동 생성

**실행 방법 (빠른 테스트):**

```bash
# 1. 크론을 15분 간격으로 변경
DAILY_SCRUM_PREP_CRON="*/15 * * * *"

# 2. workflow-engine 재시작 후 15분 대기
```

**또는 즉시 실행:**

```bash
curl -X POST http://localhost:4000/api/test/trigger-meeting-prep
```

**검증:**

Slack MEETING_PREP_CHANNEL에 메시지 도착:

```
📅 데일리 스크럼 준비 — 2026-02-13 (목)

━━━ 🎯 어제 완료 (3개) ━━━
✅ PROJ-123 — 디자인 시스템 컴포넌트 구현 (박개발)
   • PR #42 머지됨
   • CI 통과, stg 배포 완료

✅ PROJ-99 — 로그인 API 개선 (김백엔드)
   • 응답 시간 40% 단축
   • 테스트 커버리지 95%

✅ PROJ-88 — 버그 수정 #234 (이QA)
   • 회귀 테스트 완료
   • prd 핫픽스 배포

━━━ 🚀 오늘 진행 예정 (5개) ━━━
🔵 PROJ-456 — Component 리팩토링 (박개발)
   • 상태: In Progress (30% 완료)
   • 예상 완료: 오늘 오후

🔵 PROJ-234 — OAuth 통합 (김백엔드)
   • 상태: In Progress (70% 완료)
   • 예상 완료: 내일 오전

⏸️ PROJ-111 — 결제 모듈 (최개발)
   • 상태: 3일째 정체 ⚠️
   • 블로커: PG사 API 응답 없음

🟡 PROJ-200 — 성능 개선 (이시니어)
   • 상태: Code Review 대기 (24시간)
   • PR #88 — 리뷰어: @김리뷰

🟡 PROJ-201 — UI 개선 (정디자이너)
   • 상태: Design Complete
   • 개발 착수 예정

━━━ 🚨 블로커 (1개) ━━━
🔴 PROJ-111 — 결제 모듈
• 이슈: PG사 API 응답 없음 (3일째)
• 담당자: @최개발
• 영향: Sprint 목표 달성 위험 (critical path)
• 제안: PG사 고객지원 에스컬레이션 필요
• 대안: Mock API로 개발 진행, 나중에 통합

━━━ 💡 최근 기술 결정 (2개) ━━━
• Redux Toolkit 사용 결정 (PR #42, 2일 전)
• Tailwind v4 마이그레이션 합의 (Jira PROJ-300, 1주 전)

━━━ 🎉 스프린트 진행률 ━━━
Sprint 24: 14/20 완료 (70%)
• 남은 일수: 3일
• 예상 완료: 17개 (85%) — 목표 달성 가능 ✅
• 리스크: PROJ-111 블로커 해결 필요

━━━ 📊 팀 속도 트렌드 ━━━
• 이번 스프린트: 14 SP/주 (양호)
• 지난 스프린트: 12 SP/주
• 평균 속도: 13 SP/주 (+8% 향상)
```

---

## 🔗 3단계: 통합 시나리오 테스트

실제 업무 플로우를 따라가며 **9개 기능이 연계되는 과정** 확인:

### 통합 시나리오 스크립트

다음 스크립트를 `scripts/test-coordinator.sh`로 저장하고 실행하세요:

```bash
#!/bin/bash
# scripts/test-coordinator.sh
# Communication Coordinator 통합 시나리오 테스트

set -e

echo "🎬 Communication Coordinator 통합 시나리오 시작"
echo ""

# ━━━ Step 1: Jira 이슈 생성 + In Progress ━━━
echo "1️⃣ Jira 이슈를 In Progress로 변경..."
curl -s -X POST http://localhost:4000/webhooks/jira?env=int \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "issue_updated",
    "issue": {
      "key": "FULL-999",
      "fields": {
        "status": { "name": "In Progress" },
        "summary": "통합 테스트 이슈",
        "issuetype": { "name": "Task" },
        "labels": ["RTB-AI-HUB"]
      }
    },
    "changelog": {
      "items": [{"field": "status", "fromString": "To Do", "toString": "In Progress"}]
    }
  }' > /dev/null

echo "   ✅ A-1 역할별 알림 → developer, pm, lead 채널에 전송"
echo "   ✅ B-1 맥락 연결 → context_links에 FULL-999 생성"
sleep 2

# ━━━ Step 2: AI 코드 생성 완료 + PR 생성 ━━━
echo "2️⃣ PR 생성 시뮬레이션..."
curl -s -X POST http://localhost:4000/webhooks/github?env=int \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 999,
      "title": "feat: Implement FULL-999",
      "head": { "ref": "feature/FULL-999-test", "sha": "abc123" },
      "base": { "ref": "develop" }
    },
    "repository": { "full_name": "dev-rsquare/rtb-v2-mvp" }
  }' > /dev/null

echo "   ✅ A-2 PR 맥락 첨부 → Jira/Figma/Wiki 정보 자동 추가"
echo "   ✅ C-1 영향 분석 → 변경 파일 분석, 리스크 평가, 리뷰어 추천"
echo "   ✅ B-1 맥락 연결 업데이트 → PR #999 추가"
sleep 2

# ━━━ Step 3: PR 댓글에서 의사결정 감지 ━━━
echo "3️⃣ PR 댓글에서 의사결정 기록..."
curl -s -X POST http://localhost:4000/webhooks/github?env=int \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issue_comment" \
  -d '{
    "action": "created",
    "issue": { "number": 999, "pull_request": {} },
    "comment": {
      "body": "결정: 이 기능은 Feature Flag로 제어합니다. 이유: 점진적 롤아웃이 필요하기 때문입니다.",
      "user": { "login": "tech-lead" }
    }
  }' > /dev/null

echo "   ✅ C-2 의사결정 저널 → decision_journal 테이블에 기록"
sleep 2

# ━━━ Step 4: Jira 상태 변경 (In Progress → Code Review) ━━━
echo "4️⃣ Jira 상태를 Code Review로 변경..."
curl -s -X POST http://localhost:4000/webhooks/jira?env=int \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "issue_updated",
    "issue": {
      "key": "FULL-999",
      "fields": {
        "status": { "name": "Code Review" },
        "summary": "통합 테스트 이슈",
        "issuetype": { "name": "Task" }
      }
    },
    "changelog": {
      "items": [{"field": "status", "fromString": "In Progress", "toString": "Code Review"}]
    }
  }' > /dev/null

echo "   ✅ B-2 스마트 핸드오프 → reviewer에게 브리핑 전송"
echo "   ✅ A-1 역할별 알림 → reviewer 채널에 알림"
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 통합 시나리오 완료!"
echo ""
echo "📊 실행된 기능:"
echo "   A-1 역할별 알림: 3회 (In Progress, PR 생성, Code Review)"
echo "   A-2 PR 맥락 첨부: 1회"
echo "   B-1 맥락 연결: 2회 (이슈 생성, PR 추가)"
echo "   B-2 스마트 핸드오프: 1회"
echo "   C-1 영향 분석: 1회"
echo "   C-2 의사결정 저널: 1회"
echo ""
echo "🔍 검증 방법:"
echo "   1. Slack 각 채널에서 메시지 확인"
echo "   2. PostgreSQL context_links + decision_journal 테이블 조회"
echo "   3. GitHub PR body 확인 (A-2, C-1 섹션)"
echo "   4. workflow-engine 로그 확인"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

**실행:**

```bash
chmod +x scripts/test-coordinator.sh
./scripts/test-coordinator.sh
```

---

## 📊 4단계: 검증 방법

### 4-1. Slack 메시지 확인

각 채널에서 수신된 메시지 확인:

| 채널 ID     | 역할       | 확인할 메시지                                |
| ----------- | ---------- | -------------------------------------------- |
| C05678      | developer  | 개발 관련 알림 (이슈 시작, PR 생성, CI 상태) |
| C09012      | reviewer   | 리뷰 관련 알림 (리뷰 요청, 스마트 핸드오프)  |
| C04567      | pm         | 프로젝트 관리 알림 (스프린트 진행률)         |
| C0123456789 | 다이제스트 | 일일 팀 요약 (크론 실행 시)                  |
| C0123456789 | 블로커     | 블로커 감지 알림 (크론 실행 시)              |
| C0123456789 | 회의 준비  | 데일리 스크럼/스프린트 리뷰 자료             |

### 4-2. DB 데이터 확인

**Context Links 테이블:**

```bash
psql -U postgres -d rtb_ai_hub -c "
  SELECT jira_key, figma_url, github_prs::text, created_at
  FROM context_links
  ORDER BY created_at DESC
  LIMIT 5;
"
```

**Decision Journal 테이블:**

```bash
psql -U postgres -d rtb_ai_hub -c "
  SELECT title, tags, participants, created_at
  FROM decision_journal
  ORDER BY created_at DESC
  LIMIT 5;
"
```

**Workflow Executions (통합 확인):**

```bash
psql -U postgres -d rtb_ai_hub -c "
  SELECT workflow_type, status, created_at
  FROM workflow_executions
  WHERE workflow_type IN ('JIRA_AUTO_DEV', 'SMART_HANDOFF')
  ORDER BY created_at DESC
  LIMIT 10;
"
```

### 4-3. 로그 확인

**workflow-engine 로그에서 각 기능 실행 확인:**

```bash
# 실시간 로그 모니터링
tail -f /path/to/workflow-engine.log | grep -E "notifyByRole|buildEnrichedPrDescription|updateContext|processSmartHandoff|detectDecisions"

# 또는 Docker 로그
docker compose -f docker-compose.test.yml logs -f workflow-engine | grep -E "notifyByRole|Smart handoff|Impact analysis|Decision detected"
```

**예상 로그 패턴:**

```
[workflow-engine] notifyByRole: event=workflow_started, roles=[developer,pm,lead]
[workflow-engine] updateContext: jiraKey=PROJ-123, added PR #42
[workflow-engine] buildEnrichedPrDescription: Jira context added, Wiki knowledge: 3 pages
[workflow-engine] Smart handoff triggered: In Progress → Code Review
[workflow-engine] Impact analysis: risk=HIGH, files=10, reviewers=[김아키텍트,박시니어]
[workflow-engine] Decision detected: confidence=0.85, tags=[state-management,redux]
```

### 4-4. GitHub PR 확인

PR 페이지에서 자동 추가된 섹션 확인:

1. **A-2 PR Context Enrichment**: Jira/Figma/Wiki 섹션
2. **C-1 Impact Analysis**: Risk Assessment, Affected Modules, Recommended Reviewers 섹션

### 4-5. REST API 직접 호출

**맥락 조회 API:**

```bash
curl http://localhost:4000/api/context/PROJ-123 | jq .
```

**의사결정 검색 API (구현 시):**

```bash
curl "http://localhost:4000/api/decisions?tags=state-management" | jq .
```

---

## 🐛 트러블슈팅

### 문제 1: Slack 알림이 전송되지 않음

**증상:**

- workflow-engine 로그에 "notifyByRole" 메시지는 있지만 Slack에 도착하지 않음

**원인 및 해결:**

```bash
# 1. Bot Token 형식 확인
echo $SLACK_BOT_TOKEN | cut -c1-10
# "xoxb-"로 시작해야 함. "xoxp-"는 User Token (잘못된 타입)

# 2. Bot이 채널에 초대되었는지 확인
# Slack 채널에서 다음 명령어 실행:
/invite @RTB AI Coordinator

# 3. Bot 권한 확인
# https://api.slack.com/apps → Your App → OAuth & Permissions
# Required Scopes:
#   - chat:write
#   - channels:read
#   - users:read

# 4. 채널 ID가 올바른지 확인
curl https://slack.com/api/conversations.list \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  | jq '.channels[] | select(.name=="general") | .id'

# 5. 직접 메시지 전송 테스트
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "C0123456789",
    "text": "테스트 메시지"
  }'
```

---

### 문제 2: 크론 스케줄러가 실행되지 않음

**증상:**

- workflow-engine 시작 시 스케줄러 로그는 있지만 실제로 실행되지 않음

**원인 및 해결:**

```bash
# 1. workflow-engine 로그에서 스케줄러 시작 확인
grep "DigestScheduler\|BlockerScheduler\|MeetingPrepScheduler" workflow-engine.log

# 예상 로그:
# [workflow-engine] DigestScheduler started with cron: 0 0 * * 1-5
# [workflow-engine] BlockerScheduler started with cron: 0 2,6 * * 1-5

# 2. Redis 연결 확인 (BullMQ는 Redis 필요)
docker exec -it rtb-redis redis-cli ping
# PONG 응답 확인

# 3. 크론 표현식 검증
# https://crontab.guru/ 에서 크론 표현식 확인
# "0 0 * * 1-5" → 월~금 00:00 (UTC)
# KST는 UTC+9이므로 한국 시간 09:00에 실행됨

# 4. 타임존 확인
docker exec -it rtb-workflow-engine date
# KST로 설정되었는지 확인

# 5. BullMQ 큐 상태 확인
docker exec -it rtb-redis redis-cli
> KEYS bull:*
> HGETALL bull:digest-queue:meta
```

**빠른 테스트를 위한 크론 변경:**

```bash
# .env.coordinator에서 크론을 짧게 설정:
TEAM_DIGEST_CRON="*/2 * * * *"       # 2분마다
BLOCKER_CHECK_CRON="*/3 * * * *"     # 3분마다
DAILY_SCRUM_PREP_CRON="*/5 * * * *"  # 5분마다

# workflow-engine 재시작
pkill -f workflow-engine
pnpm dev:workflow
```

---

### 문제 3: DB 마이그레이션 실패

**증상:**

- `context_links` 또는 `decision_journal` 테이블이 없음

**원인 및 해결:**

```bash
# 1. 테이블 존재 여부 확인
psql -U postgres -d rtb_ai_hub -c "\dt"
# context_links, decision_journal 확인

# 2. 마이그레이션 파일 확인
ls -la drizzle/
# 0003_add_context_links.sql
# 0004_add_decision_journal.sql

# 3. 수동 마이그레이션
psql -U postgres -d rtb_ai_hub -f drizzle/0003_add_context_links.sql
psql -U postgres -d rtb_ai_hub -f drizzle/0004_add_decision_journal.sql

# 4. 테이블 스키마 확인
psql -U postgres -d rtb_ai_hub -c "\d context_links"
psql -U postgres -d rtb_ai_hub -c "\d decision_journal"

# 5. Drizzle Kit으로 마이그레이션 (권장)
pnpm db:generate  # schema.ts → SQL 생성
pnpm db:push      # DB에 적용
```

---

### 문제 4: PR 맥락이 추가되지 않음

**증상:**

- PR을 생성했지만 body에 Jira/Figma/Wiki 섹션이 추가되지 않음

**원인 및 해결:**

```bash
# 1. GitHub Webhook 확인
# GitHub → Settings → Webhooks에서 webhook 등록 확인
# Payload URL: http://your-domain:4000/webhooks/github
# Events: Pull requests, Issue comments

# 2. 로컬 테스트는 Webhook 대신 직접 호출
curl -X POST http://localhost:4000/webhooks/github?env=int \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d @- << 'EOF'
{
  "action": "opened",
  "pull_request": {
    "number": 999,
    "title": "Test PR",
    "head": { "ref": "feature/PROJ-123-test" },
    "base": { "ref": "develop" }
  }
}
EOF

# 3. workflow-engine 로그 확인
grep "buildEnrichedPrDescription" workflow-engine.log

# 4. B-1 Context Engine 데이터 확인
curl http://localhost:4000/api/context/PROJ-123 | jq .
```

---

### 문제 5: 의사결정 감지가 동작하지 않음

**증상:**

- PR/Jira 댓글에 "결정:" 키워드를 넣었지만 decision_journal에 기록되지 않음

**원인 및 해결:**

```bash
# 1. Feature Flag 확인
grep "DECISION_JOURNAL_ENABLED" .env.coordinator
# true로 설정되어 있는지 확인

# 2. 키워드 확인
# decision-detector.ts의 키워드 목록:
# 한글: 결정, 결론, 합의, 결정사항
# 영어: decision, decided, conclusion, agreed

# 3. 신뢰도 임계값 확인
grep "DECISION_CONFIDENCE_THRESHOLD" .env.coordinator
# 기본값 0.7 (70% 이상만 기록)

# 4. 댓글 형식 확인 (좋은 예시)
# "결정: Redux Toolkit 사용. 이유: 팀 경험 풍부. @참여자1 @참여자2 동의"

# 5. PostgreSQL 확인
psql -U postgres -d rtb_ai_hub -c "
  SELECT * FROM decision_journal
  ORDER BY created_at DESC
  LIMIT 3;
"

# 6. workflow-engine 로그 확인
grep "Decision detected" workflow-engine.log
```

---

## 💡 추가 팁

### 빠른 크론 테스트를 위한 설정

로컬 테스트 시 크론 간격을 짧게 설정하면 빠르게 결과를 확인할 수 있습니다:

```bash
# .env.coordinator 또는 .env.local에 추가:
TEAM_DIGEST_CRON="*/2 * * * *"       # 2분마다
BLOCKER_CHECK_CRON="*/3 * * * *"     # 3분마다
DAILY_SCRUM_PREP_CRON="*/5 * * * *"  # 5분마다

# 실제 운영 시에는 원래대로 복원:
TEAM_DIGEST_CRON="0 0 * * 1-5"       # 평일 오전 9시 (KST)
BLOCKER_CHECK_CRON="0 2,6 * * 1-5"   # 평일 오전 11시, 오후 3시 (KST)
DAILY_SCRUM_PREP_CRON="50 23 * * 0-4" # 평일 전날 밤 11:50 (KST)
```

### 수동 트리거 API (디버깅용)

각 스케줄러를 즉시 실행할 수 있는 테스트 API를 추가하면 디버깅이 편리합니다:

**packages/webhook-listener/src/routes/test.ts** (신규 생성):

```typescript
import { Router } from 'express';
import { Queue } from 'bullmq';

export function createTestRouter(queues: { digestQueue: Queue; blockerQueue: Queue }) {
  const router = Router();

  // 다이제스트 즉시 실행
  router.post('/api/test/trigger-digest', async (req, res) => {
    await queues.digestQueue.add('manual-trigger', { triggeredBy: 'test-api' });
    res.json({ message: 'Digest triggered' });
  });

  // 블로커 체크 즉시 실행
  router.post('/api/test/trigger-blocker-check', async (req, res) => {
    await queues.blockerQueue.add('manual-trigger', { triggeredBy: 'test-api' });
    res.json({ message: 'Blocker check triggered' });
  });

  // 회의 준비 즉시 실행
  router.post('/api/test/trigger-meeting-prep', async (req, res) => {
    // 구현 필요
    res.json({ message: 'Meeting prep triggered' });
  });

  return router;
}
```

**사용 예시:**

```bash
curl -X POST http://localhost:4000/api/test/trigger-digest
curl -X POST http://localhost:4000/api/test/trigger-blocker-check
curl -X POST http://localhost:4000/api/test/trigger-meeting-prep
```

### Slack 메시지 포맷 테스트

Slack Block Kit Builder를 사용하면 메시지 포맷을 미리 확인할 수 있습니다:

https://app.slack.com/block-kit-builder

### DB 데이터 초기화

테스트 중 DB 데이터를 초기화해야 할 경우:

```bash
# context_links 테이블 비우기
psql -U postgres -d rtb_ai_hub -c "TRUNCATE TABLE context_links CASCADE;"

# decision_journal 테이블 비우기
psql -U postgres -d rtb_ai_hub -c "TRUNCATE TABLE decision_journal CASCADE;"

# workflow_executions 테이블 비우기 (주의!)
psql -U postgres -d rtb_ai_hub -c "TRUNCATE TABLE workflow_executions CASCADE;"
```

---

## 📚 참고 문서

- **설계 문서**: [docs/designs/README.md](../designs/README.md)
- **Phase A 기능**:
  - [A-1 Role-aware Notifications](../designs/A1_ROLE_AWARE_NOTIFICATIONS.md)
  - [A-2 PR Context Enrichment](../designs/A2_PR_CONTEXT_ENRICHMENT.md)
  - [A-3 Daily Team Digest](../designs/A3_DAILY_TEAM_DIGEST.md)
- **Phase B 기능**:
  - [B-1 Cross-Reference Engine](../designs/B1_CROSS_REFERENCE_ENGINE.md)
  - [B-2 Smart Handoff](../designs/B2_SMART_HANDOFF.md)
  - [B-3 Blocker Detection](../designs/B3_BLOCKER_DETECTION.md)
- **Phase C 기능**:
  - [C-1 Impact Analysis](../designs/C1_IMPACT_ANALYSIS.md)
  - [C-2 Decision Journal](../designs/C2_DECISION_JOURNAL.md)
  - [C-3 Meeting Prep](../designs/C3_MEETING_PREP.md)
- **비전 문서**: [VISION_TEAM_AI_COORDINATOR.md](../VISION_TEAM_AI_COORDINATOR.md)

---

## ✅ 체크리스트

시나리오 테스트 전 확인 사항:

- [ ] `.env.coordinator` 파일 생성 및 설정 완료
- [ ] Slack Bot Token 발급 및 설정 완료
- [ ] Slack 채널 ID 확인 및 설정 완료
- [ ] Bot을 각 채널에 초대 완료
- [ ] DB 마이그레이션 실행 완료 (context_links, decision_journal)
- [ ] `pnpm dev` 실행하여 모든 서비스 시작 완료
- [ ] workflow-engine 로그에서 스케줄러 시작 메시지 확인

각 시나리오 테스트 후:

- [ ] Slack 메시지 수신 확인
- [ ] PostgreSQL DB 데이터 확인
- [ ] workflow-engine 로그 확인
- [ ] GitHub PR body 확인 (해당 시나리오)

---

**Communication Coordinator의 9개 기능을 모두 테스트하는 완전한 시나리오 가이드였습니다!**

추가 질문이나 특정 기능에 대한 상세 가이드가 필요하면 말씀해주세요.
