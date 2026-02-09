# WORKFLOW ENGINE

BullMQ workers processing queued webhook events through AI workflows. Health endpoint on port 3001. No Express — raw HTTP server for health only.

## STRUCTURE

```
src/
├── index.ts              # Health server (3001) + createWorkers() + SIGTERM handler
├── queue/
│   ├── connection.ts     # createRedisConnection() with retry strategy
│   ├── queues.ts         # 4 BullMQ Queue instances (figma, jira, github, datadog)
│   ├── workers.ts        # createWorkers() — 4 BullMQ Workers, concurrency=2 each
│   └── index.ts          # Barrel export
├── workflows/
│   ├── figma-to-jira.ts      # Figma design → Jira story + tasks + subtasks (implementation/test/verification)
│   ├── jira-auto-dev.ts      # Jira ticket → GitHub PR with AI-generated code
│   ├── auto-review.ts        # GitHub PR → AI code review comments
│   ├── deploy-monitor.ts     # Deployment → Datadog metrics monitoring
│   └── incident-to-jira.ts   # Datadog alert → Jira bug ticket (209 lines, largest)
├── clients/
│   ├── anthropic.ts      # AnthropicClient with cost calculation
│   ├── mcp-client.ts     # getMcpClient(service, env) — env-aware MCP routing
│   ├── mcp-helper.ts     # resolveGitHubTarget(), callMcpTool(), typed MCP wrappers
│   └── database.ts       # saveWorkflowExecution(), getWorkflowExecution()
└── __tests__/            # 2 test files (anthropic, auto-review)
```

## JOB PROCESSING FLOW

```
BullMQ Job → Worker picks up → extract { event, env, userId } → call workflow fn(event, env) → save execution to DB → return result
```

## CONVENTIONS

- **Worker concurrency**: 2 per queue (8 total concurrent jobs)
- **Job data**: `{ event: WebhookEvent, userId?: string, env: Environment }`
- **GitHub worker**: Routes to `processAutoReview` (PR events) or `processDeployMonitor` (deployment events)
- **Env-aware MCP**: `getMcpClient(service, env)` returns client pointing to correct MCP container
- **Repo routing**: `resolveGitHubTarget(event, env)` → component→repo mapping, then env→branch. Fallback to `GITHUB_REPO` env var
- **DB writes**: All workflows call `saveWorkflowExecution()` with env field
- **Graceful shutdown**: SIGTERM closes all workers

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
