# RTB AI Hub — Development Roadmap & TODO

> **Last Updated**: 2026-02-08
> **Current Score**: ~8.5/10 (from 3.7/10 prototype)
> **Goal**: Production-ready autonomous dev team hub (8+/10)

---

## ✅ Completed (P0 — Guardrails)

| #    | Item                                   | Commit    | Notes                              |
| ---- | -------------------------------------- | --------- | ---------------------------------- |
| P0-1 | `.env` security + `.gitignore` cleanup | `7a59994` | pnpm-lock.yaml now tracked         |
| P0-2 | ESLint 9 flat config + Prettier        | `7a59994` | `eslint.config.mjs`, `.prettierrc` |
| P0-3 | Zod input validation for all endpoints | `7a59994` | All webhook/API schemas            |
| P0-4 | Vitest test infrastructure (119 tests) | `7a59994` | Unit tests across all packages     |
| P0-5 | GitHub Actions CI pipeline             | `7a59994` | lint → typecheck → test → build    |

## ✅ Completed (P1 — Production Readiness)

| #    | Item                           | Commit    | Notes                                     |
| ---- | ------------------------------ | --------- | ----------------------------------------- |
| P1-1 | Drizzle ORM migration system   | `9cb2ecd` | 8 tables, initial migration               |
| P1-2 | GitHub Auto-Review workflow    | `9cb2ecd` | AI-powered PR code review                 |
| P1-3 | Webhook signature verification | `9cb2ecd` | HMAC-SHA256 for GitHub/Jira/Figma/Datadog |
| P1-4 | OpenAPI 3.0 documentation      | `9cb2ecd` | `docs/openapi.yaml`, 14 endpoints         |
| P1-5 | React ErrorBoundary            | `9cb2ecd` | Recovery UI with retry                    |
| P1-6 | Rate limiting                  | `9cb2ecd` | express-rate-limit for public endpoints   |
| P1-7 | AI model updates               | `9cb2ecd` | claude-sonnet-4/haiku-4, env-configurable |

## ✅ Completed (P2 — Test Coverage & Quality)

| #    | Item                      | Notes                                             |
| ---- | ------------------------- | ------------------------------------------------- |
| P2-1 | Test coverage expansion   | 119 → 177 tests (+58), 5 new test files           |
|      | webhook-signature.test.ts | 18 tests — HMAC verification for 4 providers      |
|      | rate-limit.test.ts        | 9 tests — 3 rate limiters                         |
|      | auto-review.test.ts       | 8 tests — workflow execution, AI response parsing |
|      | ErrorBoundary.test.tsx    | 6 tests — error catch, recovery UI                |
|      | schema.test.ts            | 17 tests — 8 tables + 7 relations validation      |

## ✅ Completed (P3 — MCP Server Implementation)

| #    | Item                 | Notes                                           |
| ---- | -------------------- | ----------------------------------------------- |
| P3-1 | MCP Server — GitHub  | 10 tools (Octokit), `@modelcontextprotocol/sdk` |
| P3-2 | MCP Server — Jira    | 8 tools (REST API v3), Basic Auth               |
| P3-3 | MCP Server — Figma   | 6 tools (REST API v1), Token auth               |
| P3-4 | MCP Server — Datadog | 6 tools (API v2), DD-API-KEY auth               |
| P3-5 | MCP Client utility   | `MCPClient` class in workflow-engine            |

## ✅ Completed (P4 — Workflow Implementation)

| #    | Item                      | Notes                                               |
| ---- | ------------------------- | --------------------------------------------------- |
| P4-1 | Jira Auto-Dev workflow    | AI code generation from Jira issues                 |
| P4-2 | Deploy Monitor workflow   | Deployment risk analysis + monitoring checklist     |
| P4-3 | Incident-to-Jira workflow | Datadog alerts → root cause analysis → Jira tickets |
| P4-4 | Worker routing            | GitHub worker routes deployment events vs PR events |

## ✅ Completed (P5 — Database Maturity)

| #    | Item                         | Notes                                                                     |
| ---- | ---------------------------- | ------------------------------------------------------------------------- |
| P5-1 | Drizzle query migration      | raw SQL → Drizzle ORM in database.ts + credential-manager.ts              |
| P5-2 | Credential manager migration | Both auth-service and workflow-engine                                     |
|      |                              | `query()`, `transaction()` utility functions retained for backward compat |

## ✅ Completed (P6 — Auth Simplification)

| #    | Item                                        | Commit    | Notes                                                           |
| ---- | ------------------------------------------- | --------- | --------------------------------------------------------------- |
| P6-1 | Remove credential tables from DB            | `20bb45a` | `userCredentials`, `credentialUsageLog`, `userSessions` 제거    |
| P6-2 | Single AI account (env-based)               | `20bb45a` | `ANTHROPIC_API_KEY` 환경변수로 단일 운영                        |
| P6-3 | JWT-only session (no DB sessions)           | `20bb45a` | `session.ts` 전면 재작성, DB 의존 제거                          |
| P6-4 | DEV_MODE login bypass                       | `20bb45a` | `/auth/dev/login` 엔드포인트, 환경변수 기반 고정 계정           |
| P6-5 | Remove credential management from dashboard | `20bb45a` | CredentialsPage 삭제, Sidebar/constants/types 정리              |
| P6-6 | Remove encryption modules                   | `20bb45a` | `credential-manager.ts`, `encryption.ts` 삭제 (auth + workflow) |
| P6-7 | Jira user resolver                          | `20bb45a` | 이메일 기반 Jira 사용자 매핑 유틸리티                           |
| P6-8 | Clean up init.sql + docker-compose          | `—`       | credential 테이블/환경변수 제거                                 |

## ✅ Completed (P7 — Multi-Environment Support)

| #    | Item                          | Notes                                                                        |
| ---- | ----------------------------- | ---------------------------------------------------------------------------- |
| P7-1 | Environment types & constants | `ENVIRONMENTS`, `Environment`, `DEFAULT_ENVIRONMENT`, `MCP_ENDPOINTS_BY_ENV` |
| P7-2 | Webhook env routing           | `?env=` query param, `X-Env` header, all 4 routes                            |
| P7-3 | BullMQ env propagation        | `env` in job data, worker extraction, workflow param                         |
| P7-4 | DB env column                 | `env VARCHAR(10)` added to `workflow_executions` & `webhook_events`          |
| P7-5 | Drizzle migration             | `0001_add_env_column.sql` + journal entry                                    |
| P7-6 | MCP client factory            | `getMcpClient(service, env)` with env-specific endpoints                     |
| P7-7 | Docker MCP containers         | 8 env-specific containers (4 services × int/stg)                             |
| P7-8 | Per-env credentials           | `INT_*`, `STG_*` env vars with base fallback                                 |
| P7-9 | Test coverage                 | 140 tests passing (build + lint + test)                                      |

---

## 🔮 Future Considerations (P8+)

| #     | Item                           | Priority | Notes                                                       |
| ----- | ------------------------------ | -------- | ----------------------------------------------------------- |
| P8-1  | Google OAuth production        | MEDIUM   | DEV_MODE 해제 후 실제 Google OAuth 연동                     |
| P8-2  | E2E testing (Playwright)       | LOW      | Full workflow testing through UI                            |
| P8-3  | Kubernetes manifests           | LOW      | Helm charts or kustomize for production                     |
| P8-4  | Observability stack            | LOW      | Structured logging → ELK/Loki, metrics → Prometheus/Grafana |
| P8-5  | Multi-tenant support           | LOW      | Org-level isolation, RBAC                                   |
| P8-6  | Plugin architecture            | LOW      | Custom workflow steps, third-party integrations             |
| P8-7  | Dashboard improvements         | LOW      | Real-time workflow monitoring, cost tracking charts         |
| P8-8  | Webhook retry/DLQ              | LOW      | Dead letter queue for failed webhook processing             |
| P8-9  | Database migrations CI         | LOW      | Automated migration check in CI pipeline                    |
| P8-10 | MCP server integration tests   | LOW      | Docker-based integration tests for MCP servers              |
| P8-11 | MCP tool-use in workflows      | LOW      | Connect workflows to MCP servers for actual API calls       |
| P8-12 | Dashboard env filter           | LOW      | Env dropdown/filter on dashboard to view by environment     |
| P8-13 | docker-compose.test.yml update | LOW      | Add env-specific MCP containers to test compose file        |
| P8-14 | getMcpClient wiring            | MEDIUM   | Connect workflows to getMcpClient() for actual MCP calls    |
| P8-15 | Env-specific webhook tests     | LOW      | Test ?env=stg query param behavior                          |

---

## 📊 Progress Summary

| Phase                    | Total  | Done   | Remaining |
| ------------------------ | ------ | ------ | --------- |
| P0 — Guardrails          | 5      | 5      | 0         |
| P1 — Production Ready    | 7      | 7      | 0         |
| P2 — Test Coverage       | 1      | 1      | 0         |
| P3 — MCP Servers         | 5      | 5      | 0         |
| P4 — Workflows           | 4      | 4      | 0         |
| P5 — DB Maturity         | 2      | 2      | 0         |
| P6 — Auth Simplification | 8      | 8      | 0         |
| P7 — Multi-Environment   | 9      | 9      | 0         |
| P8 — Future              | 15     | 0      | 15        |
| **Total**                | **56** | **41** | **15**    |

---

## 🛠️ Key Commands

```bash
# Build & Test
pnpm build              # Full monorepo build
pnpm test               # Run all 140 tests
pnpm lint               # ESLint check
pnpm format:check       # Prettier check
pnpm typecheck          # TypeScript strict check

# Database
pnpm db:generate        # Generate Drizzle migration
pnpm db:migrate         # Run migrations
pnpm db:push            # Push schema (dev)
pnpm db:studio          # Drizzle Studio UI

# Development
pnpm dev:auth           # Auth service (hot reload)
pnpm dev:webhook        # Webhook listener (hot reload)
pnpm dev:workflow       # Workflow engine (hot reload)
pnpm dev:dashboard      # Dashboard (Vite dev)

# Docker
pnpm docker:up          # Start full stack
pnpm docker:down        # Stop full stack
pnpm docker:logs        # View logs
```

## 📝 Environment Variables

### Auth & Dev Mode (P6)

| Variable            | Description                                | Required               |
| ------------------- | ------------------------------------------ | ---------------------- |
| `DEV_MODE`          | Enable dev login bypass (`true`/`false`)   | No (default: `false`)  |
| `DEV_USER_EMAIL`    | Fixed dev user email                       | Yes (if DEV_MODE=true) |
| `DEV_USER_NAME`     | Fixed dev user display name                | Yes (if DEV_MODE=true) |
| `ANTHROPIC_API_KEY` | Anthropic API key (shared, single account) | Yes (for AI workflows) |

| `JWT_SECRET` | JWT signing secret (min 32 chars) | Yes |

### AI Models (P1)

| Variable                 | Description                                         | Required            |
| ------------------------ | --------------------------------------------------- | ------------------- |
| `AI_MODEL_HEAVY`         | Heavy AI model (default: claude-sonnet-4-20250514)  | No                  |
| `AI_MODEL_MEDIUM`        | Medium AI model (default: claude-sonnet-4-20250514) | No                  |
| `AI_MODEL_LIGHT`         | Light AI model (default: claude-haiku-4-20250414)   | No                  |
| `GITHUB_WEBHOOK_SECRET`  | GitHub webhook HMAC secret                          | No (skips if unset) |
| `JIRA_WEBHOOK_SECRET`    | Jira webhook HMAC secret                            | No (skips if unset) |
| `FIGMA_WEBHOOK_SECRET`   | Figma webhook HMAC secret                           | No (skips if unset) |
| `DATADOG_WEBHOOK_SECRET` | Datadog webhook HMAC secret                         | No (skips if unset) |

### MCP Servers (P3)

| Variable             | Description                                          | Required        |
| -------------------- | ---------------------------------------------------- | --------------- |
| `GITHUB_TOKEN`       | GitHub Personal Access Token or App token            | For GitHub MCP  |
| `JIRA_HOST`          | Jira instance hostname (e.g., yourorg.atlassian.net) | For Jira MCP    |
| `JIRA_EMAIL`         | Jira account email                                   | For Jira MCP    |
| `JIRA_API_TOKEN`     | Jira API token                                       | For Jira MCP    |
| `FIGMA_ACCESS_TOKEN` | Figma Personal Access Token                          | For Figma MCP   |
| `DD_API_KEY`         | Datadog API key                                      | For Datadog MCP |
| `DD_APP_KEY`         | Datadog Application key                              | For Datadog MCP |
| `DD_SITE`            | Datadog site (default: datadoghq.com)                | No              |
