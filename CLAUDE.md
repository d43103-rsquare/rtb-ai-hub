# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Start everything (Docker infra + repo init + build shared + all 4 services)
pnpm dev

# Individual services
pnpm dev:auth        # Auth Service :4001
pnpm dev:webhook     # Webhook Listener :4000
pnpm dev:workflow    # Workflow Engine (BullMQ worker)
pnpm dev:dashboard   # React Dashboard :3000 (Vite)

# Build (shared MUST be built first — other packages depend on it)
pnpm build:shared    # Always run this before other builds or typechecks
pnpm build           # All packages

# Type checking
pnpm typecheck       # All packages (requires shared to be built)

# Lint & format
pnpm lint            # ESLint
pnpm lint:fix        # ESLint with auto-fix
pnpm format          # Prettier write
pnpm format:check    # Prettier check only
```

## Testing

```bash
# Unit tests (excludes integration/e2e)
pnpm test                    # All packages
pnpm test:watch              # Watch mode
pnpm test:coverage           # With coverage

# Run a single test file
pnpm vitest run packages/webhook-listener/src/__tests__/infra.test.ts

# Run tests for a single package
pnpm --filter @rtb-ai-hub/webhook-listener vitest run

# Integration / E2E (requires running infrastructure)
pnpm test:integration        # Vitest integration tests
pnpm test:e2e                # Playwright E2E tests
```

Vitest workspace mode: each package has its own `vitest.config.ts` (environment: node, globals: true). The workspace is defined in `vitest.workspace.ts`.

## Database

```bash
pnpm db:generate    # Generate migration from schema changes
pnpm db:migrate     # Run migrations
pnpm db:push        # Push schema directly (dev only)
pnpm db:studio      # Open Drizzle Studio
```

Schema is defined in `packages/shared/src/db/schema.ts`. Drizzle config at root `drizzle.config.ts`. Migrations in `drizzle/`.

## Architecture

This is a **pnpm monorepo** with 5 packages that automate software development workflows: Figma design → Jira tickets → AI code generation → code review → deploy → monitoring.

### Package Dependency Graph

```
@rtb-ai-hub/shared          ← Foundation: types, constants, DB schema, logger
    ↑
@rtb-ai-hub/auth-service    ← Google OAuth + JWT auth (:4001)
@rtb-ai-hub/webhook-listener ← Express API, receives webhooks, enqueues to BullMQ (:4000)
@rtb-ai-hub/workflow-engine  ← BullMQ worker, runs AI workflows
@rtb-ai-hub/dashboard       ← React + Vite + Tailwind frontend (:3000)
```

All backend packages import from `@rtb-ai-hub/shared` via `workspace:*`. The shared package must be built (`pnpm build:shared`) before other packages can typecheck or run.

### Request Flow

```
Webhook (Figma/Jira/GitHub/Datadog) → webhook-listener → BullMQ queue (Redis)
    → workflow-engine worker picks up job → runs AI workflow → calls external APIs via MCP
```

### Key Modules in workflow-engine

- **`workflows/`** — 5 workflow implementations (figma-to-jira, jira-auto-dev, auto-review, deploy-monitor, incident-to-jira)
- **`debate/`** — Multi-turn debate engine where 7 AI agent personas collaborate (PM, System Planner, UX Designer, UI Developer, Backend Developer, QA, DevOps)
- **`claude-code/`** — Claude Code CLI integration: executor, context builder, MCP config builder, result parser
- **`harness/`** — Execution guard (tool allowlists, budgets), policy engine (env-specific rules), observer (logging, anomaly detection)
- **`worktree/`** — Git worktree lifecycle management per Jira issue
- **`clients/`** — Anthropic SDK client, native MCP client, database client
- **`utils/`** — Wiki knowledge injection, context engine, local git ops, PR builder, preview manager, CI runner

### Multi-Environment Support

The system supports 3 logical environments (`int`/`stg`/`prd`) on a single infrastructure. Environment is passed via `?env=` query param or `X-Env` header on webhooks. Credentials follow a fallback pattern: `STG_JIRA_API_TOKEN` → `JIRA_API_TOKEN`.

### Feature Flags

Defined in `packages/shared/src/constants.ts` as `FEATURE_FLAGS`. Key flags: `DEBATE_ENABLED`, `CLAUDE_CODE_ENABLED`, `WORKTREE_ENABLED`, `TARGET_CI_ENABLED`, `PREVIEW_ENABLED`.

## Conventions

- **Language**: Code, variable names, comments in English. User-facing docs may be in Korean.
- **TypeScript**: strict mode, target ES2022, CommonJS for backend packages, ESM for dashboard
- **Logging**: Pino (structured JSON). Create loggers via `createLogger('module-name')` from shared.
- **Environment variables**: Access via `getEnv(key, default)` or `requireEnv(key)` from shared. Never read `process.env` directly in application code outside of constants.ts.
- **Testing**: Vitest with `vi.mock()` for module mocking. Test files go in `src/__tests__/` within each package. Use `supertest` for Express route testing.
- **Database**: Drizzle ORM with PostgreSQL. Schema in shared package, migrations via drizzle-kit.
- **Queue**: BullMQ with Redis. Queue names defined in `QUEUE_NAMES` constant. Jobs include `env` field for environment routing.
- **MCP integration**: Native SDK connections (no Docker containers). Endpoints configured in `NATIVE_MCP_ENDPOINTS`. Tokens loaded via `getNativeMcpToken(service, env)`.
