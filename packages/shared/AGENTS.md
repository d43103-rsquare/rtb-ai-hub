# SHARED PACKAGE

Foundation package — ALL other packages depend on this. Changes here require `pnpm build:shared` before other packages work.

## STRUCTURE

```
src/
├── types.ts          # Webhook events, WorkflowExecution, AI types, enums
├── auth-types.ts     # User, JWTPayload, GoogleUserInfo
├── constants.ts      # QUEUE_NAMES, NATIVE_MCP_ENDPOINTS, REPO_ROUTING, FEATURE_FLAGS, Polling/CI/CD configs
├── utils.ts          # createLogger, requireEnv, getEnv, retry(), RTBError
├── schemas.ts        # Zod schemas for 4 webhook payload types
├── validation.ts     # Express middleware: validateBody(), validateParams()
├── db/
│   ├── schema.ts     # Drizzle ORM: 5 tables + relations + indexes
│   └── index.ts      # DB connection helpers (createDbConnection, getDb)
└── __tests__/        # 4 test files (utils, validation, schemas, schema)
```

## KEY EXPORTS

| Export                                               | From           | Used By                           | Notes                                                   |
| ---------------------------------------------------- | -------------- | --------------------------------- | ------------------------------------------------------- |
| `ENVIRONMENTS`, `Environment`, `DEFAULT_ENVIRONMENT` | types.ts       | webhook-listener, workflow-engine |                                                         |
| `WorkflowType`, `WorkflowStatus`                     | types.ts       | workflow-engine                   |                                                         |
| `JiraComponent`                                      | types.ts       | webhook-listener, workflow-engine |                                                         |
| `QUEUE_NAMES`, `WORKFLOW_QUEUE_MAP`                  | constants.ts   | webhook-listener, workflow-engine |                                                         |
| `NATIVE_MCP_ENDPOINTS`                               | constants.ts   | workflow-engine (mcp-client)      | Official MCP server endpoints (SDK direct connection)   |
| `REPO_ROUTING`, `RepoRoutingConfig`                  | constants.ts   | workflow-engine (mcp-helper)      |                                                         |
| `LABEL_REPO_ROUTING`, `LabelRepoMapping`             | constants.ts   | workflow-engine (mcp-helper)      | Label→repo routing (two-tier with gate label)           |
| `createLogger(name)`                                 | utils.ts       | ALL services                      |                                                         |
| `requireEnv(key)` / `getEnv(key, default)`           | utils.ts       | ALL services                      |                                                         |
| `workflowExecutions`, `webhookEvents`, `users`       | db/schema.ts   | auth-service, workflow-engine     |                                                         |
| `AgentPipelineStep` (v2.1+)                          | agent-types.ts | workflow-engine                   | Pipeline step with wave + dependsOn                     |
| `AgentPipeline`                                      | agent-types.ts | workflow-engine                   | Workflow → pipeline definition                          |
| `AgentRole`, `AgentContext`, `AgentSession`          | agent-types.ts | workflow-engine                   | Multi-agent orchestration types                         |
| `FEATURE_FLAGS`                                      | constants.ts   | workflow-engine                   | USE_MULTI_AGENT, LOCAL_POLLING, CI/CD, OPENCLAW toggles |
| `PollingConfig`, `TrackedBranch`                     | constants.ts   | workflow-engine (branch-poller)   | Branch polling interval + tracked branches              |
| `JiraPollingConfig`                                  | constants.ts   | workflow-engine (jira-poller)     | Jira REST API polling config                            |
| `loadPollingConfig()`, `loadJiraPollingConfig()`     | constants.ts   | workflow-engine                   | Loads polling config from env vars                      |
| `TargetCiConfig`, `CiStepConfig`                     | constants.ts   | workflow-engine (target-ci)       | CI step definitions                                     |
| `TargetCdConfig`                                     | constants.ts   | workflow-engine (target-cd)       | CD deploy config                                        |
| `loadTargetCiConfig()`, `loadTargetCdConfig()`       | constants.ts   | workflow-engine                   | Loads CI/CD config from env vars                        |
| `SlackNotifyConfig`, `OpenClawNotifyEventType`       | constants.ts   | workflow-engine (notify-openclaw) | Slack notify config + event types                       |
| `loadOpenClawConfig()`                               | constants.ts   | workflow-engine                   | Loads Slack notify config from env vars                 |
| `PreviewConfig`, `PreviewInstance`, `PreviewStatus`  | constants.ts   | workflow-engine (preview-manager) | Preview environment types                               |
| `loadPreviewConfig()`                                | constants.ts   | workflow-engine                   | Loads preview config from env vars                      |
| `FEATURE_FLAGS.PREVIEW_ENABLED`                      | constants.ts   | workflow-engine                   | Preview environment toggle                              |

## CONVENTIONS

- **Dual export paths**: `@rtb-ai-hub/shared` (main) and `@rtb-ai-hub/shared/db/schema` (drizzle config)
- **Zod v4**: Uses `zod@^4.3.6` — API differs from v3 (no `.parse()` chaining, use `.safeParse()`)
- **Webhook schemas**: Use `.passthrough()` — extra fields are allowed through
- **DB `env` column**: Defaults to `'int'` — must explicitly set for stg/prd
- **pino-pretty**: Optional devDependency — logger silently falls back to JSON if missing
- **Wave-based execution** (v2.1+): `AgentPipelineStep`에 `wave?: number` 필드 추가. 같은 wave의 step들은 병렬 실행. wave 없으면 기본값 1로 순차 실행.
- **Dependency tracking** (v2.1+): `dependsOn?: AgentRole[]` 필드로 명시적 의존성 선언 가능 (선택사항, 향후 자동 wave 계산에 활용)

## ANTI-PATTERNS

- `payload` fields in webhook types are `Record<string, any>` — no deep type safety
- `AI_MODEL_COSTS` hardcoded — needs manual update when pricing changes
- `generateId()` uses `Math.random()` — NOT cryptographically secure
- DB schema has JSONB columns (`input`, `output`, `payload`) with no schema validation

## WHEN MODIFYING

1. Change types/constants → `pnpm build:shared` → restart dependent services
2. Change DB schema → `pnpm db:generate` → `pnpm db:push` (migrations in root `drizzle/`)
3. Add new export → ensure it's re-exported from `src/index.ts`
4. Run `pnpm test` — 4 test files with ~72 test cases cover this package
