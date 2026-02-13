# WORKFLOW ENGINE

BullMQ workers processing queued webhook events through AI workflows. Health endpoint on port 3001. No Express — raw HTTP server for health only.

## STRUCTURE

```
src/
├── index.ts              # Health server (3001) + createWorkers() + pollers + SIGTERM handler
├── queue/
│   ├── connection.ts     # createRedisConnection() with retry strategy
│   ├── queues.ts         # 4 BullMQ Queue instances (figma, jira, github, datadog)
│   ├── workers.ts        # createWorkers() — 4 BullMQ Workers, concurrency=2 each
│   └── index.ts          # Barrel export
├── workflows/
│   ├── figma-to-jira.ts          # Figma design → Jira story + tasks + subtasks
│   ├── jira-auto-dev.ts          # Router (OpenCode→Multi-Agent)
│   ├── jira-auto-dev-multi.ts    # Multi-agent workflow + local branch/CI/PR
│   ├── jira-auto-dev-opencode.ts # OpenCode SDK workflow + local branch/CI/PR
│   ├── target-deploy.ts          # Push event → CD pipeline (from polling/webhook)
│   ├── auto-review.ts            # GitHub PR → AI code review comments
│   ├── deploy-monitor.ts         # Deployment → Datadog metrics monitoring
│   └── incident-to-jira.ts       # Datadog alert → Jira bug ticket
├── utils/
│   ├── wiki-knowledge.ts     # rtb-wiki knowledge indexer + domain search
│   ├── repo-manager.ts       # Git repo clone/update manager (wiki + work repos)
│   ├── figma-context.ts      # Figma context extractor from Jira descriptions
│   ├── local-git-ops.ts      # Local git operations (branch, commit, push)
│   ├── target-ci.ts          # Target repo CI runner (configurable lint/test/build)
│   ├── target-cd.ts          # Target repo CD (Docker Compose rolling deploy + rollback)
│   ├── branch-poller.ts      # Git branch polling → CD trigger (github-queue)
│   ├── jira-poller.ts        # Jira REST API polling → AI workflow (jira-queue)
│   ├── notify-openclaw.ts   # Slack notification utility (Hub→Slack via Web API)
│   ├── preview-manager.ts   # Branch-based preview environments (worktree + DB + process)
│   └── database.ts           # saveWorkflowExecution(), getWorkflowExecution()
├── clients/
│   ├── anthropic.ts      # AnthropicClient with cost calculation
│   ├── mcp-client.ts     # getMcpClient(service, env) — env-aware MCP routing
│   └── mcp-helper.ts     # resolveGitHubTarget(), callMcpTool(), typed MCP wrappers
├── agents/               # Multi-agent orchestration (see below)
├── __tests__/            # 4 test files (anthropic, auto-review, figma-context, +)
├── clients/__tests__/    # 1 test file (mcp-helper — label/component/fallback routing)
└── utils/__tests__/      # 9 test files (branch-poller, jira-poller, local-git-ops, notify-openclaw, preview-manager, target-ci, target-cd, target-deploy, wiki-knowledge)
```

## JOB PROCESSING FLOW

```
BullMQ Job → Worker picks up → extract { event, env, userId } → call workflow fn(event, env) → save execution to DB → return result
```

## CONVENTIONS

- **Worker concurrency**: 2 per queue (8 total concurrent jobs)
- **Job data**: `{ event: WebhookEvent, userId?: string, env: Environment }`
- **GitHub worker**: Routes to `processTargetDeploy` (push), `processDeployMonitor` (deployment), or `processAutoReview` (PR)
- **Env-aware MCP**: `getMcpClient(service, env)` returns client pointing to correct MCP container
- **Repo routing**: `resolveGitHubTarget(event, env)` → label→component→fallback repo mapping, then env→branch. Priority: `LABEL_REPO_ROUTING` labels → `REPO_ROUTING_REPOS` components → `GITHUB_REPO` fallback
- **DB writes**: All workflows call `saveWorkflowExecution()` with env field
- **Graceful shutdown**: SIGTERM closes all workers + branch poller + jira poller
- **Local polling**: `LOCAL_POLLING_ENABLED=true` (or `DEV_MODE=true`) starts JiraPoller + BranchPoller at 10s default. Replaces webhooks for local dev.
- **Jira auto-dev flow**: Local branch → AI code gen → CI (with retry) → push → PR creation. CD only runs after human merge via polling/webhook.
- **Git conventions**: Branch naming `{type}/{PROJ-123}-{description}`, commit format `[PROJ-123] description`. Types: feature/bugfix/hotfix based on env.
- **Slack notifications**: All workflow notification calls use `notifyOpenClaw()` (Slack Web API direct) which is fire-and-forget. Never let notification failure break the workflow.
- **Preview environments**: `PREVIEW_ENABLED=true` activates branch-based previews. PreviewManager uses git worktree + DB template copy + process spawn. State in Redis (`preview:instance:{id}`, `preview:active-list`). Auto-cleanup after TTL (default 24h). Integrated into jira-auto-dev-multi.ts Phase 3.5.

## MULTI-AGENT ORCHESTRATION (v2.1+)

Wave 기반 병렬 실행을 지원하는 에이전트 오케스트레이션 시스템입니다.

### Architecture

```
src/agents/
├── base-agent.ts         # Abstract agent class with AI client
├── orchestrator.ts       # Wave-based pipeline executor
├── state-store.ts        # Redis session + memory management
├── registry.ts           # Global agent registry singleton
├── pipelines.ts          # Workflow → pipeline definitions with waves
└── implementations/
    ├── analyzer-agent.ts
    ├── planner-agent.ts
    ├── developer-agent.ts
    ├── reviewer-agent.ts
    └── oracle-agent.ts
```

### Pipeline Execution Flow

```
1. Load pipeline definition with wave numbers
2. Group steps by wave
3. For each wave (sequential):
   - Filter steps by condition
   - Execute steps in parallel (Promise.allSettled)
   - Check for failures
   - Invoke Oracle if threshold reached
4. Finalize session + save to DB
```

### Wave-Based Parallelism

**JIRA_AUTO_DEV Pipeline:**

```typescript
steps: [
  { role: AgentRole.ANALYZER, required: true, wave: 1 },
  { role: AgentRole.PLANNER, required: true, wave: 2 },
  { role: AgentRole.DEVELOPER, required: true, wave: 3 },
  { role: AgentRole.REVIEWER, required: true, wave: 4 },
];
```

**Execution Timeline:**

```
Wave 1: [Analyzer] ──────────────┐
                                 ▼
Wave 2:                    [Planner] ────┐
                                         ▼
Wave 3:                            [Developer] ───┐
                                                  ▼
Wave 4:                                     [Reviewer]
```

**Performance**: 독립적인 에이전트를 Wave 1에 추가하면 병렬 실행으로 최대 40% 시간 단축 가능

**예시 (병렬 최적화):**

```typescript
steps: [
  { role: AgentRole.ANALYZER, required: true, wave: 1 },
  { role: AgentRole.EXPLORER, required: false, wave: 1 }, // 병렬 실행
  { role: AgentRole.PLANNER, required: true, wave: 2 },
  { role: AgentRole.DEVELOPER, required: true, wave: 3 },
  { role: AgentRole.REVIEWER, required: true, wave: 4 },
];
```

```
Wave 1: [Analyzer] [Explorer] ← 병렬 실행 (Promise.allSettled)
           ↓           ↓
        (모두 완료 후)
              ↓
Wave 2:  [Planner]
              ↓
Wave 3:  [Developer]
              ↓
Wave 4:  [Reviewer]
```

### Feature Flags

- `USE_MULTI_AGENT=true`: Enable multi-agent pipeline (default: false)
- `USE_OPENCODE_AGENTS=true`: Use OpenCode/Oh-My-OpenCode agents (default: false)

### State Management

- **Session Storage**: Redis (24h TTL) - AgentSession 전체 상태
- **Memory Storage**: Redis (7d TTL) - 과거 실행 컨텍스트
- **DB Persistence**: PostgreSQL - agentSessions, agentSteps 테이블

### Adding New Agents

1. Create implementation in `implementations/{role}-agent.ts`
2. Extend `BaseAgent` class
3. Implement `buildPrompt()` and `parseResponse()`
4. Register in `registry.ts`
5. Add to pipeline in `pipelines.ts` with wave number

### Wave-Based Execution Details

**Wave 그룹화:**

- 같은 wave의 step들은 `Promise.allSettled()`로 병렬 실행
- Wave는 순차적으로 실행 (Wave 1 완료 → Wave 2 시작)
- Wave 번호가 없으면 기본값 1로 설정

**실패 처리:**

- 필수 step (`required: true`) 실패 시 `failureCount` 증가
- `failureCount >= oracleThreshold`이면 Oracle 호출
- Oracle이 `shouldRetry: true` 반환하면 재시도
- Oracle이 재시도 불가 판단하면 파이프라인 중단

**조건부 실행:**

```typescript
{
  role: AgentRole.EXPLORER,
  required: false,
  wave: 1,
  condition: (ctx) => ctx.webhookEvent.issue?.fields?.description?.includes('figma.com')
}
```

**자세한 내용**: [docs/WAVE_PARALLEL_EXECUTION.md](../../docs/WAVE_PARALLEL_EXECUTION.md)

## LOCAL CI/CD PIPELINE

Local-first CI/CD for the target repo with polling-based event detection.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ LOCAL POLLING (DEV_MODE=true, 10s interval)              │
│                                                          │
│ JiraPoller ──→ Jira REST API ──→ jira-queue ──→ Worker   │
│   (JQL search, dedup by updated)  │                      │
│                                   ▼                      │
│                          processJiraAutoDev               │
│                          → local branch → AI → CI → PR   │
│                                                          │
│ BranchPoller ──→ git fetch ──→ github-queue ──→ Worker   │
│   (ref compare, pattern match)    │                      │
│                                   ▼                      │
│                          processTargetDeploy              │
│                          → git pull → Docker CD           │
└─────────────────────────────────────────────────────────┘
```

### Jira Polling (jira-poller.ts)

- Direct Jira REST API (`/rest/api/3/search/jql`) — no MCP dependency
- Auth: `Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)`
- Default JQL: `project="X" AND status="In Progress" AND labels="RTB-AI-HUB" AND updated>="-1m"`
- Dedup: tracks `issueKey → lastSeenUpdated` map, only enqueues on change
- Creates `JiraWebhookEvent` matching webhook handler shape → existing worker processes it

### Branch Polling (branch-poller.ts)

- `git fetch origin --prune` + ref comparison per tracked branch
- Tracked: `develop`(int, autoDeploy), `release/*`(stg, autoDeploy), `main`(prd, manual)
- Creates `GitHubWebhookEvent` with `type: 'push'` → `processTargetDeploy`

### Target CI (target-ci.ts)

- Configurable steps via env: `TARGET_CI_INSTALL_CMD`, `TARGET_CI_LINT_CMD`, etc.
- Runs sequentially in `WORK_REPO_LOCAL_PATH`
- Used by AI workflows after code generation (with retry loop)

### Target CD (target-cd.ts)

- Docker Compose rolling deploy: build → up (per service) → health check → next
- Rollback on failure (redeploy previous image)
- Triggered by branch polling after merge, NOT by AI workflows

### Git Branch Strategy

```
env=int → base=develop   → feature/PROJ-123-xxx → PR → develop   → auto deploy
env=stg → base=release/* → bugfix/PROJ-456-xxx  → PR → release/* → auto deploy
env=prd → base=main      → hotfix/PROJ-789-xxx  → PR → main      → manual approval
```

See `docs/GIT_BRANCH_STRATEGY.md` for full team conventions.

## ADDING A NEW WORKFLOW

1. Create `src/workflows/{name}.ts` — export `async function process{Name}(event, env)`
2. Register worker in `src/queue/workers.ts` inside `createWorkers()`
3. Add queue name in `packages/shared/src/constants.ts` `QUEUE_NAMES`
4. Add workflow type in `packages/shared/src/types.ts` `WorkflowType` enum
5. Add queue mapping in `packages/shared/src/constants.ts` `WORKFLOW_QUEUE_MAP`

## ANTI-PATTERNS

- AI workflows have MCP tool-use wired but are not yet tested with real credentials
- OpenAI removed — project is Claude-only
- No tests for 4 of 5 workflows or queue/worker logic
- `requestDeveloperFix()` in jira-auto-dev-multi.ts is a stub (TODO: wire to actual Developer agent re-execution)
