# Team AI Coordinator - 비전 문서

> **"개인 AI 도구"에서 "팀의 AI 코디네이터"로**
>
> AI가 팀원 사이를 흐르는 정보를 정제하고, 자연스럽게 전달하며,
> 개발과 관련된 모든 업무가 매끄럽게 흘러가도록 조율하는 시스템.

---

## 1. 왜 이 전환이 필요한가

### 현재 상태: 각자의 AI

지금의 AI 도구들은 **개인 단위로 최적화**되어 있다.

- 개발자는 Copilot으로 코드를 생성한다
- PM은 ChatGPT로 문서를 작성한다
- 디자이너는 AI로 에셋을 생성한다
- RTB AI Hub도 개별 워크플로우를 자동화한다 (Figma→Jira, Jira→Code, Auto-review)

각 도구는 훌륭하지만, **팀 사이의 빈 공간**은 여전히 사람이 채우고 있다:

```
디자이너 ──(Figma 링크를 Slack에 공유)──▶ PM ──(Jira 티켓 수동 작성)──▶ 개발자
    ▲                                                                      │
    └──(구현 결과를 수동으로 확인)──────────────────────────────────────────┘
```

이 빈 공간에서 발생하는 문제:

| 문제                  | 예시                                                 |
| --------------------- | ---------------------------------------------------- |
| **정보 손실**         | 디자인 의도가 Jira 티켓으로 옮겨지면서 맥락이 빠진다 |
| **대기 시간**         | "이 PR 리뷰해주세요" → 시니어가 3시간 뒤에 확인      |
| **맥락 부재**         | 코드 리뷰어가 원래 요구사항을 모른 채 코드만 본다    |
| **중복 커뮤니케이션** | 같은 내용을 Slack, Jira, 미팅에서 반복               |
| **암묵지 고립**       | "이건 원래 이렇게 하기로 했었는데..." 기억에만 존재  |

### 전환 목표: 팀의 연결 조직(Connective Tissue)으로서의 AI

```
디자이너 ──────┐
               │
PM ────────────┼──── RTB AI Hub (Team Coordinator) ────┬──── 정제된 맥락
               │         │                             │
개발자 ────────┤         │ 조율 / 가이드 / 중재         ├──── 적시 전달
               │         │                             │
QA ────────────┘         ▼                             └──── 역할별 최적화
                    팀 전체의 흐름을
                    자연스럽게 만든다
```

**핵심 철학**: AI가 업무를 "대신"하는 것이 아니라, 팀원 사이의 **정보 흐름을 정제하고 가속**한다.

---

## 2. 핵심 개념

### 2.1 정보 정제 (Information Refinement)

같은 이벤트도 받는 사람에 따라 다르게 전달해야 한다.

**예시: PR이 머지되었을 때**

| 수신자       | AI가 전달하는 메시지                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **디자이너** | "로그인 페이지 구현이 완료되었어요. Figma 시안과 비교해볼 수 있는 프리뷰 링크입니다."          |
| **PM**       | "PROJ-123 구현 완료. 예상 2SP 중 실제 1.5일 소요. QA 환경 배포 예정일은 내일입니다."           |
| **QA**       | "PROJ-123이 stg에 배포됩니다. 테스트 대상: 로그인 폼 검증, 소셜 로그인. 영향 범위: auth 모듈." |
| **팀 리더**  | "이번 스프린트 12개 티켓 중 8개 완료 (67%). PROJ-123 완료로 로그인 기능 블로커 해소."          |

하나의 이벤트에서 **역할별로 필요한 정보만 추출**하여 자연스럽게 전달.

### 2.2 맥락 연결 (Context Linking)

현재 도구들은 사일로(Silo)다. AI가 사일로 사이를 연결한다.

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Figma   │     │   Jira   │     │  GitHub  │     │ Datadog  │
│ 디자인    │     │  요구사항  │     │   코드    │     │  운영     │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     └────────────────┴────────────────┴────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Context Engine   │
                    │                   │
                    │  "이 PR은          │
                    │   이 Figma 프레임에서 시작되어,   │
                    │   이 Jira 티켓을 구현하고,       │
                    │   지난주 이 인시던트와 관련 있다"  │
                    └───────────────────┘
```

누군가 PR을 볼 때, 관련된 **디자인 시안, 요구사항, 과거 장애 이력**이 자동으로 따라온다.

### 2.3 자연스러운 흐름 (Natural Flow)

팀원이 의식하지 않아도 필요한 정보가 필요한 시점에 도착한다.

- 디자이너가 시안을 완성하면 → 개발자에게 구현 가이드가 자동 생성
- 개발자가 PR을 올리면 → 리뷰어에게 관련 맥락이 함께 전달
- QA가 버그를 리포트하면 → 원래 구현자에게 디자인 의도와 함께 전달
- 배포가 완료되면 → 관련자 전원에게 역할별 맞춤 알림

**"누가 누구에게 뭘 전달해야 하지?"를 AI가 해결한다.**

---

## 3. 아키텍처: 3계층 모델

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Decision Facilitation (의사결정 촉진)                   │
│  ─────────────────────────────────────────────                   │
│  기술 의사결정 지원, 영향 분석, 리스크 평가                         │
│  "이 변경은 3개 팀에 영향을 줍니다. 사전 공유를 권장합니다."         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Team Intelligence (팀 인텔리전스)                       │
│  ─────────────────────────────────────────                       │
│  스프린트 펄스, 의존성 감지, 블로커 알림, 워크로드 인사이트           │
│  "PROJ-123은 PROJ-456에 의존하는데, 456이 3일째 멈춰있습니다."      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Connective Tissue (정보 연결)                          │
│  ─────────────────────────────────────                           │
│  교차 도구 맥락 연결, 역할별 정보 정제, 자동 핸드오프                │
│  "이 PR의 배경: Figma 시안 → Jira 요구사항 → 구현 코드"            │
├─────────────────────────────────────────────────────────────────┤
│  Foundation: 현재 RTB AI Hub 인프라                               │
│  ─────────────────────────────────                               │
│  Webhook → Queue → Workflow → MCP → Dashboard                    │
│  Multi-agent pipeline, Redis state, Slack integration            │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 1: Connective Tissue (정보 연결)

**목표**: 도구 사이의 정보 단절을 해소한다.

| 기능                       | 설명                                                           | 현재 인프라 활용                  |
| -------------------------- | -------------------------------------------------------------- | --------------------------------- |
| **Context Linking**        | Jira↔Figma↔GitHub↔Datadog 간 양방향 맥락 연결                  | Webhook 이벤트 + Redis 상태 저장  |
| **Role-aware Delivery**    | 같은 이벤트를 역할별로 다르게 요약하여 전달                    | OpenClaw/Slack + AI 요약          |
| **Smart Handoff**          | 업무 전환 시(디자인→개발→QA) 맥락 브리핑 자동 생성             | Multi-agent + Jira status webhook |
| **Enriched Notifications** | "PR 생성됨" → "PR 생성됨 + 관련 디자인 + 요구사항 + 영향 범위" | notify-openclaw.ts 확장           |

### Layer 2: Team Intelligence (팀 인텔리전스)

**목표**: 팀 전체의 업무 흐름을 파악하고 선제적으로 조율한다.

| 기능                     | 설명                                            | 현재 인프라 활용            |
| ------------------------ | ----------------------------------------------- | --------------------------- |
| **Sprint Pulse**         | 일간/주간 스프린트 현황 자동 요약 (역할별 맞춤) | Jira poller + 스케줄링      |
| **Dependency Detection** | 티켓 간 의존성, 블로커 자동 감지 및 알림        | Jira API + BullMQ 스케줄러  |
| **Workload Insight**     | 팀원별 작업량 불균형 감지, 리밸런싱 제안        | Jira + GitHub activity 분석 |
| **Knowledge Map**        | "이 모듈은 누가 잘 아는지" 자동 매핑            | Git blame + PR 이력 분석    |

### Layer 3: Decision Facilitation (의사결정 촉진)

**목표**: 더 나은 기술적 의사결정을 더 빠르게 내릴 수 있도록 돕는다.

| 기능                 | 설명                                             | 현재 인프라 활용          |
| -------------------- | ------------------------------------------------ | ------------------------- |
| **Impact Analysis**  | 코드 변경의 영향 범위 자동 분석                  | GitHub MCP + 코드 분석    |
| **Decision Journal** | 기술 결정사항을 자동 포착하고 검색 가능하게 보관 | Slack/PR 코멘트 수집 + DB |
| **Risk Assessment**  | 배포/변경의 리스크를 과거 데이터 기반으로 평가   | Datadog 이력 + 배포 기록  |
| **Meeting Prep**     | 회의 전 관련 활동 요약 + 의사결정 필요 항목 정리 | 전체 이벤트 로그 집계     |

---

## 4. 현재 인프라에서 시작할 수 있는 것들

현재 RTB AI Hub가 이미 갖추고 있는 것:

```
✅ 감각 기관    — 4개 도구(Figma, Jira, GitHub, Datadog)의 Webhook + 폴링
✅ 행동 기관    — MCP 서버(4개 도구를 실제로 조작)
✅ 사고 기관    — Multi-agent AI 파이프라인
✅ 기억 기관    — Redis 상태 + PostgreSQL 기록 + Wiki 지식
✅ 소통 기관    — Slack 연동 (OpenClaw + Slack Web API)
✅ 관제탑       — Dashboard (React)
```

**부족한 것 = "전두엽" (Prefrontal Cortex)**:
개별 워크플로우를 넘어서, 팀 전체의 맥락을 이해하고 조율하는 **조정 계층(Coordination Layer)**

---

## 5. 구현 로드맵

### Phase A: Quick Wins — ✅ 구현 완료 (2026-02-11)

> 3개 기능 모두 구현 완료. 54개 테스트 통과.
> 상세 설계 및 구현 내용: [설계 문서 인덱스](./designs/README.md)

#### A-1. 맥락 풍부한 알림 (Context-Rich Notifications)

현재 `notify-openclaw.ts`의 알림을 역할 인식형으로 확장.

```
AS-IS: "PROJ-123 PR #42가 생성되었습니다."
TO-BE:
  → 디자이너에게: "PROJ-123 로그인 페이지가 구현되었어요. 프리뷰에서 시안과 비교해보세요. [링크]"
  → PM에게: "PROJ-123 완료. 스프린트 진행률 67%. 다음 블로커: PROJ-125 (백엔드 API 대기중)"
  → QA에게: "PROJ-123이 int 환경에 배포 예정. 테스트 대상: 로그인 폼, 소셜 로그인. 관련 테스트 케이스: [링크]"
```

**구현 방식**: `notifyOpenClaw()` 함수에 `targetRole` 파라미터 추가 + AI 요약 프롬프트 분기

#### A-2. PR 맥락 자동 첨부 (PR Context Enrichment)

PR 생성 시 Jira 요구사항 + Figma 디자인 링크를 PR description에 자동 삽입.

```markdown
## Context

- **Jira**: [PROJ-123 - 로그인 페이지 구현](link)
- **Design**: [Figma Frame - Login Page](link)
- **Requirements**: 이메일/비밀번호 로그인 + 소셜 로그인 (Google, Kakao)
- **Impact**: auth 모듈, 신규 페이지 추가. 기존 코드 영향 없음.
```

**구현 방식**: `jira-auto-dev-multi.ts`의 PR 생성 단계에서 GitHub MCP `createPR` body 확장

#### A-3. 일일 팀 다이제스트 (Daily Team Digest)

매일 아침 Slack으로 전일 활동 요약 전달.

```
📊 어제의 RTB 개발 현황 (2026-02-10)

완료: 3건 (PROJ-123, PROJ-125, PROJ-128)
진행중: 5건
블로커: 1건 — PROJ-130 (백엔드 API 미완료로 프론트엔드 대기중)
PR 대기: 2건 (PROJ-125: 리뷰 대기 2일째, PROJ-128: CI 실패)
배포: int 2회, stg 0회

💡 주목할 점:
- PROJ-125 PR이 48시간째 리뷰 대기중입니다. 리뷰어를 지정해주세요.
- PROJ-130 블로커가 스프린트 목표에 영향을 줄 수 있습니다.
```

**구현 방식**: BullMQ 반복 작업(cron) + Jira/GitHub API 집계 + AI 요약 + Slack 전송

---

### Phase B: Team Intelligence — ✅ 구현 완료 (2026-02-11)

> 3개 기능 모두 구현 완료. 52개 테스트 통과. DB 마이그레이션 포함.
> 상세 설계 및 구현 내용: [설계 문서 인덱스](./designs/README.md)

#### B-1. Cross-Reference Engine (맥락 연결 엔진)

모든 이벤트를 수신하여 엔터티 간 관계를 자동 구축.

```typescript
// 새로운 모듈: packages/workflow-engine/src/utils/context-engine.ts
interface ContextLink {
  jiraKey: string; // PROJ-123
  figmaFileKey?: string; // abc123
  figmaFrameId?: string; // 1:234
  githubPRs: number[]; // [42, 45]
  githubBranch?: string; // feature/PROJ-123-login
  datadogIncidents?: string[]; // [INC-001]
  slackThreads?: string[]; // [ts:1234567890]
  teamMembers: {
    // 관련된 팀원들
    designer?: string;
    developer?: string;
    reviewer?: string;
    qa?: string;
  };
}
```

모든 Webhook 이벤트에서 Jira 키, Figma 링크, GitHub PR 번호를 추출하여 Redis/DB에 매핑 저장.
이후 어떤 컨텍스트에서든 관련 정보를 즉시 조회 가능.

#### B-2. Smart Handoff (스마트 업무 전환)

Jira 상태 변경 시 다음 담당자에게 맥락 브리핑 자동 생성.

```
[디자인 → 개발 전환 시]
"PROJ-123이 개발 단계로 넘어왔습니다.

📐 디자인 요약:
- Figma 프레임: Login Page (Desktop + Mobile)
- 핵심 인터랙션: 이메일 유효성 검사 실시간, 비밀번호 강도 표시
- 디자이너 노트: "로딩 상태에서 skeleton UI 사용 요청"

📋 구현 참고:
- 관련 위키: auth-flow.md, social-login-guide.md
- 유사 구현: PROJ-098 (회원가입 페이지) - 참고할 코드 패턴
- 주의: RTB 도메인에서 소셜 로그인은 Kakao가 필수 (wiki 참조)"
```

**구현 방식**: Jira webhook `status_changed` 이벤트 + Context Engine 조회 + AI 브리핑 생성

#### B-3. Dependency & Blocker Detection (의존성/블로커 감지)

주기적으로 Jira 티켓의 의존관계를 분석하여 블로커를 선제 감지.

```
⚠️ 블로커 감지 알림

PROJ-130 (결제 API 연동)이 3일째 진행되지 않고 있습니다.

영향 범위:
- PROJ-131 (결제 UI) — 대기중 (담당: 김개발)
- PROJ-132 (결제 테스트) — 대기중 (담당: 이QA)

💡 제안: PROJ-130 담당자(박백엔드)에게 확인이 필요합니다.
혹시 기술적 어려움이 있다면, 유사 구현 경험이 있는 최시니어를 페어링할 수 있습니다.
```

**구현 방식**: Jira poller 확장 + 의존관계 그래프 분석 + 스케줄링 알림

---

### Phase C: Decision Facilitation — ✅ 구현 완료 (2026-02-11)

> 3개 기능 모두 구현 완료. 86개 테스트 통과. DB 마이그레이션 포함.
> 상세 설계 및 구현 내용: [설계 문서 인덱스](./designs/README.md)

#### C-1. Impact Analysis (영향 분석)

PR이 올라오면 변경 범위와 영향을 자동 분석.

```
🔍 PROJ-123 PR #42 영향 분석

변경 파일: 12개 (auth 모듈 8개, shared 4개)
영향 받는 팀/기능:
- 결제팀: shared/types.ts의 User 타입 변경 → 결제 모듈에서 사용중
- QA: 로그인 플로우 전체 리그레션 테스트 권장
- 운영: 배포 시 DB 마이그레이션 필요 (users 테이블 컬럼 추가)

과거 유사 변경:
- 2주 전 PROJ-098에서 auth 모듈 변경 후 세션 만료 이슈 발생 이력 있음
  → 세션 관련 테스트 강화 권장
```

#### C-2. Decision Journal (의사결정 기록)

Slack 대화, PR 코멘트, Jira 코멘트에서 기술 결정사항을 자동 포착.

```
📝 기술 결정 기록 — 2026년 2월

#1 [2/3] 인증 방식: JWT → Session 전환 (취소됨)
   - 제안: 박백엔드 (Slack #dev-backend)
   - 결정: JWT 유지. 이유: 마이크로서비스 확장 대비
   - 참여: 최시니어, 김아키텍트

#2 [2/7] 결제 PG 연동: 토스페이먼츠 선정
   - 논의: PR #38 코멘트
   - 결정 근거: API 문서 품질, 테스트 환경 제공
   - 참여: 이PM, 박백엔드

(이 기록은 AI가 자동으로 수집하며, 향후 유사 결정 시 참고자료로 제공됩니다)
```

#### C-3. Meeting Prep (회의 준비 자동화)

스프린트 리뷰, 데일리 스크럼 전에 AI가 안건을 자동 정리.

```
📋 스프린트 리뷰 준비 — Sprint 23

완료 항목 (데모 가능):
1. PROJ-123 로그인 페이지 — 프리뷰: [링크]
2. PROJ-125 대시보드 차트 — 프리뷰: [링크]

미완료 (논의 필요):
3. PROJ-130 결제 API — 3일 지연, 기술 이슈 공유 필요
4. PROJ-132 결제 테스트 — PROJ-130 블로커로 미착수

다음 스프린트 후보:
- 백로그에서 우선순위 높은 5건 목록 + 스토리 포인트 합산
```

---

## 6. 기술적 접근

### 새로운 컴포넌트

| 컴포넌트              | 위치                       | 역할                         |
| --------------------- | -------------------------- | ---------------------------- |
| `context-engine.ts`   | workflow-engine/utils/     | 교차 도구 맥락 연결 + 조회   |
| `team-digest.ts`      | workflow-engine/workflows/ | 일간/주간 팀 다이제스트 생성 |
| `smart-handoff.ts`    | workflow-engine/workflows/ | 업무 전환 시 맥락 브리핑     |
| `blocker-detector.ts` | workflow-engine/utils/     | 의존성/블로커 주기적 감지    |
| `role-notifier.ts`    | workflow-engine/utils/     | 역할 인식형 알림 전송        |

### 데이터 모델 확장

```sql
-- 맥락 연결 테이블
CREATE TABLE context_links (
  id UUID PRIMARY KEY,
  jira_key VARCHAR(50),
  figma_file_key VARCHAR(100),
  figma_frame_id VARCHAR(100),
  github_repo VARCHAR(200),
  github_pr_number INTEGER,
  github_branch VARCHAR(200),
  datadog_incident_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 팀 멤버 역할 매핑
CREATE TABLE team_context (
  id UUID PRIMARY KEY,
  jira_key VARCHAR(50),
  role VARCHAR(20),  -- designer, developer, reviewer, qa, pm
  member_email VARCHAR(200),
  slack_user_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 의사결정 기록
CREATE TABLE decision_journal (
  id UUID PRIMARY KEY,
  title VARCHAR(500),
  decision TEXT,
  rationale TEXT,
  source_type VARCHAR(20),  -- slack, github_pr, jira_comment
  source_id VARCHAR(200),
  participants TEXT[],
  related_jira_keys TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 기존 인프라 연결점

```
현재                              확장
─────────────────────────────────────────────────────────────
Webhook routes (4개)          →   이벤트 수신 시 context_links 자동 갱신
Jira poller                   →   블로커/의존성 감지 추가
notify-openclaw.ts            →   role-notifier.ts로 확장
Multi-agent pipeline          →   Coordinator agent 추가
Dashboard                     →   팀 인텔리전스 뷰 추가
BullMQ                        →   Cron 기반 다이제스트/블로커 감지 추가
Redis state store             →   context_links 캐시 계층
Wiki knowledge                →   핸드오프 시 관련 문서 자동 첨부
```

---

## 7. 기대 효과

### 정량적 효과 (10인 팀 기준)

| 지표                        | 현재 (자동화만) | 목표 (조율까지) | 개선         |
| --------------------------- | --------------- | --------------- | ------------ |
| 업무 전환 시 맥락 파악 시간 | 30분/건         | 5분/건          | **83% 단축** |
| 블로커 발견까지 걸리는 시간 | 1~3일           | 수 시간         | **80% 단축** |
| 불필요한 동기 미팅          | 주 5~8회        | 주 2~3회        | **50% 감소** |
| 정보 요청 Slack 메시지      | 일 15~20건      | 일 5건          | **70% 감소** |
| 의사결정 재논의 (맥락 망각) | 월 3~5회        | 월 0~1회        | **80% 감소** |

### 정성적 효과

- **팀원 간 정보 비대칭 해소**: 모든 구성원이 자신의 역할에 맞는 수준으로 동일한 맥락을 공유
- **비동기 소통 품질 향상**: Slack 메시지나 Jira 코멘트에 AI가 맥락을 자동 보강
- **온보딩 가속화**: 새 팀원이 프로젝트 맥락과 과거 결정을 빠르게 파악
- **암묵지의 명시화**: 사람의 기억에만 의존하던 결정/맥락이 검색 가능한 형태로 보존

---

## 8. 참고: 기존 비전과의 관계

이 문서는 기존 비전을 **대체하지 않고 확장**한다.

```
기존 비전 (NON_DEV_GUIDE.md):
  "AI 비서가 상주하는 개발팀 사무실"
  → 개별 업무를 자동화하는 AI

이번 확장:
  "AI가 팀의 소통 매니저가 되는 미래"
  → 개별 자동화 + 팀 전체의 흐름을 조율하는 AI
```

| 기존                  | 확장                             |
| --------------------- | -------------------------------- |
| 개인의 반복 업무 제거 | + 팀 사이의 정보 마찰 제거       |
| 이벤트 → 자동 처리    | + 이벤트 → 맥락 분석 → 맞춤 전달 |
| 도구 통합 (MCP)       | + 사람 연결 (역할 인식)          |
| 워크플로우 자동화     | + 업무 흐름 조율                 |

---

_이 문서는 RTB AI Hub의 진화 방향을 정의합니다._
_최초 작성: 2026-02-11 | Phase A+B+C 구현 완료: 2026-02-11_
_전체: 9개 기능, 474개 테스트, 0 errors_
