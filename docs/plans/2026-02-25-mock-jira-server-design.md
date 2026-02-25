# Mock Jira Server Design

로컬 테스트용 Mock Jira 서버. 양방향(웹훅 수신 + API 응답) + 웹 UI로 전체 bug-fix 워크플로우를 로컬에서 E2E 검증한다.

## Package Structure

```
packages/mock-jira/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── data/                       # JSON 파일 저장소 (gitignored)
│   └── .gitkeep
├── src/
│   ├── server.ts               # Express 앱 엔트리 (:3001)
│   ├── store.ts                # JSON 파일 기반 이슈 CRUD
│   ├── routes/
│   │   ├── issues.ts           # /rest/api/3/issue/* (CRUD, transition, comment)
│   │   ├── search.ts           # /rest/api/3/search/jql
│   │   ├── users.ts            # /rest/api/3/user/search
│   │   └── webhook-trigger.ts  # POST /mock/trigger → webhook-listener로 발사
│   ├── ui/
│   │   └── pages.ts            # 서버사이드 HTML 렌더링 (이슈 목록/상세/생성)
│   └── seed.ts                 # 초기 데모 데이터 생성
```

## REST API Endpoints

워크플로에서 실제 호출하는 API만 구현한다.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/rest/api/3/issue` | 이슈 생성 (Bug, Story, Task, Subtask, Epic) |
| `GET` | `/rest/api/3/issue/:issueKey` | 이슈 상세 조회 |
| `PUT` | `/rest/api/3/issue/:issueKey` | 이슈 수정 |
| `GET` | `/rest/api/3/issue/:issueKey/transitions` | 가능한 전환 목록 |
| `POST` | `/rest/api/3/issue/:issueKey/transitions` | 상태 전환 |
| `POST` | `/rest/api/3/issue/:issueKey/comment` | 댓글 추가 |
| `GET` | `/rest/api/3/search` | JQL 검색 (project, status, issuetype 필터) |
| `GET` | `/rest/api/3/user/search` | 사용자 검색 (고정 mock 유저 반환) |

### Response Format

Jira REST API v3 응답 구조의 필수 필드만 포함:

```json
{
  "key": "PROJ-1",
  "id": "10001",
  "fields": {
    "issuetype": { "name": "Bug" },
    "status": { "name": "Open" },
    "summary": "API returns 500 on empty payload",
    "description": "...",
    "project": { "key": "PROJ" },
    "labels": ["bug", "api"],
    "components": [],
    "comment": { "comments": [] },
    "created": "2026-02-25T10:00:00.000Z",
    "updated": "2026-02-25T10:00:00.000Z"
  }
}
```

### State Machine

```
Open → In Progress → In Review → Done
  ↘ Closed
```

각 전환에 고정 transitionId 부여. `getTransitions`는 현재 상태에서 가능한 전환만 반환.

## Webhook Trigger

내부 API로 webhook-listener에 이벤트를 발사한다.

```
POST /mock/trigger
Body: { "issueKey": "PROJ-1", "event": "issue_created" | "issue_updated" }
```

동작:
1. Store에서 이슈 조회
2. Jira 웹훅 페이로드 형식으로 변환 (`{ webhookEvent, issue: { key, fields } }`)
3. `http://localhost:4000/webhooks/jira?env=int`로 POST
4. 응답 반환 (202 accepted 여부)

## Web UI

서버사이드 HTML + Tailwind CDN. React가 아닌 mock 서버 자체에서 렌더링.

| Path | Page | Description |
|------|------|-------------|
| `/` | 이슈 목록 | 테이블: key, type, status, summary, updated |
| `/issue/:key` | 이슈 상세 | 필드 전체 + 댓글 타임라인 + 상태 전환 버튼 |
| `/create` | 이슈 생성 폼 | type, summary, description, labels, priority |

각 페이지에 "Send Webhook" 버튼 → `/mock/trigger` 호출.

### Dashboard Integration

Vite proxy로 연동:

```ts
// dashboard vite.config.ts
proxy: {
  '/mock-jira': {
    target: 'http://localhost:3001',
    rewrite: (path) => path.replace(/^\/mock-jira/, ''),
  }
}
```

Dashboard 사이드바에 `MOCK_JIRA=true`일 때만 "Mock Jira" 링크 노출.

## Local-Only Toggle

### Environment Variables

```bash
MOCK_JIRA=true          # mock-jira 서버 기동 여부
MOCK_JIRA_PORT=3001     # 포트 (기본 3001)
```

### pnpm dev Integration

```json
{
  "dev:mock-jira": "tsx packages/mock-jira/src/server.ts",
  "dev": "기존 서비스 + MOCK_JIRA=true 시 mock-jira 함께 기동"
}
```

`MOCK_JIRA=true pnpm dev` → 전체 서비스 + mock-jira 동시 기동.

### Jira API Routing

`MOCK_JIRA=true`일 때 MCP Jira 엔드포인트를 mock 서버로 전환:

```ts
// packages/shared/src/constants.ts
JIRA: process.env.MOCK_JIRA === 'true'
  ? `http://localhost:${process.env.MOCK_JIRA_PORT || '3001'}`
  : process.env.NATIVE_MCP_JIRA_ENDPOINT || 'http://localhost:3000',
```

기존 코드 변경 없이 환경 변수만으로 mock ↔ 실제 Jira 전환.

### Data Storage

- JSON 파일 기반: `packages/mock-jira/data/*.json`
- gitignored (데이터 파일), `.gitkeep`만 커밋
- 서버 재시작 시에도 유지, `seed.ts`로 초기 데이터 생성 가능

## Data Flow (Full Loop)

```
[Mock Jira UI] → POST /mock/trigger
    ↓
[webhook-listener :4000] /webhooks/jira?env=int
    ↓
[pg-boss queue] jira-queue
    ↓
[workflow-engine] classifyTicket → routeJiraEvent → processBugFix
    ↓
[Mock Jira :3001] POST /rest/api/3/issue/:key/comment (결과 댓글)
                   POST /rest/api/3/issue/:key/transitions (상태 전환)
    ↓
[Mock Jira UI] 이슈 상세에서 댓글/상태 변경 확인
```
