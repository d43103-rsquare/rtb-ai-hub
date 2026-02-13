# OpenCode ↔ 공식 MCP 서버 연동

OpenCode의 Oh-My-OpenCode 에이전트들이 공식/커뮤니티 MCP 서버를 통해 Jira, GitHub, Figma, Datadog 도구를 사용할 수 있도록 설정하는 방법입니다.

## 🎯 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│  Oh-My-OpenCode Agent (librarian, oracle, sisyphus...)   │
└───────────────┬──────────────────────────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │  OpenCode CLI          │
    └───────────┬───────────┘
                │
                ├─→ @modelcontextprotocol/server-github  (stdio, env var 인증)
                ├─→ mcp.atlassian.com/v1/sse             (Remote, OAuth)
                ├─→ mcp.figma.com/mcp                    (Remote, OAuth)
                └─→ @winor30/mcp-server-datadog           (stdio, env var 인증)
```

**핵심 변경**: 커스텀 Docker MCP 서버 8개 → 공식/커뮤니티 MCP 서버 4개로 교체.
Docker 내부 네트워크 의존성 제거, 공식 패키지의 자동 업데이트 혜택.

## ✅ 설정 (`opencode.json`)

```json
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "atlassian": {
      "type": "local",
      "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.atlassian.com/v1/sse"]
    },
    "figma": {
      "type": "local",
      "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.figma.com/mcp"]
    },
    "datadog": {
      "type": "local",
      "command": ["npx", "-y", "@winor30/mcp-server-datadog"],
      "env": {
        "DATADOG_API_KEY": "${DATADOG_API_KEY}",
        "DATADOG_APP_KEY": "${DATADOG_APP_KEY}"
      }
    }
  }
}
```

## 🔧 MCP 서버별 상세

### GitHub MCP (`@modelcontextprotocol/server-github`)

**공식** GitHub MCP 서버. 50+ 도구 제공.

| 전송 방식 | 인증 | 패키지 |
|-----------|------|--------|
| stdio (npx) | `GITHUB_PERSONAL_ACCESS_TOKEN` env var | `@modelcontextprotocol/server-github` |

**주요 도구**:

| Tool | 설명 |
|------|------|
| `create_or_update_file` | 파일 생성/업데이트 |
| `create_branch` | 브랜치 생성 |
| `create_pull_request` | PR 생성 |
| `get_file_contents` | 파일 내용 조회 |
| `search_code` | 코드 검색 |
| `create_issue` | Issue 생성 |
| `list_commits` | 커밋 목록 |
| `get_pull_request_diff` | PR diff 조회 |

**인증 설정**:
```bash
# .env 또는 환경변수
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

### Atlassian/Jira MCP (공식 Remote)

**공식** Atlassian MCP 서버. OAuth 기반 인증.

| 전송 방식 | 인증 | 엔드포인트 |
|-----------|------|-----------|
| Remote (mcp-remote 브릿지) | OAuth (브라우저 플로우) | `https://mcp.atlassian.com/v1/sse` |

**주요 도구** (Generic REST API):

| Tool | 설명 |
|------|------|
| `atlassian_get` | REST API GET 호출 |
| `atlassian_post` | REST API POST 호출 |
| `atlassian_put` | REST API PUT 호출 |
| `atlassian_delete` | REST API DELETE 호출 |
| `atlassian_list_resources` | 리소스 목록 |

**초기 인증**: 최초 실행 시 브라우저에서 Atlassian OAuth 인증 필요 (토큰 자동 캐싱).

**사용 예시** (Jira 이슈 조회):
```
Tool: atlassian.atlassian_get
Input: { url: "/rest/api/3/issue/RNR-123" }
```

### Figma MCP (공식 Remote)

**공식** Figma MCP 서버. OAuth 기반 인증.

| 전송 방식 | 인증 | 엔드포인트 |
|-----------|------|-----------|
| Remote (mcp-remote 브릿지) | OAuth (브라우저 플로우) | `https://mcp.figma.com/mcp` |

**주요 도구**:

| Tool | 설명 |
|------|------|
| `get_file` | Figma 파일 구조 조회 |
| `get_file_nodes` | 특정 노드 조회 |
| `get_file_components` | 컴포넌트 목록 |
| `get_file_styles` | 스타일 목록 |
| `get_images` | 이미지 렌더링 |
| `get_file_versions` | 버전 히스토리 |
| `get_team_projects` | 팀 프로젝트 목록 |

**초기 인증**: 최초 실행 시 브라우저에서 Figma OAuth 인증 필요 (토큰 자동 캐싱).

### Datadog MCP (`@winor30/mcp-server-datadog`)

**커뮤니티** Datadog MCP 서버. 20+ 도구 제공.

| 전송 방식 | 인증 | 패키지 |
|-----------|------|--------|
| stdio (npx) | `DATADOG_API_KEY` + `DATADOG_APP_KEY` env vars | `@winor30/mcp-server-datadog` |

**주요 도구**:

| Tool | 설명 |
|------|------|
| `list_logs` | 로그 조회 |
| `get_metrics` | 메트릭 쿼리 |
| `list_incidents` | 인시던트 조회 |
| `create_incident` | 인시던트 생성 |
| `list_monitors` | 모니터 조회 |
| `get_monitor` | 모니터 상세 |
| `list_dashboards` | 대시보드 목록 |

**인증 설정**:
```bash
# .env 또는 환경변수
DATADOG_API_KEY=your-api-key
DATADOG_APP_KEY=your-app-key
```

## 💡 사용 예시

### 예시 1: Jira 이슈 분석 및 GitHub PR 생성

**사용자 요청**:
```
Jira 이슈 RNR-123을 분석하고 구현 계획을 세운 후 GitHub PR을 생성해줘
```

**에이전트 동작**:

1. **Analyzer**: Jira 이슈 조회
   ```
   Tool: atlassian.atlassian_get
   Input: { url: "/rest/api/3/issue/RNR-123" }
   ```

2. **Planner**: 코드 구조 파악 + 디자인 확인
   ```
   Tool: github.get_file_contents
   Input: { owner: "dev-rsquare", repo: "rtb-v2-mvp", path: "src/components" }

   Tool: figma.get_file (Figma 링크가 있으면)
   Input: { fileKey: "..." }
   ```

3. **Developer**: 브랜치 생성 → 코드 커밋 → PR 생성
   ```
   Tool: github.create_branch
   Tool: github.create_or_update_file
   Tool: github.create_pull_request
   ```

4. **Reviewer**: PR 검토
   ```
   Tool: github.get_pull_request_diff
   ```

### 예시 2: Datadog 알림에서 Jira 티켓 생성

```
Tool: datadog.list_logs
Input: { query: "status:error", from: "now-1h" }

Tool: datadog.list_incidents
→ P1 인시던트 조회

Tool: atlassian.atlassian_post
Input: { url: "/rest/api/3/issue", body: { project: "RNR", issuetype: "Bug", ... } }
```

## 🔄 이전 방식과의 비교

| 항목 | 이전 (커스텀) | 현재 (공식) |
|------|--------------|------------|
| MCP 서버 수 | 8개 (서비스 4 × 환경 2) | 4개 (서비스별 1개) |
| Docker 의존성 | 필수 (내부 네트워크) | 불필요 (npx/Remote) |
| 유지보수 | 직접 코드 유지 | 패키지 자동 업데이트 |
| 환경 분리 | 별도 컨테이너 | 토큰으로 접근 범위 결정 |
| 인증 | 환경변수 (컨테이너에 주입) | env var 또는 OAuth |
| 도구 수 | 30개 (커스텀) | 80+ (공식 기준) |

## 🐛 문제 해결

### MCP 연결 실패

```bash
# OpenCode에서 MCP 상태 확인
opencode mcp list

# 개별 MCP 테스트
npx -y @modelcontextprotocol/server-github  # GitHub
npx -y @winor30/mcp-server-datadog          # Datadog
```

### Atlassian/Figma OAuth 실패

Remote MCP 서버 (Atlassian, Figma)는 최초 실행 시 브라우저 인증이 필요합니다:

1. OpenCode 시작 시 브라우저가 자동 열림
2. Atlassian/Figma 계정으로 인증
3. 토큰이 로컬에 캐싱됨 (이후 자동 갱신)

**Docker 환경 주의**: headless 환경에서는 OAuth 브라우저 플로우가 작동하지 않을 수 있습니다. 로컬에서 먼저 인증 후 토큰을 Docker 볼륨으로 마운트하거나, API token 기반 인증을 사용하세요.

### 환경변수 미설정

```bash
# 필수 환경변수 확인
echo $GITHUB_TOKEN           # GitHub
echo $DATADOG_API_KEY        # Datadog
echo $DATADOG_APP_KEY        # Datadog
```

## 🔐 보안 고려사항

### 인증 방식

| MCP 서버 | 인증 방식 | 보안 수준 |
|----------|----------|----------|
| GitHub | Personal Access Token (env var) | ✅ 토큰 범위 제한 가능 |
| Atlassian | OAuth 2.0 (브라우저 플로우) | ✅ 자동 토큰 갱신 |
| Figma | OAuth 2.0 (브라우저 플로우) | ✅ 자동 토큰 갱신 |
| Datadog | API Key + App Key (env var) | ✅ 읽기/쓰기 분리 |

### API 키 관리

- 환경변수로 주입 (`.env` 파일 또는 시스템 환경변수)
- **절대 커밋하지 말 것**: API 키, 토큰
- OAuth 토큰은 `mcp-remote`가 로컬에 캐싱 관리

## 📚 참고 문서

- [GitHub MCP Server](https://github.com/github/github-mcp-server) — 공식
- [Atlassian MCP](https://mcp.atlassian.com/) — 공식
- [Figma MCP](https://mcp.figma.com/) — 공식
- [Datadog MCP Server](https://github.com/winor30/mcp-server-datadog) — 커뮤니티
- [MCP Remote](https://github.com/geelen/mcp-remote) — Remote↔stdio 브릿지
- [Model Context Protocol](https://modelcontextprotocol.io/) — 스펙

---

**작성일**: 2026-02-11
**버전**: RTB AI Hub v2.0 + 공식 MCP 서버 전환
