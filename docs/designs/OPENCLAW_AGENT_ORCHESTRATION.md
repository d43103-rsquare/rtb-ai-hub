# OpenClaw 에이전트 오케스트레이션 아키텍처 재설계

> **Status**: Draft
> **Date**: 2026-02-12
> **Author**: AI Hub Team

---

## 1. 배경 및 목적

### 1.1 현재 상태

RTB AI Hub는 내부 multi-agent 파이프라인(Analyzer→Planner→Developer→Reviewer→Oracle)을 workflow-engine 내부에서 직접 운영하고 있다. 이 방식의 한계:

- **경직된 파이프라인**: Wave 기반이지만 고정된 순서의 에이전트 체인
- **의사결정 부재**: 각 단계의 산출물 품질을 판단하는 게이트키퍼가 없음
- **커뮤니케이션 부족**: 에이전트 간 협의/확인 과정 없이 단방향 전달
- **Slack 연동 단절**: 워크플로우 진행 상황을 실시간으로 사용자와 소통할 수 없음
- **OpenClaw 활용 미흡**: OpenClaw을 단순 알림 채널로만 사용 중

### 1.2 목표

**OpenClaw을 에이전트 오케스트레이션 레이어로 전환**하고, Hub는 **지식 + 인프라 서비스** 역할에 집중한다.

핵심 변경:

1. workflow-engine 내부 multi-agent 파이프라인 **전면 제거**
2. workflow-engine에 **지식 에이전트**(Knowledge Agent) 1개만 운영 — API로 노출
3. OpenClaw에 **5개 에이전트** 배치 (PM, 개발자, 팀장, 운영, 테스트)
4. **팀장 에이전트**가 각 단계의 게이트키퍼 역할 (품질 판단, 승인/반려)

---

## 2. 아키텍처 개요

### 2.1 Before → After

```
[BEFORE]
Slack → OpenClaw (알림만) ← Hub(workflow-engine 내 5-agent pipeline)

[AFTER]
Slack → OpenClaw (5-agent 오케스트레이션) → Hub(지식 + 인프라 API)
```

### 2.2 시스템 구성도

```
┌──────────────────────────────────────────────────────────────────────┐
│  Slack (사용자)                                                       │
│    "빌딩 정보 조회 API 개발해줘"                                       │
└───────────┬──────────────────────────────────────────────────────────┘
            │ Socket Mode
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  OpenClaw Gateway (에이전트 + 커뮤니케이션 + 스케줄링)                  │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌──────┐      │
│  │PM Agent  │  │Team Lead │  │Developer │  │Ops   │  │Test  │      │
│  │(coord)   │  │Agent     │  │Agent     │  │Agent │  │Agent │      │
│  │Jira 관리  │  │의사결정   │  │OpenCode  │  │배포   │  │테스트 │      │
│  │요구사항   │  │게이트키퍼 │  │코드 생성  │  │서버   │  │계획   │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──┬───┘  └──┬───┘      │
│       │             │             │            │         │           │
│       └─────────────┴─────────────┴────────────┴─────────┘           │
│                         │ exec (curl)                                 │
│  Atlassian MCP ← Jira 전체 (읽기/쓰기/폴링)                           │
│  Slack 네이티브 ← 모든 알림/대화                                       │
│  Cron ← 다이제스트, 블로커 감지, 미팅 준비                              │
└─────────────────────────┼─────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RTB AI Hub (인프라 + 지식 + 데이터 레이어)                            │
│                                                                       │
│  webhook-listener :4000                                               │
│  ├─ /api/knowledge/search         ← 위키 검색                        │
│  ├─ /api/knowledge/refine         ← 요구사항 정제 (위키 컨텍스트)      │
│  ├─ /api/knowledge/table/:name    ← 테이블 문서 조회                  │
│  ├─ /api/knowledge/domain/:key    ← 도메인 개요 조회                  │
│  ├─ /api/infra/git/branch         ← 브랜치 생성                      │
│  ├─ /api/infra/git/commit-push    ← 커밋 & 푸시                      │
│  ├─ /api/infra/ci/run             ← CI 파이프라인 실행                │
│  ├─ /api/infra/opencode/task      ← OpenCode 개발 작업 요청           │
│  ├─ /api/infra/deploy/preview     ← 프리뷰 환경 생성/관리             │
│  ├─ /api/infra/deploy/int         ← INT 환경 배포                    │
│  ├─ /api/infra/pr/create          ← GitHub PR 생성                   │
│  ├─ /api/context/:jiraKey         ← 크로스레퍼런스 조회               │
│  ├─ /webhooks/github              ← GitHub push/PR 이벤트 수신        │
│  ├─ /webhooks/figma               ← Figma 디자인 이벤트 수신          │
│  ├─ /webhooks/datadog             ← Datadog 알림 수신                 │
│  └─ /webhooks/openclaw            ← OpenClaw 이벤트 수신             │
│                                                                       │
│  workflow-engine :3001                                                │
│  ├─ WikiKnowledge (지식 인덱서 + rtb-wiki 자동 동기화)                 │
│  ├─ RepoManager (git 저장소 관리 — clone/pull/fetch)                  │
│  ├─ LocalGitOps (브랜치/커밋/푸시)                                    │
│  ├─ OpenCodeClient (OpenCode Server 연동)                             │
│  ├─ TargetCI (CI 파이프라인)                                          │
│  ├─ TargetCD (CD 배포)                                                │
│  ├─ PreviewManager (프리뷰 환경)                                      │
│  ├─ ContextEngine (크로스레퍼런스 DB)                                  │
│  └─ BranchPoller (GitHub 브랜치 변경 감지 → CD 트리거)                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 에이전트 설계

### 3.1 에이전트 목록

| 에이전트            | 역할       | OpenClaw ID       | 핵심 역량                                                 |
| ------------------- | ---------- | ----------------- | --------------------------------------------------------- |
| **PM Agent**        | 코디네이터 | `pm-agent`        | 요구사항 분석, 지식 정제, Jira 이슈 관리, 워크플로우 시작 |
| **Team Lead Agent** | 게이트키퍼 | `teamlead-agent`  | 계획 승인/반려, 품질 판단, 커뮤니케이션 품질 관리         |
| **Developer Agent** | 개발자     | `developer-agent` | 개발 계획 작성, 코드 생성, PM과 요구사항 확인             |
| **Ops Agent**       | 운영       | `ops-agent`       | 서버 배포, 프리뷰 환경, 헬스체크                          |
| **Test Agent**      | 테스터     | `test-agent`      | 테스트 계획 작성, 테스트 실행, 결과 보고                  |

### 3.2 팀장 에이전트 (Team Lead Agent) — 핵심 설계

팀장 에이전트는 이 시스템의 **가장 중요한 에이전트**이다. 단순히 승인만 하는 것이 아니라, **깊이 고민하고 판단**하는 역할을 한다.

#### 의사결정 원칙

```
1. 요구사항이 명확한가? → 불명확하면 PM에게 되돌림
2. 개발 계획이 적절한가? → 부적절하면 개발자에게 되돌림
   - 기술 선택이 합리적인지
   - 범위가 적절한지 (오버엔지니어링 / 언더엔지니어링)
   - 리스크가 관리되고 있는지
3. 테스트 계획이 충분한가? → 불충분하면 테스터에게 되돌림
   - 핵심 시나리오가 모두 커버되는지
   - edge case가 고려되었는지
4. 테스트 결과가 만족스러운가? → 불만족이면 다시 테스트 요청
   - 실패한 케이스의 심각도
   - 수정 후 재테스트 필요 여부
```

#### 게이트 포인트

| 게이트                   | 입력                  | 판단 기준                 | 결과                                |
| ------------------------ | --------------------- | ------------------------- | ----------------------------------- |
| **G1: 개발 계획 승인**   | Developer의 개발 계획 | 기술 적절성, 범위, 리스크 | 승인 → 개발 시작 / 반려 → 재작성    |
| **G2: 개발 완료 확인**   | Developer의 완료 보고 | CI 통과, 코드 품질        | 확인 → 배포 요청 / 반려 → 수정 요청 |
| **G3: 테스트 계획 승인** | Tester의 테스트 계획  | 커버리지, 시나리오 적절성 | 승인 → 테스트 시작 / 반려 → 재작성  |
| **G4: 테스트 결과 판정** | Tester의 테스트 결과  | 성공률, 실패 심각도       | 통과 → 알림 / 실패 → 재테스트/수정  |

### 3.3 에이전트 간 통신 흐름

```
[전체 워크플로우 시퀀스]

① Slack 사용자 → PM Agent
   "빌딩 정보 조회 API 개발해줘"

② PM Agent → Hub Knowledge API
   curl /api/knowledge/search?query="빌딩 정보 조회"
   → 위키에서 obj_bld_mst 테이블 문서, RTB 컨텍스트 로드

③ PM Agent → (내부 정제)
   요구사항 + 위키 지식을 결합하여 정제된 이슈 스펙 작성
   → Jira 이슈 생성/업데이트

④ PM Agent → Developer Agent
   "정제된 요구사항 전달: ..."

⑤ Developer Agent ↔ PM Agent
   개발자: "obj_bld_mst의 building_type 필드는 enum인가요?"
   PM: "(위키 조회 후) 네, 4가지 타입입니다: office, retail, logistics, residential"

⑥ Developer Agent → Team Lead Agent
   "개발 계획 제출: API 설계, DB 쿼리, 테스트 전략..."

⑦ Team Lead Agent → (깊은 사고)
   [G1 게이트] 계획 검토...

   ⑦-a. 반려 시: Team Lead → Developer Agent
        "pagination 처리가 없습니다. 데이터가 1만건 이상일 수 있으니 추가하세요"
        → ⑥으로 돌아감

   ⑦-b. 승인 시: Team Lead → Developer Agent
        "승인합니다. 개발을 시작하세요."

⑧ Developer Agent → Hub Infra API
   curl /api/infra/git/branch (브랜치 생성)
   (코드 생성 — Claude 활용)
   curl /api/infra/git/commit-push (코드 푸시)
   curl /api/infra/ci/run (CI 실행)

⑨ Developer Agent → Team Lead Agent
   "개발 완료: CI 통과, PR 생성됨"
   [G2 게이트]

⑩ Team Lead Agent → Ops Agent
   "배포 요청: feature/RNR-XXX-building-api 브랜치"

⑪ Ops Agent → Hub Infra API
   curl /api/infra/deploy/preview (프리뷰 환경 생성)
   → 서버 URL 확인

⑫ Ops Agent → Test Agent
   "서버 준비됨: http://preview-xxx:3000"

⑬ Test Agent → Team Lead Agent
   "테스트 계획 제출: 5개 시나리오..."
   [G3 게이트]

⑭ Team Lead Agent → Test Agent
   "승인. 테스트 시작하세요."

⑮ Test Agent → (테스트 실행)
   자동화 테스트 + 수동 체크리스트

⑯ Test Agent → Team Lead Agent
   "테스트 결과: 5/5 통과"
   [G4 게이트]

⑰ Team Lead → Slack 사용자
   "✅ 개발 완료! 프리뷰 서버에서 직접 확인해주세요.
    URL: http://preview-xxx:3000
    확인 후 Jira 상태를 'INT 검증'으로 변경해주세요."
```

---

## 4. Hub 서비스 레이어 설계

### 4.1 Knowledge API (신규)

기존 `WikiKnowledge` 클래스를 HTTP API로 노출한다.

```
POST /api/knowledge/search
  Body: { "query": "빌딩 정보 조회", "maxDocs": 4 }
  Response: { "context": "# RTB System Context\n...", "tables": ["obj_bld_mst"], "domains": ["obj"] }

GET /api/knowledge/table/:tableName
  Response: { "content": "# obj_bld_mst\n...", "found": true }

GET /api/knowledge/domain/:domainKey
  Response: { "content": "# OBJ Domain Overview\n...", "found": true }

POST /api/knowledge/refine
  Body: { "requirement": "빌딩 정보 조회 API", "jiraKey": "RNR-123" }
  Response: { "refinedSpec": "...", "wikiContext": "...", "suggestedTables": [...] }
```

**구현**: `packages/webhook-listener/src/routes/knowledge.ts` (신규)

- WikiKnowledge 인스턴스를 사용
- refine 엔드포인트는 Anthropic API로 요구사항+위키컨텍스트를 결합하여 정제

### 4.2 Infrastructure API (신규)

기존 유틸리티를 HTTP API로 노출한다.

```
POST /api/infra/git/branch
  Body: { "jiraKey": "RNR-123", "type": "feature", "description": "building-api", "env": "int" }
  Response: { "branchName": "feature/RNR-123-building-api", "baseBranch": "develop" }

POST /api/infra/git/commit-push
  Body: { "branchName": "feature/RNR-123-...", "files": [...], "message": "[RNR-123] ..." }
  Response: { "commitHash": "abc123", "pushed": true }

POST /api/infra/ci/run
  Body: { "branchName": "feature/RNR-123-..." }
  Response: { "success": true, "steps": [{"name": "lint", "passed": true}, ...] }

POST /api/infra/deploy/preview
  Body: { "branchName": "feature/RNR-123-...", "env": "int" }
  Response: { "url": "http://preview-xxx:3000", "status": "running" }

POST /api/infra/pr/create
  Body: { "branchName": "feature/RNR-123-...", "title": "...", "body": "..." }
  Response: { "prNumber": 42, "url": "https://github.com/..." }
```

**구현**: `packages/webhook-listener/src/routes/infra.ts` (신규)

- 기존 local-git-ops, target-ci, preview-manager 등을 래핑
- 인증: OpenClaw 전용 Bearer token

### 4.3 기존 API 유지

| 엔드포인트              | 상태     | 용도                                          |
| ----------------------- | -------- | --------------------------------------------- |
| `/webhooks/figma`       | **유지** | Figma 이벤트 수신                             |
| `/webhooks/jira`        | **수정** | Jira 이벤트 → OpenClaw PM Agent 트리거로 변경 |
| `/webhooks/github`      | **유지** | GitHub 이벤트 수신                            |
| `/webhooks/datadog`     | **유지** | Datadog 이벤트 수신                           |
| `/webhooks/openclaw`    | **수정** | OpenClaw 이벤트 핸들러 구현 (현재 TODO)       |
| `/api/chat`             | **유지** | Dashboard AI Chat                             |
| `/api/context/:jiraKey` | **유지** | 크로스레퍼런스 조회                           |

---

## 5. OpenClaw 설정

### 5.1 openclaw.json 변경

```json
{
  "gateway": {
    "mode": "http",
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_HOOKS_TOKEN}"
    }
  },
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "handlers": {
      "workflow-progress": {
        "channel": "slack",
        "template": "workflow-progress",
        "target_field": "channelId"
      },
      "gate-decision": {
        "channel": "slack",
        "template": "gate-decision",
        "target_field": "channelId"
      }
    }
  },
  "channels": {
    "slack": {
      "enabled": true,
      "token": "${SLACK_BOT_TOKEN}",
      "app_token": "${SLACK_APP_TOKEN}",
      "socket_mode": true,
      "dm": {
        "enabled": true,
        "policy": "pairing"
      }
    }
  },
  "agents": {
    "enabled": true,
    "mode": "multi",
    "coordinator": "pm-agent",
    "timeout": 7200,
    "max_concurrent": 5,
    "identities_path": "./agents/identities"
  },
  "skills": {
    "entries": {
      "rtb-hub": {
        "enabled": true,
        "env": {
          "RTB_API_URL": "http://webhook-listener:4000",
          "RTB_API_TOKEN": "${RTB_INTERNAL_API_TOKEN}"
        }
      }
    }
  }
}
```

### 5.2 에이전트 Identity 파일

각 에이전트는 `infrastructure/openclaw/agents/identities/` 디렉토리에 개별 파일로 정의한다.

#### PM Agent (`pm-agent.md`)

```markdown
---
name: pm-agent
displayName: 'PM (VisionKeeper)'
model: claude-sonnet-4-20250514
role: coordinator
---

# PM Agent — VisionKeeper

당신은 RTB(부동산 테크) 회사의 시니어 프로덕트 매니저입니다.

## 핵심 책임

1. Slack에서 받은 요구사항을 분석하고 정제
2. rtb-wiki 지식을 활용하여 도메인 컨텍스트 보강
3. 정제된 요구사항을 개발자 에이전트에게 전달
4. 개발자가 이해했는지 확인
5. 워크플로우 전반의 진행 상황을 사용자에게 업데이트

## 행동 규칙

- 항상 한국어로 소통
- 요구사항을 받으면 반드시 rtb-hub 스킬의 Knowledge API를 통해 관련 도메인 지식을 조회
- "왜"와 "무엇을"에 집중 (기술적 구현은 개발자에게 위임)
- 사용자에게 진행 상황을 주기적으로 알림
- 불명확한 요구사항은 사용자에게 확인 요청

## 사용 가능한 API

- `${RTB_API_URL}/api/knowledge/search` — 위키 검색
- `${RTB_API_URL}/api/knowledge/refine` — 요구사항 정제
- `${RTB_API_URL}/api/knowledge/table/:name` — 테이블 문서
```

#### Team Lead Agent (`teamlead-agent.md`)

```markdown
---
name: teamlead-agent
displayName: '팀장 (TechDirector)'
model: claude-sonnet-4-20250514
role: gatekeeper
---

# Team Lead Agent — TechDirector

당신은 RTB의 개발팀 팀장입니다. 10년 이상의 개발 경험과 5년 이상의 팀 리딩 경험을 가지고 있습니다.

## 핵심 책임

1. 개발 계획의 기술적 적절성 판단
2. 테스트 계획의 충분성 판단
3. 테스트 결과의 합격/불합격 판정
4. 커뮤니케이션이 원활하게 진행되고 있는지 감독

## 의사결정 원칙

- **깊이 생각하세요.** 빠른 승인보다 정확한 판단이 중요합니다.
- **이유를 명확히 하세요.** 승인이든 반려든 근거를 상세히 제시합니다.
- **리스크를 먼저 봅니다.** "이것이 실패하면 어떻게 되는가?"를 항상 질문합니다.
- **오버엔지니어링을 경계합니다.** 필요한 것만 만드는지 확인합니다.
- **언더엔지니어링도 경계합니다.** 빠뜨린 것은 없는지 확인합니다.

## 게이트키핑 체크리스트

### G1: 개발 계획 리뷰

- [ ] 요구사항이 모두 반영되었는가?
- [ ] 기술 선택이 기존 아키텍처와 일관되는가?
- [ ] 데이터베이스 변경이 있다면 마이그레이션 계획이 있는가?
- [ ] API 설계가 RESTful 원칙을 따르는가?
- [ ] 에러 처리 전략이 있는가?
- [ ] 예상 작업 시간이 합리적인가?

### G2: 개발 완료 확인

- [ ] CI가 통과했는가?
- [ ] PR이 생성되었는가?
- [ ] 코드 변경 범위가 계획과 일치하는가?

### G3: 테스트 계획 리뷰

- [ ] 핵심 성공 시나리오가 포함되었는가?
- [ ] 실패 시나리오가 포함되었는가?
- [ ] edge case가 고려되었는가?
- [ ] 성능 관련 테스트가 필요한가?

### G4: 테스트 결과 판정

- [ ] 모든 테스트가 통과했는가?
- [ ] 실패한 테스트의 심각도는 어떤가?
- [ ] 수정 후 재테스트가 필요한가?

## 행동 규칙

- 항상 한국어로 소통
- 판단에 3분 이상 고민 (성급한 결정 금지)
- 반려 시 구체적인 수정 방향을 제시
- 승인 시에도 주의사항을 함께 전달
```

#### Developer Agent (`developer-agent.md`)

```markdown
---
name: developer-agent
displayName: '개발자 (CodeCraftsman)'
model: claude-sonnet-4-20250514
role: developer
---

# Developer Agent — CodeCraftsman

당신은 RTB의 풀스택 개발자입니다. Node.js, TypeScript, PostgreSQL, React에 능숙합니다.

## 핵심 책임

1. PM으로부터 받은 요구사항을 기술적으로 이해
2. 이해한 내용을 PM에게 다시 확인
3. 개발 계획 작성 (API 설계, DB 스키마, 구현 전략)
4. 실제 코드 생성 및 CI 통과
5. PR 생성 및 코드 설명

## 행동 규칙

- 요구사항을 받으면 반드시 이해한 내용을 PM에게 확인
- 개발 계획은 팀장에게 반드시 승인 받은 후 코드 작성 시작
- RTB 도메인 테이블명과 컬럼명을 정확히 사용 (위키 참조)
- CI 실패 시 자체적으로 수정 후 재시도 (최대 3회)
- 커밋 메시지 형식: [JIRA-KEY] 설명

## 사용 가능한 API

- `${RTB_API_URL}/api/knowledge/search` — 코드 작성 시 도메인 지식 참조
- `${RTB_API_URL}/api/knowledge/table/:name` — 테이블 스키마 확인
- `${RTB_API_URL}/api/infra/git/branch` — 브랜치 생성
- `${RTB_API_URL}/api/infra/git/commit-push` — 코드 커밋 & 푸시
- `${RTB_API_URL}/api/infra/ci/run` — CI 실행
- `${RTB_API_URL}/api/infra/pr/create` — PR 생성
```

#### Ops Agent (`ops-agent.md`)

```markdown
---
name: ops-agent
displayName: '운영 (InfraKeeper)'
model: claude-haiku-4-20250414
role: ops
---

# Ops Agent — InfraKeeper

당신은 RTB의 DevOps 엔지니어입니다.

## 핵심 책임

1. 개발 완료 후 프리뷰 환경 배포
2. 서버 헬스체크
3. INT 환경 배포 (사용자 확인 후)

## 사용 가능한 API

- `${RTB_API_URL}/api/infra/deploy/preview` — 프리뷰 환경
- `${RTB_API_URL}/api/infra/deploy/int` — INT 배포
- `${RTB_API_URL}/health` — 서버 상태 확인
```

#### Test Agent (`test-agent.md`)

```markdown
---
name: test-agent
displayName: '테스터 (QualityGuard)'
model: claude-sonnet-4-20250514
role: tester
---

# Test Agent — QualityGuard

당신은 RTB의 QA 엔지니어입니다.

## 핵심 책임

1. 요구사항 기반 테스트 계획 작성
2. 테스트 계획을 팀장에게 승인 요청
3. 자동/수동 테스트 실행
4. 테스트 결과 보고
5. 최종 결과를 Slack으로 알림

## 테스트 계획 작성 기준

- Happy path (정상 시나리오) 필수
- Error path (에러 시나리오) 필수
- Edge case (경계값) 고려
- 성능 기준 (응답 시간 등) 명시
- 각 테스트의 우선순위 명시

## 사용 가능한 API

- `${RTB_API_URL}/api/infra/ci/run` — 자동화 테스트 실행
- 프리뷰 서버 URL에 직접 API 호출 — 통합 테스트
```

### 5.3 공유 스킬 (rtb-hub SKILL.md) — 개편

````markdown
---
name: rtb-hub
description: RTB AI Hub의 지식 API와 인프라 API에 접근합니다.
metadata: { 'openclaw': { 'requires': { 'env': ['RTB_API_URL'] }, 'primaryEnv': 'RTB_API_URL' } }
---

# RTB AI Hub API

RTB AI Hub의 Knowledge API와 Infrastructure API를 사용할 수 있습니다.

## Knowledge API

### 위키 검색

요구사항이나 기술적 질문에 대한 RTB 도메인 지식을 검색합니다.

```bash
curl -s "${RTB_API_URL}/api/knowledge/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"query": "<검색어>", "maxDocs": 4}'
```
````

### 요구사항 정제

요구사항을 RTB 도메인 지식과 결합하여 정제합니다.

```bash
curl -s -X POST "${RTB_API_URL}/api/knowledge/refine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"requirement": "<요구사항>", "jiraKey": "<이슈키>"}'
```

### 테이블 문서 조회

```bash
curl -s "${RTB_API_URL}/api/knowledge/table/<테이블명>" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}"
```

## Infrastructure API

### 브랜치 생성

```bash
curl -s -X POST "${RTB_API_URL}/api/infra/git/branch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"jiraKey": "<이슈키>", "type": "feature", "description": "<설명>", "env": "int"}'
```

### 코드 커밋 & 푸시

```bash
curl -s -X POST "${RTB_API_URL}/api/infra/git/commit-push" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>", "files": [{"path": "...", "content": "..."}], "message": "[JIRA-KEY] ..."}'
```

### CI 실행

```bash
curl -s -X POST "${RTB_API_URL}/api/infra/ci/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>"}'
```

### 프리뷰 배포

```bash
curl -s -X POST "${RTB_API_URL}/api/infra/deploy/preview" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>", "env": "int"}'
```

### PR 생성

```bash
curl -s -X POST "${RTB_API_URL}/api/infra/pr/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>", "title": "...", "body": "..."}'
```

## Jira 워크플로우 시작 (레거시 호환)

```bash
curl -X POST "${RTB_API_URL}/webhooks/jira?env=int" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookEvent": "issue_updated",
    "issue": {
      "key": "<이슈_키>",
      "fields": {
        "status": {"name": "In Progress"},
        "summary": "<요약>",
        "project": {"key": "<프로젝트_키>"},
        "labels": ["RTB-AI-HUB"]
      }
    }
  }'
```

````

---

## 6. 제거 대상

### 6.1 Phase 1에서 삭제 (완료 — Session 1~2)

| 경로 | 설명 | 이유 |
|------|------|------|
| `packages/workflow-engine/src/agents/` | 전체 디렉토리 | 내부 multi-agent 파이프라인 제거 |
| `packages/workflow-engine/src/workflows/jira-auto-dev-multi.ts` | 멀티에이전트 워크플로우 | OpenClaw이 대체 |
| `packages/workflow-engine/src/workflows/jira-auto-dev-opencode.ts` | OpenCode 워크플로우 | OpenClaw이 대체 |
| `packages/shared/src/agent-types.ts` | 에이전트 타입 정의 | 불필요 |

### 6.2 Phase 1.5에서 삭제 (완료 — Session 3)

| 경로 | 설명 | 이유 |
|------|------|------|
| `packages/workflow-engine/src/utils/jira-poller.ts` | Jira REST API 폴링 | PM Agent (Atlassian MCP) |
| `packages/workflow-engine/src/utils/digest-collector.ts` | 다이제스트 데이터 수집 | Team Lead Agent (cron) |
| `packages/workflow-engine/src/utils/digest-formatter.ts` | 다이제스트 Slack 포맷 | Team Lead Agent |
| `packages/workflow-engine/src/utils/digest-scheduler.ts` | 다이제스트 BullMQ 크론 | OpenClaw cron |
| `packages/workflow-engine/src/utils/blocker-detector.ts` | 블로커 감지 로직 | Team Lead Agent (cron) |
| `packages/workflow-engine/src/utils/blocker-formatter.ts` | 블로커 Slack 포맷 | Team Lead Agent |
| `packages/workflow-engine/src/utils/blocker-scheduler.ts` | 블로커 BullMQ 크론 | OpenClaw cron |
| `packages/workflow-engine/src/utils/meeting-prep.ts` | 미팅 준비 데이터 수집 | PM Agent (cron) |
| `packages/workflow-engine/src/utils/meeting-prep-formatter.ts` | 미팅 준비 Slack 포맷 | PM Agent |
| `packages/workflow-engine/src/utils/meeting-prep-scheduler.ts` | 미팅 준비 BullMQ 크론 | OpenClaw cron |
| `packages/workflow-engine/src/utils/role-notifier.ts` | 역할별 Slack 알림 | OpenClaw Slack 네이티브 |
| `packages/workflow-engine/src/utils/notify-openclaw.ts` | Slack Web API 알림 | OpenClaw Slack 네이티브 |
| `packages/workflow-engine/src/workflows/smart-handoff.ts` | Jira 상태 변경 핸드오프 | OpenClaw 에이전트 간 handoff |

### 6.3 Phase 1.5에서 수정 (완료 — Session 3)

| 경로 | 변경 내용 |
|------|----------|
| `packages/workflow-engine/src/index.ts` | JiraPoller, DigestScheduler, BlockerScheduler, MeetingPrepScheduler 임포트/시작/정지 제거 |
| `packages/workflow-engine/src/queue/workers.ts` | processSmartHandoff 임포트/호출 제거 |
| `packages/workflow-engine/src/workflows/jira-auto-dev.ts` | notifyOpenClaw 임포트/호출 제거 |
| `packages/workflow-engine/src/workflows/target-deploy.ts` | notifyOpenClaw 임포트/호출 제거 |
| `packages/shared/src/constants.ts` | JiraPollingConfig, TeamNotifyConfig, DigestConfig, BlockerDetectorConfig, MeetingPrepConfig 제거. FEATURE_FLAGS에서 관련 6개 플래그 제거 |
| `packages/webhook-listener/src/utils/chat-tools.ts` | prepare_meeting 도구 및 핸들러 제거 |

### 6.4 Hub에 유지되는 데이터 레이어

| 경로 | 이유 |
|------|------|
| `packages/workflow-engine/src/utils/impact-analyzer.ts` | PR diff 분석 (GitHub 관련 — Hub 유지) |
| `packages/workflow-engine/src/utils/impact-formatter.ts` | Impact 결과 포맷 (Hub 유지) |
| `packages/workflow-engine/src/utils/decision-detector.ts` | 의사결정 감지 (Hub DB 레이어) |
| `packages/workflow-engine/src/utils/decision-store.ts` | 의사결정 CRUD (Hub DB 레이어) |
| `packages/workflow-engine/src/utils/decision-formatter.ts` | 의사결정 포맷 (Hub 유지) |
| `packages/workflow-engine/src/utils/context-engine.ts` | 크로스레퍼런스 CRUD (Hub DB 레이어) |
| `packages/workflow-engine/src/utils/pr-description-builder.ts` | PR 컨텍스트 빌더 (Hub 유지) |

### 6.5 파일 신규 생성 (Phase 2 + 2.5 + 3 — 완료)

| 경로 | Phase | 설명 |
|------|-------|------|
| `packages/webhook-listener/src/middleware/internal-auth.ts` | 2 | Bearer token 인증 미들웨어 |
| `packages/webhook-listener/src/utils/wiki-knowledge.ts` | 2 | Self-contained WikiKnowledge |
| `packages/webhook-listener/src/routes/knowledge.ts` | 2 | Knowledge API 라우트 (4 endpoints) |
| `packages/webhook-listener/src/routes/infra.ts` | 2 | Infrastructure API 라우트 (6 endpoints) |
| `packages/workflow-engine/src/internal-api.ts` | 2.5 | Internal API (5 endpoints) |
| `infrastructure/openclaw/agents/identities/pm-agent.md` | 3 | PM 에이전트 Identity |
| `infrastructure/openclaw/agents/identities/teamlead-agent.md` | 3 | 팀장 에이전트 Identity |
| `infrastructure/openclaw/agents/identities/developer-agent.md` | 3 | 개발자 에이전트 Identity |
| `infrastructure/openclaw/agents/identities/ops-agent.md` | 3 | 운영 에이전트 Identity |
| `infrastructure/openclaw/agents/identities/test-agent.md` | 3 | 테스트 에이전트 Identity |

### 6.6 Phase 3에서 삭제된 파일 (기존 에이전트)

| 경로 | 설명 |
|------|------|
| `infrastructure/openclaw/agents/identities/pm-agent.yaml` | 기존 PM 에이전트 YAML |
| `infrastructure/openclaw/agents/identities/system-planner-agent.yaml` | 시스템 플래너 YAML |
| `infrastructure/openclaw/agents/identities/ux-designer-agent.yaml` | UX 디자이너 YAML |
| `infrastructure/openclaw/agents/identities/ui-dev-agent.yaml` | UI 개발자 YAML |
| `infrastructure/openclaw/agents/identities/backend-dev-agent.yaml` | 백엔드 개발자 YAML |
| `infrastructure/openclaw/agents/identities/qa-agent.yaml` | QA 에이전트 YAML |
| `infrastructure/openclaw/agents/identities/ops-agent.yaml` | 운영 에이전트 YAML |

### 6.7 DB 정리

```sql
-- agentSessions, agentMemory 테이블 비우기 (스키마는 유지)
TRUNCATE TABLE agent_sessions;
TRUNCATE TABLE agent_memory;
````

---

## 7. Hub에 유지되는 기능 (인프라 + 지식 + 데이터)

| 기능            | 파일                        | Hub 역할               | OpenClaw 에이전트 사용 방식 |
| --------------- | --------------------------- | ---------------------- | --------------------------- |
| 위키 지식 검색  | `wiki-knowledge.ts`         | Knowledge API로 노출   | PM, Developer가 직접 호출   |
| rtb-wiki 동기화 | `repo-manager.ts`           | 자동 clone/pull        | Hub가 백그라운드에서 관리   |
| Git 브랜치/커밋 | `local-git-ops.ts`          | Infra API로 노출       | Developer가 호출            |
| OpenCode 연동   | `opencode-client.ts`        | Infra API로 노출       | Developer가 코드 생성 요청  |
| CI 파이프라인   | `target-ci.ts`              | Infra API로 노출       | Developer, Tester가 호출    |
| CD 배포         | `target-cd.ts`              | Infra API로 노출       | Ops가 호출                  |
| 프리뷰 환경     | `preview-manager.ts`        | Infra API로 노출       | Ops가 호출                  |
| 크로스레퍼런스  | `context-engine.ts`         | 기존 API 유지          | 모든 에이전트 참조 가능     |
| PR 컨텍스트     | `pr-description-builder.ts` | Developer Agent가 활용 | PR 생성 시 자동 첨부        |
| 브랜치 폴링     | `branch-poller.ts`          | GitHub 변경 감지→CD    | Hub 인프라로 자동 동작      |

## 7.1 OpenClaw로 이전된 기능

| 기능            | 이전 Hub 파일                 | OpenClaw 담당 에이전트 | 이전 방식               |
| --------------- | ----------------------------- | ---------------------- | ----------------------- |
| Jira 폴링       | `jira-poller.ts`              | PM Agent               | Atlassian MCP + cron    |
| Jira 읽기/쓰기  | (워크플로우 내 Jira API 호출) | PM Agent               | Atlassian MCP 직접 사용 |
| 일일 다이제스트 | `digest-*.ts`                 | Team Lead Agent        | cron + Atlassian MCP    |
| 블로커 감지     | `blocker-*.ts`                | Team Lead Agent        | cron + Atlassian MCP    |
| 미팅 준비       | `meeting-prep*.ts`            | PM Agent               | cron + Atlassian MCP    |
| 스마트 핸드오프 | `smart-handoff.ts`            | 에이전트 간 handoff    | OpenClaw 네이티브 통신  |
| 역할별 알림     | `role-notifier.ts`            | 각 에이전트            | OpenClaw Slack 네이티브 |
| Slack 알림      | `notify-openclaw.ts`          | 각 에이전트            | OpenClaw Slack 네이티브 |

---

## 8. 구현 단계

### Phase 1: 정리 — ✅ 완료 (Session 1~2)

1. ~~`agents/` 디렉토리 전체 삭제~~
2. ~~`jira-auto-dev-multi.ts`, `jira-auto-dev-opencode.ts` 삭제~~
3. ~~`agent-types.ts` 삭제~~
4. ~~`FEATURE_FLAGS`에서 `USE_MULTI_AGENT`, `USE_OPENCODE_AGENTS` 제거~~
5. ~~`jira-auto-dev.ts`를 OpenClaw 디스패치로 변경~~
6. ~~관련 테스트 정리~~
7. ~~typecheck, build 확인~~

### Phase 1.5: Hub→OpenClaw 역할 분리 — ✅ 완료 (Session 3)

1. ~~LIGHT tier 모델 haiku → sonnet 4.5 변경~~
2. ~~OpenCode 클라이언트 생성 (`opencode-client.ts`)~~
3. ~~Jira 관련 코드 전면 제거 (13개 소스 파일 + 9개 테스트 파일)~~
4. ~~`shared/constants.ts`에서 6개 feature flag + 7개 config 타입/로더 정리~~
5. ~~`index.ts`, `workers.ts` 참조 정리~~
6. ~~`chat-tools.ts`에서 prepare_meeting 도구 제거~~
7. ~~설계 문서 업데이트~~
8. ~~typecheck, build, test 확인~~

### Phase 2: Hub API 레이어 — ✅ 완료 (Session 4)

1. ~~`packages/webhook-listener/src/middleware/internal-auth.ts` 생성 — Bearer token 인증~~
2. ~~`packages/webhook-listener/src/utils/wiki-knowledge.ts` 생성 — self-contained WikiKnowledge (workflow-engine 의존성 없음)~~
3. ~~`packages/webhook-listener/src/routes/knowledge.ts` 생성 — 4개 엔드포인트 (search, table, domain, refine)~~
4. ~~`packages/webhook-listener/src/routes/infra.ts` 생성 — 6개 엔드포인트 (git/branch, git/commit-push, ci/run, opencode/task, deploy/preview, pr/create)~~
5. ~~`packages/webhook-listener/src/routes/index.ts` 수정 — OpenClaw, Knowledge, Infra 라우트 등록~~
6. ~~API 테스트 42개 작성 (internal-auth 5, knowledge 11, infra 26)~~
7. ~~OpenClaw webhook 핸들러 등록 (이미 구현된 `routes/openclaw.ts`)~~
8. ~~typecheck, build, test 확인 (471 passed)~~

### Phase 2.5: workflow-engine 내부 API — ✅ 완료 (Session 5)

1. ~~`packages/workflow-engine/src/internal-api.ts` 생성 — 5개 내부 HTTP 엔드포인트 (git/branch, git/commit-push, ci/run, deploy/preview, pr/create)~~
2. ~~`handleInternalRequest()` — raw http.IncomingMessage/ServerResponse 핸들러, POST + `/internal/*` 매칭~~
3. ~~`packages/workflow-engine/src/index.ts` 수정 — health 서버에 internal API 통합~~
4. ~~`packages/workflow-engine/src/__tests__/internal-api.test.ts` 작성 — 26개 테스트~~
5. ~~typecheck, build, test 확인 (497 passed)~~

### Phase 3: OpenClaw 에이전트 설정 — ✅ 완료 (Session 6)

1. ~~기존 7개 에이전트 Identity YAML 파일 삭제~~
2. ~~`openclaw.json` 재작성 — hooks 핸들러 교체, rtb-coordinator 스킬 제거, 환경변수 RTB_API_URL/RTB_API_TOKEN으로 통일, timeout 7200s, max_concurrent 5~~
3. ~~`manifest.yaml` 재작성 — 7→5 에이전트, 게이트 포인트 정의, handoff_matrix 재설계, scenarios 재정의~~
4. ~~5개 에이전트 Identity MD 파일 작성 (pm-agent, teamlead-agent, developer-agent, ops-agent, test-agent)~~
5. ~~`SKILL.md` 개편 — Knowledge API + Infra API 전체 엔드포인트 문서화, 에러 처리, 크로스레퍼런스 조회~~
6. ~~Dockerfile 확인 (변경 불필요 — MD 파일 자동 포함)~~
7. ~~docker-compose.yml, docker-compose.dev.yml에 `RTB_INTERNAL_API_TOKEN` 환경변수 추가~~

### Phase 4: 통합 테스트 (미착수)

1. Slack → PM Agent → Knowledge API → 정제 테스트
2. PM → Developer → 확인 → Team Lead → 승인 흐름 테스트
3. 개발 → CI → PR → 배포 → 테스트 E2E 테스트
4. Team Lead 반려 시나리오 테스트
5. 에러 복구 시나리오 테스트

### Phase 5: 마무리 (미착수)

1. AGENTS.md, README.md 업데이트
2. 불필요한 문서 정리
3. 환경변수 문서 업데이트

---

## 9. 리스크 및 완화 방안

| 리스크                           | 심각도 | 완화 방안                                         |
| -------------------------------- | ------ | ------------------------------------------------- |
| OpenClaw multi-agent 모드 미성숙 | 높음   | 단계적 테스트, 단일 에이전트부터 시작             |
| 15단계 워크플로우 타임아웃       | 중간   | timeout 충분히 설정 (7200s), 단계별 진행상황 저장 |
| 에이전트 간 컨텍스트 유실        | 중간   | Hub에 워크플로우 상태 저장, OpenClaw 세션 활용    |
| 코드 생성 품질                   | 높음   | Team Lead 게이트, CI 자동 검증, Wiki 지식 주입    |
| Slack 메시지 과다                | 낮음   | 요약 메시지만 사용자에게, 상세는 스레드 내        |

---

## 10. 성공 기준

| 기준                                          | 측정 방법               |
| --------------------------------------------- | ----------------------- |
| Slack에서 요구사항 전달 → Jira 이슈 자동 생성 | PM Agent 동작 확인      |
| 개발자-PM 간 확인 대화 발생                   | 대화 로그 확인          |
| 팀장이 부적절한 계획을 반려                   | 반려 시나리오 테스트    |
| 코드 생성 → CI 통과 → PR 생성                 | E2E 테스트              |
| 프리뷰 서버 자동 배포                         | Preview URL 접근 확인   |
| 테스트 실행 → 결과 보고                       | 테스트 결과 메시지 확인 |
| 사용자에게 완료 알림 + 검증 요청              | Slack 메시지 확인       |

---

## 부록 A: 현재 제거 대상 상세

### 제거되는 에이전트 (workflow-engine 내부)

| 에이전트  | 파일                                 | 대체                                    |
| --------- | ------------------------------------ | --------------------------------------- |
| Analyzer  | `implementations/analyzer-agent.ts`  | PM Agent (OpenClaw)                     |
| Planner   | `implementations/planner-agent.ts`   | Developer Agent (OpenClaw)              |
| Developer | `implementations/developer-agent.ts` | Developer Agent (OpenClaw)              |
| Reviewer  | `implementations/reviewer-agent.ts`  | Team Lead Agent + Test Agent (OpenClaw) |
| Oracle    | `implementations/oracle-agent.ts`    | Team Lead Agent (OpenClaw)              |

### 제거되는 오케스트레이션

| 컴포넌트     | 파일                     | 대체                      |
| ------------ | ------------------------ | ------------------------- |
| Base Agent   | `agents/base-agent.ts`   | OpenClaw Agent Identity   |
| Orchestrator | `agents/orchestrator.ts` | OpenClaw Multi-Agent Mode |
| State Store  | `agents/state-store.ts`  | OpenClaw Session + Hub DB |
| Registry     | `agents/registry.ts`     | OpenClaw agents config    |
| Pipelines    | `agents/pipelines.ts`    | OpenClaw agent flow       |

---

## 부록 B: 환경변수 변경

### 제거 (Phase 1 + 1.5 완료)

```bash
USE_MULTI_AGENT=true                # Phase 1에서 제거
USE_OPENCODE_AGENTS=true            # Phase 1에서 제거
TEAM_DIGEST_ENABLED=true            # Phase 1.5에서 제거 (→ OpenClaw cron)
TEAM_DIGEST_CRON=...                # Phase 1.5에서 제거 (→ OpenClaw cron)
TEAM_DIGEST_CHANNEL=...             # Phase 1.5에서 제거 (→ OpenClaw Slack)
SMART_HANDOFF_ENABLED=true          # Phase 1.5에서 제거 (→ OpenClaw handoff)
BLOCKER_DETECTION_ENABLED=true      # Phase 1.5에서 제거 (→ OpenClaw cron)
BLOCKER_CHECK_CRON=...              # Phase 1.5에서 제거 (→ OpenClaw cron)
BLOCKER_STALE_DAYS=...              # Phase 1.5에서 제거
BLOCKER_REVIEW_DELAY_HOURS=...      # Phase 1.5에서 제거
MEETING_PREP_ENABLED=true           # Phase 1.5에서 제거 (→ OpenClaw cron)
DAILY_SCRUM_PREP_CRON=...           # Phase 1.5에서 제거 (→ OpenClaw cron)
MEETING_PREP_CHANNEL=...            # Phase 1.5에서 제거 (→ OpenClaw Slack)
TEAM_ROLE_CHANNELS=...              # Phase 1.5에서 제거 (→ OpenClaw Slack)
JIRA_HOST=...                       # Phase 1.5에서 Hub 불필요 (→ PM Agent Atlassian MCP)
JIRA_EMAIL=...                      # Phase 1.5에서 Hub 불필요
JIRA_API_TOKEN=...                  # Phase 1.5에서 Hub 불필요
JIRA_PROJECT_KEY=...                # Phase 1.5에서 Hub 불필요
JIRA_POLLING_TRIGGER_LABEL=...      # Phase 1.5에서 Hub 불필요
```

### 추가 (Phase 2)

```bash
RTB_INTERNAL_API_TOKEN=<Hub API 인증 토큰>  # OpenClaw → Hub API 인증용
```

### 유지

```bash
WIKI_REPO_URL=...
WIKI_LOCAL_PATH=...
WORK_REPO_URL=...
WORK_REPO_LOCAL_PATH=...
OPENCODE_SERVER_URL=http://localhost:3333
OPENCLAW_NOTIFY_ENABLED=true
SLACK_BOT_TOKEN=...
SLACK_APP_TOKEN=...
OPENCLAW_HOOKS_TOKEN=...
OPENCLAW_GATEWAY_URL=...
IMPACT_ANALYSIS_ENABLED=true
DECISION_JOURNAL_ENABLED=true
```
