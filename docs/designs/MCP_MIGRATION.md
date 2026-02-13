# MCP 서버 마이그레이션 설계

> **상태**: ✅ 완료 (Phase M-1~M-5 전체 완료)
> **우선순위**: Phase C 이후 — 인프라 개선
> **난이도**: 중상 — 클라이언트/서버/Docker 3개 레이어 동시 변경
> **의존성**: 없음 (기존 기능과 독립)
> **완료일**: 2026-02-11

---

## 1. 목표

커스텀 MCP 서버 4개를 **공식/커뮤니티 MCP 서버**로 교체하고,
클라이언트를 `@modelcontextprotocol/sdk` 네이티브 Client로 전환한다.

### 왜 마이그레이션하는가

| 현재 (커스텀)                     | 전환 후 (공식/커뮤니티)                |
| --------------------------------- | -------------------------------------- |
| 자체 Express HTTP 래퍼 유지보수   | 커뮤니티가 유지보수                    |
| MCP 스펙 변경 시 직접 대응        | 공식 서버가 스펙 변경에 자동 대응      |
| 커스텀 `fetch()` 기반 클라이언트  | SDK 표준 Client + Transport            |
| 4개 서버 × Dockerfile × 코드 유지 | npm 패키지 또는 Docker 이미지 사용     |
| 회사 자체 구현 → 보안 감사 부담   | 공식/검증된 패키지 → 컴플라이언스 유리 |

## 2. 현재 아키텍처

```
┌──────────────────┐       fetch()          ┌────────────────────────┐
│  workflow-engine  │ ──── HTTP REST ─────→  │  커스텀 MCP 서버       │
│                   │   /tools/:name/call    │  (Express + MCP SDK)   │
│  MCPClient class  │                        │                        │
│  getMcpClient()   │                        │  mcp-jira-int:3000     │
│                   │                        │  mcp-jira-stg:3000     │
└──────────────────┘                        │  mcp-github-int:3000   │
                                             │  mcp-figma-int:3000    │
                                             │  mcp-datadog-int:3000  │
                                             └────────────────────────┘
```

### 현재 커스텀 MCP 서버 구조 (4개 동일 패턴)

```typescript
// mcp-servers/{service}/src/index.ts
const server = new McpServer({ name: 'rtb-mcp-jira', version: '1.0.0' });

// MCP 도구 등록
for (const tool of allTools) {
  server.tool(tool.name, tool.description, tool.schema, tool.handler);
}

// 커스텀 Express HTTP 래퍼 (표준 MCP가 아닌 자체 프로토콜)
app.post('/tools/:name/call', async (req, res) => {
  const tool = toolMap.get(req.params.name);
  const result = await tool.handler(req.body);
  res.json(result);
});
```

### 현재 도구 목록

| 서비스          | 도구 (8+10+6+6 = 30개)                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Jira** (8)    | createEpic, createIssue, createSubtask, getIssue, searchIssues, updateIssue, transitionIssue, addComment                                                                 |
| **GitHub** (10) | createBranch, createCommit, createPullRequest, createReview, createReviewComment, createIssueComment, getPullRequest, getPullRequestDiff, mergePullRequest, searchIssues |
| **Figma** (6)   | getFile, getFileNodes, getFileComponents, getFileStyles, getFileVariables, getComments                                                                                   |
| **Datadog** (6) | getLogs, queryMetrics, getTraces, getAlerts, getMonitors, createMonitor                                                                                                  |

## 3. 목표 아키텍처

```
┌──────────────────┐    MCP Protocol      ┌─────────────────────────────┐
│  workflow-engine  │ ── (Streamable ───→  │  공식/커뮤니티 MCP 서버      │
│                   │     HTTP 또는         │                             │
│  MCP SDK Client   │     stdio→HTTP       │  github-mcp-server (공식)   │
│  NativeMCPClient  │     bridge)          │  atlassian-jira-mcp (커뮤)  │
│                   │                      │  figma-mcp (공식, Remote)   │
└──────────────────┘                      │  mcp-server-datadog (커뮤)  │
                                           └─────────────────────────────┘
```

### 전환 대상 서버

| 서비스      | 공식/커뮤니티 서버                   | 전송 방식                  | 비고                                                |
| ----------- | ------------------------------------ | -------------------------- | --------------------------------------------------- |
| **GitHub**  | `github/github-mcp-server`           | Docker stdio / Remote HTTP | ✅ **공식** (GitHub), 26.8k⭐, 50+ tools, 100% 커버 |
| **Jira**    | `@aashari/mcp-server-atlassian-jira` | stdio                      | ✅ v3.3.0, Generic REST 5도구, 100% 커버            |
| **Figma**   | Figma 공식 MCP 서버                  | Remote HTTP (Streamable)   | ✅ **공식** (Figma), 7 tools, `mcp.figma.com/mcp`   |
| **Datadog** | `@winor30/mcp-server-datadog`        | stdio                      | ✅ v1.7.0, 20도구, createMonitor만 갭 (프록시 확장) |

## 4. 전송 방식 전략

### 문제: stdio vs Docker 컨테이너

공식 MCP 서버 대부분은 **stdio** 전송을 사용한다 (프로세스 내 stdin/stdout 파이프).
그러나 우리 아키텍처는 **Docker 컨테이너 간 통신**이 필요하다.

### 해결: stdio→HTTP 브릿지

각 MCP 서버 컨테이너에서 stdio 서버를 HTTP로 노출하는 브릿지를 사용한다.

**방법 A: `supergateway` 사용 (권장)**

[supergateway](https://github.com/supercorp-ai/supergateway)는 stdio MCP 서버를
SSE/Streamable HTTP로 변환하는 경량 브릿지다.

```dockerfile
# Dockerfile.mcp-github
FROM node:22-slim
RUN npm install -g supergateway
COPY start.sh /start.sh
CMD ["supergateway", "--stdio", "github-mcp-server stdio", "--port", "3000"]
```

```
┌────────────────┐  Streamable HTTP   ┌─────────────────────────────┐
│ workflow-engine │ ────────────────→  │ supergateway (:3000)         │
│ (SDK Client)   │                    │   └→ stdio → github-mcp-srv │
└────────────────┘                    └─────────────────────────────┘
```

**방법 B: `mcp-proxy` 사용**

[mcp-proxy](https://github.com/nicholascross/mcp-proxy)는 유사한 stdio→HTTP 프록시.

**방법 C: MCP 서버 자체가 HTTP 지원하는 경우**

`github/github-mcp-server`는 Remote HTTP 모드를 직접 지원한다:

```
https://api.githubcopilot.com/mcp/  (GitHub 호스팅)
```

→ GitHub만 Remote HTTP를 직접 사용하고, 나머지는 브릿지를 사용할 수 있다.

### 전송 방식 결정

| 서비스      | 전송 방식                                    | 상세                                                                     |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| **GitHub**  | Remote HTTP 또는 Docker stdio + supergateway | 공식 Remote 엔드포인트 사용 가능                                         |
| **Jira**    | Docker stdio + supergateway                  | 컨테이너 내 npm 서버 + 브릿지                                            |
| **Figma**   | Remote HTTP 직접 (Streamable HTTP)           | `mcp.figma.com/mcp` 또는 Desktop `localhost:3845` — Docker/브릿지 불필요 |
| **Datadog** | Docker stdio + supergateway                  | 컨테이너 내 npm 서버 + 브릿지                                            |

## 5. 클라이언트 전환 설계

### 5.1 인터페이스 추출

기존 `MCPClient`에서 인터페이스를 추출하여 점진적 전환을 지원한다.

```typescript
// packages/workflow-engine/src/clients/mcp-client-interface.ts

export interface IMCPClient {
  callTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolCall>;
  listTools(): Promise<MCPTool[]>;
  healthCheck(): Promise<boolean>;
}
```

### 5.2 네이티브 MCP 클라이언트

`@modelcontextprotocol/sdk`의 `Client`를 사용하는 새 구현체.

```typescript
// packages/workflow-engine/src/clients/native-mcp-client.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class NativeMCPClient implements IMCPClient {
  private client: Client;
  private endpoint: string;

  constructor(endpoint: string, serverName: string) {
    this.endpoint = endpoint;
    this.client = new Client({ name: `rtb-${serverName}`, version: '1.0.0' });
  }

  async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.endpoint));
    await this.client.connect(transport);
  }

  async callTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolCall> {
    const result = await this.client.callTool({ name: toolName, arguments: input });
    return {
      toolName,
      input,
      output: result,
    };
  }

  async listTools(): Promise<MCPTool[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.listTools();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
```

### 5.3 Feature Flag 전환

```typescript
// packages/workflow-engine/src/clients/mcp-client.ts (수정)

import { FEATURE_FLAGS } from '@rtb-ai-hub/shared';

export function getMcpClient(service: McpService, env: Environment): IMCPClient {
  if (FEATURE_FLAGS.USE_NATIVE_MCP) {
    return getNativeMcpClient(service, env);
  }
  // 기존 HTTP 클라이언트 (폴백)
  const endpoints = MCP_ENDPOINTS_BY_ENV[env];
  return new MCPClient(endpoints[service], `${service.toLowerCase()}-${env}`);
}
```

### 5.4 도구 이름 매핑

공식 서버의 도구 이름이 우리 커스텀 도구와 다를 수 있다.
매핑 레이어를 추가하여 기존 호출 코드를 변경하지 않는다.

```typescript
// packages/workflow-engine/src/clients/tool-name-mapper.ts

const TOOL_NAME_MAP: Record<string, Record<string, string>> = {
  GITHUB: {
    // 우리 도구명 → 공식 서버 도구명
    createBranch: 'create_branch',
    createPullRequest: 'create_pull_request',
    getPullRequest: 'get_pull_request',
    getPullRequestDiff: 'get_pull_request_files',
    createReview: 'create_pull_request_review',
    mergePullRequest: 'merge_pull_request',
    createCommit: 'push_files',
    createReviewComment: 'create_pull_request_review', // 통합됨
    createIssueComment: 'add_issue_comment',
    searchIssues: 'search_issues',
  },
  JIRA: {
    // Generic REST 방식 — 도구명 + path + body 구성 매핑
    // callTool('createIssue', params) → callTool('jira_post', { path, body })
    getIssue: { tool: 'jira_get', pathTemplate: '/rest/api/3/issue/{issueKey}' },
    searchIssues: { tool: 'jira_get', pathTemplate: '/rest/api/3/search/jql' },
    createIssue: { tool: 'jira_post', path: '/rest/api/3/issue' },
    createEpic: { tool: 'jira_post', path: '/rest/api/3/issue' }, // issueType=Epic in body
    createSubtask: { tool: 'jira_post', path: '/rest/api/3/issue' }, // parent in body
    updateIssue: { tool: 'jira_put', pathTemplate: '/rest/api/3/issue/{issueKey}' },
    transitionIssue: {
      tool: 'jira_post',
      pathTemplate: '/rest/api/3/issue/{issueKey}/transitions',
    },
    addComment: { tool: 'jira_post', pathTemplate: '/rest/api/3/issue/{issueKey}/comment' },
  },
  FIGMA: {
    // Figma 공식 MCP 서버 (mcp.figma.com/mcp)
    // 공식 서버는 디자인→코드 변환에 최적화된 가공 데이터 반환 (Raw JSON 아님)
    // figma-context.ts의 fetchFigmaDesignData() 리팩토링 필요
    getFile: 'get_metadata', // XML 메타데이터 (레이어 ID, 이름, 타입, 위치, 크기)
    getFileNodes: 'get_design_context', // 디자인 컨텍스트 (기본 React+Tailwind, 변경 가능)
    getFileComponents: 'get_code_connect_map', // Figma 노드 ↔ 코드 컴포넌트 매핑
    getFileStyles: 'get_variable_defs', // 변수/스타일 (색상, 스페이싱, 타이포그래피)
    getFileVariables: 'get_variable_defs', // 동일 도구로 커버
    getComments: 'UNSUPPORTED', // ❌ 미지원 (현재 워크플로우에서 미사용)
  },
  DATADOG: {
    getLogs: 'get_logs',
    queryMetrics: 'query_metrics',
    getTraces: 'list_traces',
    getAlerts: 'list_incidents',
    getMonitors: 'get_monitors',
    createMonitor: 'CUSTOM_EXTENSION', // 프록시 확장 필요
  },
};
```

## 6. Docker 구성 변경

### 6.1 현재 Docker 구성 (제거 대상)

```yaml
# docker-compose.yml — 현재 (커스텀 빌드)
mcp-jira-int:
  build:
    context: ./mcp-servers/jira
    dockerfile: Dockerfile
  environment:
    JIRA_HOST: ${INT_JIRA_HOST:-${JIRA_HOST}}
    JIRA_EMAIL: ${INT_JIRA_EMAIL:-${JIRA_EMAIL}}
    JIRA_API_TOKEN: ${INT_JIRA_API_TOKEN:-${JIRA_API_TOKEN}}
```

### 6.2 새 Docker 구성 (공식 서버 + 브릿지)

```yaml
# docker-compose.yml — 전환 후

# GitHub: 공식 Docker 이미지 사용
mcp-github-int:
  image: ghcr.io/github/github-mcp-server
  container_name: rtb-mcp-github-int
  environment:
    GITHUB_PERSONAL_ACCESS_TOKEN: ${INT_GITHUB_TOKEN:-${GITHUB_TOKEN}}
    GITHUB_TOOLSETS: 'repos,issues,pull_requests'
  # supergateway로 stdio→HTTP 브릿지
  entrypoint: ['supergateway', '--stdio', 'github-mcp-server stdio', '--port', '3000']
  networks:
    - rtb-network
  healthcheck:
    test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
    interval: 30s
    timeout: 10s
    retries: 3

# Jira: 커뮤니티 npm 패키지 + 브릿지
mcp-jira-int:
  build:
    context: ./mcp-servers/jira-native
    dockerfile: Dockerfile
  container_name: rtb-mcp-jira-int
  environment:
    JIRA_HOST: ${INT_JIRA_HOST:-${JIRA_HOST}}
    JIRA_EMAIL: ${INT_JIRA_EMAIL:-${JIRA_EMAIL}}
    JIRA_API_TOKEN: ${INT_JIRA_API_TOKEN:-${JIRA_API_TOKEN}}
  networks:
    - rtb-network

# Figma: Docker 불필요 — 공식 서버가 Remote HTTP 직접 지원
# workflow-engine에서 mcp.figma.com/mcp 또는 localhost:3845로 직접 연결
# Figma 전용 Docker 컨테이너/supergateway 필요 없음

# Datadog: 동일 패턴 (npm + supergateway)
```

### 6.3 브릿지 Dockerfile 패턴

```dockerfile
# mcp-servers/jira-native/Dockerfile
FROM node:22-slim
RUN npm install -g @aashari/mcp-server-atlassian-jira supergateway
EXPOSE 3000
CMD ["supergateway", "--stdio", "mcp-server-atlassian-jira", "--port", "3000"]
```

## 7. 도구 커버리지 갭 분석

### GitHub (공식 서버) — ✅ 완전 커버

| 우리 도구           | 공식 서버 도구                               | 상태 |
| ------------------- | -------------------------------------------- | ---- |
| createBranch        | `create_branch`                              | ✅   |
| createCommit        | `push_files` (다중 파일 지원)                | ✅   |
| createPullRequest   | `create_pull_request`                        | ✅   |
| createReview        | `create_pull_request_review`                 | ✅   |
| createReviewComment | `create_pull_request_review` (comments 포함) | ✅   |
| createIssueComment  | `add_issue_comment`                          | ✅   |
| getPullRequest      | `get_pull_request`                           | ✅   |
| getPullRequestDiff  | `get_pull_request_files`                     | ✅   |
| mergePullRequest    | `merge_pull_request`                         | ✅   |
| searchIssues        | `search_issues`                              | ✅   |

**추가 도구**: 50+ tools (actions, code_security, discussions 등)

### Jira (커뮤니티) — ✅ 완전 커버 (Generic REST 방식)

> **서버**: `@aashari/mcp-server-atlassian-jira` v3.3.0 (53⭐, 481 commits)
> **방식**: v3.0에서 8개 specific 도구 → **5개 generic HTTP 도구**로 전환
> **도구**: `jira_get`, `jira_post`, `jira_put`, `jira_patch`, `jira_delete`

모든 Jira REST API v3 엔드포인트에 직접 접근 가능. JMESPath 필터링 지원.
TOON(Token-Oriented Object Notation) 포맷으로 토큰 30-60% 절감.

| 우리 도구       | 커뮤니티 접근 방식                                            | 상태 |
| --------------- | ------------------------------------------------------------- | ---- |
| getIssue        | `jira_get` path=`/rest/api/3/issue/{key}`                     | ✅   |
| searchIssues    | `jira_get` path=`/rest/api/3/search/jql` + queryParams={jql}  | ✅   |
| createIssue     | `jira_post` path=`/rest/api/3/issue`                          | ✅   |
| createEpic      | `jira_post` path=`/rest/api/3/issue` (issueType=Epic in body) | ✅   |
| createSubtask   | `jira_post` path=`/rest/api/3/issue` (parent field in body)   | ✅   |
| updateIssue     | `jira_put` path=`/rest/api/3/issue/{key}`                     | ✅   |
| transitionIssue | `jira_post` path=`/rest/api/3/issue/{key}/transitions`        | ✅   |
| addComment      | `jira_post` path=`/rest/api/3/issue/{key}/comment`            | ✅   |

> **주의**: Generic REST 방식이므로 tool-name-mapper가 도구명뿐 아니라
> REST path + body 구성까지 매핑해야 함. 기존 `callTool('createEpic', params)` →
> `callTool('jira_post', { path: '/rest/api/3/issue', body: { fields: { ...params, issuetype: { name: 'Epic' } } } })`
> 형태의 변환 레이어 필요.

### Figma (공식 서버) — ✅ 거의 완전 커버 (1개 미지원, 미사용)

> **서버**: Figma 공식 MCP 서버
> **접속**: Remote `https://mcp.figma.com/mcp` (Streamable HTTP) 또는 Desktop `http://127.0.0.1:3845/mcp`
> **가이드**: `figma/mcp-server-guide` (228⭐), 공식 문서: `developers.figma.com/docs/figma-mcp-server/`
> **특징**: 디자인→코드 변환에 최적화된 가공 데이터 반환 (Raw JSON이 아닌 정리된 형태)
> **인증**: Figma 계정 OAuth (Remote) 또는 Dev Mode 활성화 (Desktop)

| 우리 도구         | 공식 서버 도구         | 상태                                                |
| ----------------- | ---------------------- | --------------------------------------------------- |
| getFile           | `get_metadata`         | ✅ XML 메타데이터 (레이어 ID, 이름, 타입, 위치)     |
| getFileNodes      | `get_design_context`   | ✅ 디자인 컨텍스트 (기본 React+Tailwind, 변경 가능) |
| getFileComponents | `get_code_connect_map` | ✅ Figma 노드 ↔ 코드 컴포넌트 매핑                  |
| getFileStyles     | `get_variable_defs`    | ✅ 색상, 스페이싱, 타이포그래피                     |
| getFileVariables  | `get_variable_defs`    | ✅ 동일 도구로 커버                                 |
| getComments       | —                      | ❌ 미지원 (현재 워크플로우에서 **미사용**)          |

> **추가 도구 (보너스)**: `get_screenshot` (선택 영역 스크린샷),
> `get_figjam` (FigJam 다이어그램 메타데이터),
> `create_design_system_rules` (디자인 시스템 규칙 파일 생성)
>
> **핵심 고려사항**:
>
> - 공식 서버는 Raw Figma API JSON이 아닌 **가공된 디자인 데이터**를 반환
> - `figma-context.ts`의 `fetchFigmaDesignData()`가 Raw API 응답을 파싱하므로 **리팩토링 필요**
> - `get_design_context`는 기본 React+Tailwind 출력이지만 프롬프트로 프레임워크 변경 가능
> - Streamable HTTP 직접 지원 → Docker 컨테이너/supergateway **불필요**
> - Rate limit: Dev/Full seat = Tier 1 REST API 동일, Starter = 월 6회 제한

### Datadog (커뮤니티) — ✅ 거의 완전 커버 (1개 갭)

> **서버**: `@winor30/mcp-server-datadog` v1.7.0 (125⭐, Apache-2.0)
> **도구**: 20개 (우리 6개 대비 14개 추가 — dashboards, hosts, RUM, downtimes 등)

| 우리 도구     | 커뮤니티 서버 도구 | 상태                                |
| ------------- | ------------------ | ----------------------------------- |
| getLogs       | `get_logs`         | ✅ query + from/to + limit          |
| queryMetrics  | `query_metrics`    | ✅ query + from/to                  |
| getTraces     | `list_traces`      | ✅ query + service + operation      |
| getAlerts     | `list_incidents`   | ✅ incidents ≈ alerts (filter 지원) |
| getMonitors   | `get_monitors`     | ✅ groupStates + name + tags 필터   |
| createMonitor | —                  | ❌ **미지원** (읽기 전용)           |

> **추가 도구 (보너스)**: `list_dashboards`, `get_dashboard`, `list_hosts`,
> `get_active_hosts_count`, `mute_host`, `unmute_host`, `list_downtimes`,
> `schedule_downtime`, `cancel_downtime`, `get_rum_*` (5개)
>
> **갭 대응**: `createMonitor`는 우리 incident-to-jira 워크플로우에서만 사용.
> 프록시 확장(방법 1)으로 Datadog API v1 직접 호출 래퍼 추가하면 해결.

## 8. 갭 대응 전략

커뮤니티 서버에서 우리 도구가 커버되지 않는 경우:

### 방법 1: 커스텀 도구 확장 (권장)

공식/커뮤니티 서버를 기반으로 하되, 부족한 도구만 커스텀으로 추가한다.

```typescript
// 커뮤니티 서버를 fork하지 않고, MCP SDK로 프록시 서버를 만든다
// 커뮤니티 서버의 도구를 그대로 노출 + 커스텀 도구 추가

const communityClient = new Client(/* 커뮤니티 서버 연결 */);
const proxyServer = new McpServer({ name: 'rtb-mcp-jira-extended' });

// 커뮤니티 도구 프록시
proxyServer.tool('getIssue', ...communityClient.callTool('getIssue'));

// 커스텀 도구 추가
proxyServer.tool('createEpic', schema, async (params) => {
  return communityClient.callTool('createIssue', {
    ...params,
    issueType: 'Epic',
  });
});
```

### 방법 2: 직접 API 호출 유지

갭이 있는 도구만 기존 `client.ts`의 직접 API 호출을 유지한다.

### 방법 3: 커뮤니티 서버에 PR 기여

부족한 도구를 upstream에 PR로 기여한다.

## 9. 마이그레이션 단계

### Phase M-1: 클라이언트 추상화 (1일) — ✅ 완료

```
구현 완료 (75 tests):
- packages/workflow-engine/src/clients/mcp-client-interface.ts (신규) — IMCPClient + McpService
- packages/workflow-engine/src/clients/native-mcp-client.ts (신규) — NativeMCPClient (SDK Client)
- packages/workflow-engine/src/clients/tool-name-mapper.ts (신규) — 4서비스 도구 매핑 (243줄)
- packages/workflow-engine/src/clients/mcp-sdk-loader.ts (신규) — SDK 동적 로딩 분리
- packages/workflow-engine/src/clients/mcp-client.ts (수정 — IMCPClient 구현, feature flag 라우팅)
- packages/shared/src/constants.ts (수정 — FEATURE_FLAGS, NATIVE_MCP_ENDPOINTS)

테스트 (75개):
- tool-name-mapper.test.ts (50 tests)
- native-mcp-client.test.ts (15 tests)
- mcp-client.test.ts (10 tests)
```

### Phase M-2: GitHub 인증 (Remote HTTP) — ✅ 완료

```
구현 완료 (6 tests):
- native-mcp-client.ts — authToken 파라미터 추가, connect()에서 transport opts로 전달
- mcp-sdk-loader.ts — SdkTransportConstructor 타입에 opts 파라미터 추가
- constants.ts — getNativeMcpToken() 환경별 토큰 로더, McpServiceKey 타입 export
- mcp-client.ts — getMcpClient()에서 getNativeMcpToken() 호출 후 NativeMCPClient에 전달

남은 작업:
- E2E 검증: USE_NATIVE_MCP=true + USE_NATIVE_MCP_GITHUB=true로 실제 GitHub API 테스트
```

### Phase M-3: Docker + env-aware endpoints — ✅ 완료

```
구현 완료 (3 tests):
- mcp-servers/jira-native/Dockerfile (신규) — supergateway + @aashari/mcp-server-atlassian-jira
- mcp-servers/datadog-native/Dockerfile (신규) — supergateway + @winor30/mcp-server-datadog
- constants.ts — getNativeMcpEndpoint(service, env) 환경별 endpoint 로더 추가
- mcp-client.ts — NATIVE_MCP_ENDPOINTS[service] → getNativeMcpEndpoint(service, env) 전환
- mcp-client.test.ts — getNativeMcpEndpoint mock + 3개 endpoint 라우팅 테스트

env-aware endpoint 해석:
  getNativeMcpEndpoint('JIRA', 'int')
    → process.env['NATIVE_MCP_JIRA_INT_ENDPOINT'] 확인
    → 있으면 반환 (예: 'http://mcp-jira-native-int:3000')
    → 없으면 NATIVE_MCP_ENDPOINTS['JIRA'] 반환 (기본값)
```

### Phase M-4: Docker Compose + 환경 설정 — ✅ 완료

```
구현 완료:
- docker-compose.yml — native MCP 컨테이너 4개 추가 (native-mcp 프로필)
  - mcp-jira-native-int (ATLASSIAN_SITE_URL, ATLASSIAN_USER_EMAIL, ATLASSIAN_API_TOKEN)
  - mcp-jira-native-stg
  - mcp-datadog-native-int (DATADOG_API_KEY, DATADOG_APP_KEY)
  - mcp-datadog-native-stg
- .env — NATIVE_MCP feature flag + endpoint 변수 (주석처리 상태)

시작 방법:
  docker compose --profile native-mcp up -d
  # 또는 기본 프로필과 함께:
  docker compose --profile native-mcp up -d mcp-jira-native-int mcp-datadog-native-int

서비스별 전송 방식 정리:
| 서비스    | 전송 방식           | Docker 필요 | 인증 방식                     |
| --------- | ------------------- | ----------- | ----------------------------- |
| GitHub    | Remote HTTP         | ❌          | Bearer token (transport opts) |
| Figma     | Remote HTTP         | ❌          | Bearer token (transport opts) |
| Jira      | Docker + supergateway | ✅        | Container env vars (ATLASSIAN_*) |
| Datadog   | Docker + supergateway | ✅        | Container env vars (DATADOG_*) |
```

### Phase M-5: 레거시 정리 (1일) — ✅ 완료

```
구현 완료:
- mcp-servers/jira/ 삭제 (커스텀 Jira MCP 서버)
- mcp-servers/github/ 삭제 (커스텀 GitHub MCP 서버)
- mcp-servers/figma/ 삭제 (커스텀 Figma MCP 서버)
- mcp-servers/datadog/ 삭제 (커스텀 Datadog MCP 서버)
- docker-compose.yml: 12개 커스텀 MCP 컨테이너 제거
- constants.ts: MCP_ENDPOINTS, MCP_ENDPOINTS_BY_ENV, getMcpEndpointsForEnv() 제거
- constants.ts: FEATURE_FLAGS에서 USE_NATIVE_MCP* 5개 플래그 제거
- mcp-client.ts: MCPClient 클래스 제거, shouldUseNative() 제거
- mcp-client.ts: getMcpClient()가 항상 NativeMCPClient 반환
- mcp-client.test.ts: 레거시 테스트 제거, 10개 테스트로 재작성
- .env: USE_NATIVE_MCP_* 관련 주석 제거
- AGENTS.md 업데이트

테스트: 552 (기존 558에서 레거시 6개 제거)
```

## 10. 롤백 전략

각 Phase는 독립적이며, feature flag로 서비스별 롤백이 가능하다.

```bash
# 특정 서비스만 레거시로 롤백
USE_NATIVE_MCP_GITHUB=false  # GitHub만 커스텀으로 복귀
USE_NATIVE_MCP_JIRA=true     # Jira는 네이티브 유지
```

Docker Compose에서도 커스텀/네이티브 컨테이너를 profile로 관리한다:

```yaml
# 레거시 (롤백용)
mcp-github-legacy:
  profiles: ['legacy']
  build:
    context: ./mcp-servers/github

# 네이티브 (기본)
mcp-github-int:
  profiles: ['default']
  image: ghcr.io/github/github-mcp-server
```

## 11. 환경변수 변경

### 추가

```bash
# Feature flags (서비스별 점진 전환)
USE_NATIVE_MCP=true
USE_NATIVE_MCP_GITHUB=true
USE_NATIVE_MCP_JIRA=true
USE_NATIVE_MCP_FIGMA=true
USE_NATIVE_MCP_DATADOG=true

# GitHub 공식 서버 (기존 GITHUB_TOKEN 재사용)
# GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}  → 환경변수명 매핑
GITHUB_TOOLSETS="repos,issues,pull_requests"
```

### 변경 없음 (기존 재사용)

```bash
# 기존 credential 환경변수 그대로 사용
JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN
GITHUB_TOKEN
FIGMA_ACCESS_TOKEN
DD_API_KEY, DD_APP_KEY

# 환경별 prefix도 동일
INT_JIRA_HOST, STG_JIRA_HOST, ...
```

## 12. 설계 원칙

1. **하위 호환**: Feature flag로 서비스별 점진적 전환. 기존 워크플로우 영향 없음
2. **인터페이스 분리**: `IMCPClient` 인터페이스로 구현체 교체 가능
3. **도구명 투명 매핑**: 호출 코드 변경 없이 도구명만 매핑 레이어에서 변환
4. **Docker 격리 유지**: 기존 멀티-env 컨테이너 구조 유지
5. **GitHub 먼저**: 유일한 공식 서버로 리스크 최소, 검증 패턴 확립 후 나머지 전환
6. **갭은 래퍼로 해결**: 커뮤니티 서버 부족분은 프록시 확장으로 대응, fork 하지 않음
