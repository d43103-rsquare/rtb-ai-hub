# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-11
**Branch:** main

## OVERVIEW

AI-powered automation hub: Figma→Jira→Dev→Review→Deploy→Monitor. pnpm monorepo (TypeScript, Express, BullMQ, React). Single infrastructure serves 3 logical environments (int/stg/prd). Multi-agent pipeline (Analyzer→Planner→Developer→Reviewer+Oracle) with optional rtb-wiki domain knowledge injection. Claude Code SDK integration for advanced code generation workflows. Local-first CI/CD pipeline with polling-based event detection (Jira + GitHub branch polling) for target repo. Branch-based preview environments (git worktree + process spawn + DB template). Dashboard AI Chat (Anthropic tool-calling). Slack Web API for Hub→Slack notifications. OpenClaw Gateway integration for conversational workflow triggers (Slack→Hub). **Team AI Coordinator** (Phase A+B+C complete): role-aware notifications, PR context enrichment, daily team digest, cross-reference engine (context_links DB), smart handoff, blocker detection, PR impact analysis, decision journal (auto-detect+record), meeting prep automation.

## STRUCTURE

```
rtb-ai-hub/
├── packages/
│   ├── shared/              # Types, DB schema (Drizzle), utils — ALL packages depend on this
│   │   └── src/agent-types.ts   # Multi-agent types (AgentRole, AgentContext, etc.)
│   ├── auth-service/        # Google OAuth + DEV_MODE auto-login (port 4001)
│   ├── webhook-listener/    # Express API, 4 webhook routes + chat API (port 4000)
│   ├── workflow-engine/     # BullMQ workers + AI workflows (health: 3001)
│   │   └── src/
│   │       ├── agents/                  # Multi-agent orchestration
│   │       │   ├── base-agent.ts            # Abstract agent base class
│   │       │   ├── orchestrator.ts          # Pipeline executor
│   │       │   ├── state-store.ts           # Redis-backed session/memory
│   │       │   ├── registry.ts              # Agent registry + lazy init
│   │       │   ├── pipelines.ts             # Workflow→pipeline definitions
│   │       │   └── implementations/         # 5 agent implementations
│   │       ├── utils/
│   │       │   ├── wiki-knowledge.ts        # rtb-wiki knowledge indexer
│   │       │   ├── repo-manager.ts          # Git repo clone/update manager
│   │       │   ├── local-git-ops.ts         # Local git operations (branch, commit, push)
│   │       │   ├── target-ci.ts             # Target repo CI runner (lint/test/build)
│   │       │   ├── target-cd.ts             # Target repo CD (Docker Compose rolling deploy)
│   │       │   ├── branch-poller.ts         # Git branch polling for CD triggers
│   │       │   ├── jira-poller.ts           # Jira REST API polling for local dev
│   │       │   ├── figma-context.ts         # Figma context extractor from Jira descriptions
│   │       │   ├── preview-manager.ts       # Branch-based preview environments (worktree + DB + process)
│   │       │   ├── role-notifier.ts         # Role-aware Slack notifications (A-1)
│   │       │   ├── pr-description-builder.ts # Enriched PR description builder (A-2)
│   │       │   ├── context-engine.ts        # Cross-reference engine CRUD (B-1)
│   │       │   ├── digest-collector.ts      # Daily digest data collection (A-3)
│   │       │   ├── digest-formatter.ts      # Daily digest Slack message formatter (A-3)
│   │       │   ├── digest-scheduler.ts      # BullMQ cron for daily digest (A-3)
│   │       │   ├── blocker-detector.ts      # Stale ticket & blocker detection (B-3)
│   │       │   ├── blocker-formatter.ts     # Blocker alert Slack formatter (B-3)
│   │       │   ├── blocker-scheduler.ts     # BullMQ cron for blocker checks (B-3)
│   │       │   ├── impact-analyzer.ts       # PR diff impact analysis (C-1)
│   │       │   ├── impact-formatter.ts      # Impact analysis Markdown/Slack format (C-1)
│   │       │   ├── decision-detector.ts     # Decision keyword detection (C-2)
│   │       │   ├── decision-store.ts        # Decision CRUD operations (C-2)
│   │       │   ├── decision-formatter.ts    # Decision notification/digest format (C-2)
│   │       │   ├── meeting-prep.ts          # Meeting prep data collection (C-3)
│   │       │   ├── meeting-prep-formatter.ts # Meeting prep Slack format (C-3)
│   │       │   └── meeting-prep-scheduler.ts # BullMQ cron for meeting prep (C-3)
│   │       └── workflows/
│   │           ├── jira-auto-dev.ts             # Router (OpenCode→Multi→Single)
│   │           ├── jira-auto-dev-multi.ts       # Multi-agent workflow + local CI/CD + preview
│   │           ├── jira-auto-dev-opencode.ts    # OpenCode SDK workflow + local CI/CD
│   │           ├── target-deploy.ts             # Push event → CD pipeline
│   │           └── smart-handoff.ts             # Smart handoff on Jira status change (B-2)
│   └── dashboard/           # React + Vite + Tailwind (port 3000) + AI Chat page
├── services/                # OUTSIDE pnpm workspace — separate npm projects
│   └── opencode-server/     # OpenCode SDK integration server (port 3333)
├── mcp-servers/             # OUTSIDE pnpm workspace — separate npm projects
│   └── opencode/            # 3 tools (trigger-figma-workflow, trigger-jira-workflow, get-workflow-status)
├── infrastructure/
│   ├── postgres/init.sql    # DB init (5 tables: +agentSessions, +agentMemory)
│   ├── redis/redis.conf     # Redis config
│   ├── opencode/            # OpenCode CLI config (opencode.json, oh-my-opencode.json)
│   │   ├── opencode.json        # Official MCP servers (GitHub, Atlassian, Figma, Datadog)
│   │   ├── oh-my-opencode.json  # Agent/category model config
│   │   ├── MCP_INTEGRATION.md   # OpenCode ↔ Official MCP server guide
│   │   └── DOCKER_SETUP.md      # Docker environment setup
│   └── openclaw/            # OpenClaw Gateway config + custom skills
│       ├── Dockerfile              # Gateway image (npm install, node:22)
│       ├── openclaw.json           # Gateway hooks + Slack + skill config
│       ├── workspace/.gitkeep      # Gateway workspace dir
│       └── skills/rtb-hub/SKILL.md # Custom skill (Slack→Hub trigger)
├── drizzle/                 # Migration files (at root, not in shared/)
│   ├── 0000_init.sql
│   ├── 0001_add_env_column.sql
│   ├── 0002_add_agent_sessions.sql  # Agent session tables
│   ├── 0003_add_context_links.sql   # Context links table (B-1)
│   └── 0004_add_decision_journal.sql # Decision journal table (C-2)
├── docs/
│   ├── GIT_BRANCH_STRATEGY.md  # Team git branch strategy (main/release/develop)
│   ├── OPENCLAW_INTEGRATION.md # OpenClaw integration design doc
│   ├── VISION_TEAM_AI_COORDINATOR.md # Team AI Coordinator vision doc
│   └── designs/                # Team AI Coordinator feature designs (6 docs + README)
├── scripts/
│   ├── dev-local.sh         # One-click local setup
│   ├── ci-local.sh          # Hub self CI (lint, typecheck, test, build)
│   ├── deploy-local.sh      # Hub self CD (Docker Compose restart)
│   ├── init-repos.js        # Auto-clone wiki + work repos
│   └── generate-secrets.js  # JWT_SECRET + CREDENTIAL_ENCRYPTION_KEY
├── docker-compose.yml       # Full stack (infra + native-mcp profile)
├── docker-compose.test.yml  # Dev: postgres + redis + opencode + openclaw (optional profiles)
├── .env                     # Default config (localhost for local dev)
├── .env.local               # Local overrides (DEV_MODE=true)
└── Dockerfile.pnpm          # Multi-stage pnpm build (ARG SERVICE=)
```

## WHERE TO LOOK

| Task                     | Location                                                       | Notes                                                   |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| Add webhook handler      | `packages/webhook-listener/src/routes/`                        | Copy existing pattern, include env routing              |
| Add AI workflow          | `packages/workflow-engine/src/workflows/`                      | Register in `queue/workers.ts`                          |
| Add MCP tool             | `mcp-servers/opencode/src/tools/`                              | Export in tools/index.ts (OpenCode workflow tools only) |
| Change DB schema         | `packages/shared/src/db/schema.ts`                             | Then `pnpm db:generate` + `pnpm db:push`                |
| Add shared type          | `packages/shared/src/types.ts`                                 | Rebuild: `pnpm build:shared`                            |
| Add dashboard page       | `packages/dashboard/src/pages/`                                | Add route in App.tsx                                    |
| Add dashboard component  | `packages/dashboard/src/components/`                           | common/ or layout/                                      |
| Add/modify agent         | `packages/workflow-engine/src/agents/implementations/`         | Register in registry.ts                                 |
| Agent orchestration      | `packages/workflow-engine/src/agents/`                         | orchestrator.ts, state-store.ts, pipelines.ts           |
| Multi-agent types        | `packages/shared/src/agent-types.ts`                           | AgentRole, AgentContext, AgentConfig, etc.              |
| Wiki knowledge           | `packages/workflow-engine/src/utils/wiki-knowledge.ts`         | Requires WIKI_REPO_URL + WIKI_LOCAL_PATH                |
| Repository management    | `packages/workflow-engine/src/utils/repo-manager.ts`           | Git clone/update for wiki + work repos                  |
| Local git operations     | `packages/workflow-engine/src/utils/local-git-ops.ts`          | Branch creation, commit, push for target repo           |
| Target repo CI           | `packages/workflow-engine/src/utils/target-ci.ts`              | Configurable CI steps (lint/test/build)                 |
| Target repo CD           | `packages/workflow-engine/src/utils/target-cd.ts`              | Docker Compose rolling deploy + rollback                |
| Branch polling           | `packages/workflow-engine/src/utils/branch-poller.ts`          | Git branch change detection → CD trigger                |
| Jira polling             | `packages/workflow-engine/src/utils/jira-poller.ts`            | Jira REST API polling → AI workflow trigger             |
| Target deploy workflow   | `packages/workflow-engine/src/workflows/target-deploy.ts`      | Push event → CD pipeline                                |
| Git branch strategy      | `docs/GIT_BRANCH_STRATEGY.md`                                  | main(prd)/release(stg)/develop(int)                     |
| OpenCode integration     | `services/opencode-server/`                                    | SDK server (port 3333), agents support                  |
| OpenCode MCP tools       | `mcp-servers/opencode/src/tools/`                              | 3 tools for workflow triggering                         |
| OpenCode config          | `infrastructure/opencode/`                                     | opencode.json, oh-my-opencode.json                      |
| Auth flow                | `packages/auth-service/src/`                                   | google/, middleware/, utils/                            |
| Environment config       | `.env` + `.env.local`                                          | .env.local overrides for local dev                      |
| Docker full stack        | `docker-compose.yml`                                           | Infra + native-mcp profile (4 containers)               |
| Docker with OpenCode     | `docker-compose.test.yml`                                      | --profile opencode for OpenCode services                |
| Slack notification       | `packages/workflow-engine/src/utils/notify-openclaw.ts`        | Fire-and-forget Hub→Slack via Slack Web API             |
| OpenClaw skill           | `infrastructure/openclaw/skills/rtb-hub/SKILL.md`              | Slack→Hub conversational trigger                        |
| OpenClaw config          | `infrastructure/openclaw/openclaw.json`                        | Gateway hooks + skill settings                          |
| OpenClaw Docker          | `infrastructure/openclaw/Dockerfile`                           | npm install openclaw@latest, node:22                    |
| OpenClaw integration     | `docs/OPENCLAW_INTEGRATION.md`                                 | Design doc for bidirectional Slack integration          |
| Preview environments     | `packages/workflow-engine/src/utils/preview-manager.ts`        | Worktree + DB template + process spawn                  |
| Chat API                 | `packages/webhook-listener/src/routes/chat.ts`                 | POST /api/chat, Anthropic tool-calling loop             |
| Chat tools               | `packages/webhook-listener/src/utils/chat-tools.ts`            | 5 read-only tools for chat (previews, status, context)  |
| CI pipeline              | `.github/workflows/ci.yml`                                     | lint → typecheck → test → build                         |
| Role-aware notifications | `packages/workflow-engine/src/utils/role-notifier.ts`          | Role×event template-based Slack notifications           |
| PR context enrichment    | `packages/workflow-engine/src/utils/pr-description-builder.ts` | Rich PR description with Jira/Figma/CI context          |
| Cross-reference engine   | `packages/workflow-engine/src/utils/context-engine.ts`         | Jira↔Figma↔GitHub↔Preview↔Deploy CRUD                   |
| Context API              | `packages/webhook-listener/src/routes/context.ts`              | GET /api/context/:jiraKey REST endpoint                 |
| Daily team digest        | `packages/workflow-engine/src/utils/digest-*.ts`               | Collector + formatter + BullMQ scheduler                |
| Blocker detection        | `packages/workflow-engine/src/utils/blocker-*.ts`              | Detector + formatter + BullMQ scheduler                 |
| Smart handoff            | `packages/workflow-engine/src/workflows/smart-handoff.ts`      | Jira status change → context briefing                   |
| Impact analysis          | `packages/workflow-engine/src/utils/impact-*.ts`               | PR diff analysis, risk assessment, reviewer suggestion  |
| Decision journal         | `packages/workflow-engine/src/utils/decision-*.ts`             | Auto-detect decisions, CRUD, weekly digest              |
| Meeting prep             | `packages/workflow-engine/src/utils/meeting-prep*.ts`          | Sprint review + daily scrum prep automation             |
| Team AI Coordinator docs | `docs/designs/`                                                | 6 feature design docs + README index                    |

## CODE MAP

| Symbol                       | Type  | Location                                        | Role                                                      |
| ---------------------------- | ----- | ----------------------------------------------- | --------------------------------------------------------- |
| `ENVIRONMENTS`               | const | shared/types.ts                                 | `['int','stg','prd']`                                     |
| `Environment`                | type  | shared/types.ts                                 | Zod-validated env string                                  |
| `WorkflowType`               | enum  | shared/types.ts                                 | 5 workflow types                                          |
| `WorkflowStatus`             | enum  | shared/types.ts                                 | PENDING→IN_PROGRESS→COMPLETED/FAILED                      |
| `QUEUE_NAMES`                | const | shared/constants.ts                             | BullMQ queue identifiers                                  |
| `NATIVE_MCP_ENDPOINTS`       | const | shared/constants.ts                             | Default native MCP server endpoints                       |
| `REPO_ROUTING`               | const | shared/constants.ts                             | Component→repo + env→branch mapping                       |
| `JiraComponent`              | type  | shared/types.ts                                 | `{ id, name, description? }`                              |
| `createLogger`               | fn    | shared/utils.ts                                 | pino + pino-pretty (dev)                                  |
| `requireEnv`                 | fn    | shared/utils.ts                                 | Throws if env var missing                                 |
| `workflowExecutions`         | table | shared/db/schema.ts                             | Drizzle schema, has `env` column                          |
| `webhookEvents`              | table | shared/db/schema.ts                             | Drizzle schema, has `env` column                          |
| `agentSessions`              | table | shared/db/schema.ts                             | Agent session state (24h TTL in Redis)                    |
| `agentMemory`                | table | shared/db/schema.ts                             | Agent cross-execution memory (7d TTL)                     |
| `createWorkers`              | fn    | workflow-engine/queue/workers.ts                | Creates 4 BullMQ workers                                  |
| `resolveGitHubTarget`        | fn    | workflow-engine/clients/mcp-helper.ts           | Label→component→fallback repo + env→branch routing        |
| `LABEL_REPO_ROUTING`         | const | shared/constants.ts                             | Label→repo mapping (LABEL_REPO_ROUTING env var)           |
| `LabelRepoMapping`           | type  | shared/constants.ts                             | `Record<string, string>` label→"owner/repo"               |
| `AgentRole`                  | enum  | shared/agent-types.ts                           | ANALYZER, PLANNER, DEVELOPER, REVIEWER, ORACLE            |
| `AgentContext`               | type  | shared/agent-types.ts                           | Shared context passed between agents                      |
| `AgentConfig`                | type  | shared/agent-types.ts                           | Agent config (role, tier, tokens)                         |
| `FEATURE_FLAGS`              | const | shared/constants.ts                             | `USE_MULTI_AGENT`, `LOCAL_POLLING_ENABLED`, etc.          |
| `BaseAgent`                  | class | workflow-engine/agents/base-agent.ts            | Abstract agent with AI client                             |
| `AgentOrchestrator`          | class | workflow-engine/agents/orchestrator.ts          | Executes agent pipeline sequentially                      |
| `AgentStateStore`            | class | workflow-engine/agents/state-store.ts           | Redis session + memory management                         |
| `agentRegistry`              | inst  | workflow-engine/agents/registry.ts              | Global agent registry singleton                           |
| `ensureAgentsRegistered`     | fn    | workflow-engine/agents/registry.ts              | Lazy agent initialization                                 |
| `PIPELINES`                  | const | workflow-engine/agents/pipelines.ts             | WorkflowType → pipeline step definitions                  |
| `WikiKnowledge`              | class | workflow-engine/utils/wiki-knowledge.ts         | Wiki indexer + domain search                              |
| `RepoManager`                | class | workflow-engine/utils/repo-manager.ts           | Git repo manager (clone/pull/fetch)                       |
| `getRepoManager`             | fn    | workflow-engine/utils/repo-manager.ts           | Singleton accessor for RepoManager                        |
| `PollingConfig`              | type  | shared/constants.ts                             | Branch polling config (interval, branches)                |
| `JiraPollingConfig`          | type  | shared/constants.ts                             | Jira polling config (host, JQL, credentials)              |
| `loadPollingConfig`          | fn    | shared/constants.ts                             | Loads branch polling config from env                      |
| `loadJiraPollingConfig`      | fn    | shared/constants.ts                             | Loads Jira polling config from env                        |
| `loadTargetCiConfig`         | fn    | shared/constants.ts                             | Loads target CI steps from env                            |
| `loadTargetCdConfig`         | fn    | shared/constants.ts                             | Loads target CD config from env                           |
| `BranchPoller`               | class | workflow-engine/utils/branch-poller.ts          | Git branch change detection + CD trigger                  |
| `JiraPoller`                 | class | workflow-engine/utils/jira-poller.ts            | Jira REST API polling + queue enqueue                     |
| `runTargetCi`                | fn    | workflow-engine/utils/target-ci.ts              | Runs CI steps sequentially on target repo                 |
| `runTargetCd`                | fn    | workflow-engine/utils/target-cd.ts              | Docker Compose rolling deploy + rollback                  |
| `createLocalBranch`          | fn    | workflow-engine/utils/local-git-ops.ts          | Creates feature/bugfix/hotfix branch locally              |
| `generateBranchName`         | fn    | workflow-engine/utils/local-git-ops.ts          | `{type}/{PROJ-123}-{description}` convention              |
| `processTargetDeploy`        | fn    | workflow-engine/workflows/target-deploy.ts      | Push event → CD pipeline                                  |
| `notifyOpenClaw`             | fn    | workflow-engine/utils/notify-openclaw.ts        | Fire-and-forget Slack notification via Web API            |
| `OpenClawConfig`             | type  | shared/constants.ts                             | OpenClaw gateway URL, token, channel                      |
| `loadOpenClawConfig`         | fn    | shared/constants.ts                             | Loads OpenClaw config from env vars                       |
| `PreviewConfig`              | type  | shared/constants.ts                             | Preview environment configuration                         |
| `PreviewInstance`            | type  | shared/constants.ts                             | Preview instance state (ports, pids, URLs)                |
| `PreviewStatus`              | type  | shared/constants.ts                             | `'starting'\|'running'\|'stopping'\|'stopped'\|'failed'`  |
| `loadPreviewConfig`          | fn    | shared/constants.ts                             | Loads preview config from env vars                        |
| `PreviewManager`             | class | workflow-engine/utils/preview-manager.ts        | Preview lifecycle (worktree+DB+process+Redis)             |
| `getPreviewManager`          | fn    | workflow-engine/utils/preview-manager.ts        | Singleton accessor for PreviewManager                     |
| `startPreview`               | fn    | workflow-engine/utils/preview-manager.ts        | Convenience: start preview for branch                     |
| `stopPreview`                | fn    | workflow-engine/utils/preview-manager.ts        | Convenience: stop and cleanup preview                     |
| `createChatRouter`           | fn    | webhook-listener/routes/chat.ts                 | Express router for POST /api/chat                         |
| `chatTools`                  | const | webhook-listener/utils/chat-tools.ts            | Anthropic tool definitions (5 tools)                      |
| `handleToolCall`             | fn    | webhook-listener/utils/chat-tools.ts            | Tool dispatcher (previews, workflows, system, context)    |
| `notifyByRole`               | fn    | workflow-engine/utils/role-notifier.ts          | Role-aware Slack notification (7 events × 6 roles)        |
| `renderTemplate`             | fn    | workflow-engine/utils/role-notifier.ts          | Template variable substitution for notifications          |
| `TeamRole`                   | type  | shared/constants.ts                             | `'designer'\|'developer'\|'reviewer'\|'qa'\|'pm'\|'lead'` |
| `NotifyEventContext`         | type  | shared/constants.ts                             | Event context for role-aware notifications                |
| `TeamNotifyConfig`           | type  | shared/constants.ts                             | Config for team notification channels                     |
| `loadTeamNotifyConfig`       | fn    | shared/constants.ts                             | Loads team notify config from env vars                    |
| `buildEnrichedPrDescription` | fn    | workflow-engine/utils/pr-description-builder.ts | Pure fn: builds rich PR body from context                 |
| `getContext`                 | fn    | workflow-engine/utils/context-engine.ts         | Get context_links by Jira key                             |
| `updateContext`              | fn    | workflow-engine/utils/context-engine.ts         | Upsert context_links (array append for PRs/deploys)       |
| `getContextByBranch`         | fn    | workflow-engine/utils/context-engine.ts         | Extract Jira key from branch → getContext                 |
| `getContextByPr`             | fn    | workflow-engine/utils/context-engine.ts         | JSONB array search by PR number                           |
| `extractJiraKey`             | fn    | workflow-engine/utils/context-engine.ts         | Regex extract Jira key from text                          |
| `contextLinks`               | table | shared/db/schema.ts                             | Cross-reference table (22 cols, 5 indexes)                |
| `createContextRouter`        | fn    | webhook-listener/routes/context.ts              | Express router for GET /api/context/:jiraKey              |
| `collectDigestData`          | fn    | workflow-engine/utils/digest-collector.ts       | Jira REST API + DB aggregate for daily digest             |
| `DigestData`                 | type  | workflow-engine/utils/digest-collector.ts       | Digest data structure (sprint, github, deploys, alerts)   |
| `formatDigestMessage`        | fn    | workflow-engine/utils/digest-formatter.ts       | Korean Slack message format for daily digest              |
| `DigestScheduler`            | class | workflow-engine/utils/digest-scheduler.ts       | BullMQ cron scheduler for daily digest                    |
| `DigestConfig`               | type  | shared/constants.ts                             | Digest cron + channel configuration                       |
| `loadDigestConfig`           | fn    | shared/constants.ts                             | Loads digest config from env vars                         |
| `detectBlockers`             | fn    | workflow-engine/utils/blocker-detector.ts       | Detect stale tickets + review delays                      |
| `detectStaleTickets`         | fn    | workflow-engine/utils/blocker-detector.ts       | Jira API: In Progress tickets unchanged for N days        |
| `BlockerAlert`               | type  | workflow-engine/utils/blocker-detector.ts       | Blocker alert structure (severity, type, suggestion)      |
| `BlockerDetectorConfig`      | type  | shared/constants.ts                             | Blocker detection thresholds configuration                |
| `loadBlockerConfig`          | fn    | shared/constants.ts                             | Loads blocker detection config from env vars              |
| `formatBlockerAlerts`        | fn    | workflow-engine/utils/blocker-formatter.ts      | Korean Slack format for blocker alerts                    |
| `BlockerScheduler`           | class | workflow-engine/utils/blocker-scheduler.ts      | BullMQ cron scheduler for blocker checks                  |
| `processSmartHandoff`        | fn    | workflow-engine/workflows/smart-handoff.ts      | Jira status change → context briefing to next role        |
| `analyzeImpact`              | fn    | workflow-engine/utils/impact-analyzer.ts        | Analyze PR diff for impact, risk, module classification   |
| `formatImpactForPr`          | fn    | workflow-engine/utils/impact-formatter.ts       | Markdown format for PR description                        |
| `formatImpactForSlack`       | fn    | workflow-engine/utils/impact-formatter.ts       | Plain text format for Slack notification                  |
| `detectDecisions`            | fn    | workflow-engine/utils/decision-detector.ts      | Keyword-based decision detection (Korean+English)         |
| `saveDecision`               | fn    | workflow-engine/utils/decision-store.ts         | Save decision to DB                                       |
| `findDecisionsByTags`        | fn    | workflow-engine/utils/decision-store.ts         | Query decisions by tags                                   |
| `formatDecisionNotification` | fn    | workflow-engine/utils/decision-formatter.ts     | Single decision notification format                       |
| `formatWeeklyDigest`         | fn    | workflow-engine/utils/decision-formatter.ts     | Weekly decision digest format                             |
| `prepareSprintReview`        | fn    | workflow-engine/utils/meeting-prep.ts           | Collect sprint review data from Jira API                  |
| `prepareDailyScrum`          | fn    | workflow-engine/utils/meeting-prep.ts           | Collect daily scrum data from Jira API                    |
| `formatSprintReview`         | fn    | workflow-engine/utils/meeting-prep-formatter.ts | Korean Slack format for sprint review                     |
| `formatDailyScrum`           | fn    | workflow-engine/utils/meeting-prep-formatter.ts | Korean Slack format for daily scrum                       |
| `MeetingPrepScheduler`       | class | workflow-engine/utils/meeting-prep-scheduler.ts | BullMQ cron scheduler for meeting prep                    |
| `ImpactAnalysisConfig`       | type  | shared/constants.ts                             | Impact analysis configuration                             |
| `DecisionJournalConfig`      | type  | shared/constants.ts                             | Decision journal configuration                            |
| `MeetingPrepConfig`          | type  | shared/constants.ts                             | Meeting prep configuration                                |
| `loadImpactAnalysisConfig`   | fn    | shared/constants.ts                             | Loads impact analysis config from env vars                |
| `loadDecisionJournalConfig`  | fn    | shared/constants.ts                             | Loads decision journal config from env vars               |
| `loadMeetingPrepConfig`      | fn    | shared/constants.ts                             | Loads meeting prep config from env vars                   |
| `decisionJournal`            | table | shared/db/schema.ts                             | Decision journal table (UUID PK, TEXT[] arrays)           |
| `IMCPClient`                 | iface | workflow-engine/clients/mcp-client-interface.ts | Common interface for MCP clients (native only since M-5)  |
| `McpService`                 | type  | workflow-engine/clients/mcp-client-interface.ts | `'GITHUB'\|'JIRA'\|'FIGMA'\|'DATADOG'`                    |
| `NativeMCPClient`            | class | workflow-engine/clients/native-mcp-client.ts    | SDK-based MCP client (implements IMCPClient)              |
| `loadMcpSdk`                 | fn    | workflow-engine/clients/mcp-sdk-loader.ts       | Dynamic require() for @modelcontextprotocol/sdk           |
| `mapToolCall`                | fn    | workflow-engine/clients/tool-name-mapper.ts     | Maps legacy tool names→native server tool names+input     |
| `getMcpClient`               | fn    | workflow-engine/clients/mcp-client.ts           | Returns NativeMCPClient for service+env (always native)   |
| `getNativeMcpToken`          | fn    | shared/constants.ts                             | Env-aware auth token loader for native MCP services       |
| `getNativeMcpEndpoint`       | fn    | shared/constants.ts                             | Env-aware endpoint loader for native MCP services         |
| `McpServiceKey`              | type  | shared/constants.ts                             | `'JIRA' \| 'FIGMA' \| 'GITHUB' \| 'DATADOG'`              |

## CONVENTIONS

- **Module system**: CommonJS (backend), ESNext (dashboard)
- **Env vars**: `requireEnv()` for required, `getEnv(key, default)` for optional
- **Multi-env routing**: `?env=int|stg|prd` query param OR `X-Env` header on webhooks
- **Per-env credentials**: `INT_JIRA_HOST`, `STG_JIRA_HOST` prefixes, fallback to unprefixed
- **Repo routing**: `LABEL_REPO_ROUTING` (label→repo, priority 1) + `REPO_ROUTING_REPOS` (component→repo, priority 2) + `REPO_ROUTING_BRANCHES` (env→branch), fallback to `GITHUB_REPO`
- **Logging**: `createLogger('service-name')` → pino (JSON in prod, pretty in dev)
- **DB migrations**: Drizzle files in root `drizzle/`, NOT in packages/shared/
- **Formatting**: Prettier — 100 chars, single quotes, trailing commas, semicolons
- **Tests**: Vitest, `__tests__/` dirs, `*.test.ts` naming

## ANTI-PATTERNS (THIS PROJECT)

- 3× `as any` in source (logger, github event type, JWT payload) — known debt
- 20× `as unknown` in test mocks — Express mock typing incomplete
- MCP servers are NOT in pnpm workspace — they use npm separately
- `Dockerfile.simple` uses npm link (legacy) — prefer `Dockerfile.pnpm`
- AI workflows have MCP tool-use wired but are not yet tested with real credentials

## COMMANDS

```bash
pnpm dev              # Start everything (infra + repos + build + 4 services)
pnpm dev:infra        # Docker infra only (postgres + redis)
pnpm dev:init-repos   # Clone/update wiki + work repos
pnpm build:shared     # MUST run first if shared types changed
pnpm build            # Build all packages
pnpm test             # 552 tests (vitest)
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm typecheck        # tsc --noEmit all packages
pnpm db:push          # Push schema to DB
pnpm db:studio        # Drizzle Studio GUI
```

## NOTES

- **Build order**: shared MUST build first — all backends import from it
- **`pnpm dev` loads**: `.env` then `.env.local` via dotenv-cli
- **`pnpm dev` flow**: infra → repos → shared build → 4 services (automatic)
- **DEV_MODE**: Set in .env.local. Login at `http://localhost:4001/auth/dev/login`
- **Docker ports**: postgres=5432, redis=6379 (standard, configured in .env)
- **Dashboard proxy**: Vite dev server on :3000, API calls go to :4000
- **MCP servers**: `mcp-servers/opencode/` provides 3 tools for triggering RTB workflows from OpenCode CLI sessions. NOT in pnpm workspace.
- **Zod v4**: shared uses `zod@^4.3.6` — different API from v3
- OpenAI dependency removed — project is Claude-only
- **Multi-agent mode**: `USE_MULTI_AGENT=true` enables 5-agent pipeline; `false` throws error (no AI workflow enabled).
- **OpenCode mode**: `USE_OPENCODE_AGENTS=true` enables OpenCode SDK integration; requires opencode-cli running on port 4096. Falls back to multi-agent on failure.
- **Wiki knowledge**: `WIKI_REPO_URL` + `WIKI_LOCAL_PATH` enable domain knowledge injection. Auto-cloned/updated at startup. Empty = disabled.
- **Work repo**: `WORK_REPO_URL` + `WORK_REPO_LOCAL_PATH` enable local git operations (branch creation, PR). Auto-initialized at startup.
- **Agent registration**: Uses lazy `require()` in `ensureAgentsRegistered()` to avoid circular dependencies
- **OpenCode integration**: services/opencode-server (port 3333) provides API for Oh-My-OpenCode agents (sisyphus, librarian, oracle, explorer, metis, momus). Requires opencode-cli container.
- **OpenCode MCP**: mcp-servers/opencode provides 3 tools for triggering RTB workflows from OpenCode CLI sessions.
- **Local polling**: `LOCAL_POLLING_ENABLED=true` (or `DEV_MODE=true`) starts both JiraPoller and BranchPoller at 10s default interval. Replaces webhooks for local development.
- **Jira polling**: Uses direct REST API (`/rest/api/3/search/jql`) with JQL filter. Default gate label: `RTB-AI-HUB` (configurable via `JIRA_POLLING_TRIGGER_LABEL`). Deduplicates by `updated` timestamp. Enqueues to existing `jira-queue`.
- **Label-based repo routing**: `LABEL_REPO_ROUTING=RTB-NEW=dev-rsquare/rtb-v2-mvp,RTB-LEGACY=dev-rsquare/rtb-legacy`. Two-tier system: gate label (triggerLabel) filters which issues are polled; repo labels determine target repository. Priority: label→component→GITHUB_REPO fallback.
- **Branch polling**: Monitors `develop`, `release/*`, `main` via `git fetch` + ref comparison. Push events enqueued to `github-queue` → `processTargetDeploy`.
- **Target CI**: Configurable steps via env vars (`TARGET_CI_*_CMD`). Runs in WORK_REPO_LOCAL_PATH. Used by AI workflows after code generation.
- **Target CD**: Docker Compose rolling deploy with health checks + rollback. Triggered by branch polling after merge, NOT by AI workflows.
- **Git branch strategy**: `main`(prd) / `release/*`(stg) / `develop`(int). Work branches: `feature/*`, `bugfix/*`, `hotfix/*`. Team conventions in `docs/GIT_BRANCH_STRATEGY.md`.
- **Slack notifications**: `OPENCLAW_NOTIFY_ENABLED=true` + `SLACK_BOT_TOKEN` enables direct Slack Web API notifications. No OpenClaw dependency for outbound. Notifications are fire-and-forget (never break workflows).
- **OpenClaw Docker**: Uses `npm install -g openclaw@latest` in `node:22-bookworm-slim`. No source vendoring. Config + skills mounted as volumes. Gateway starts with `--allow-unconfigured --bind lan`.
- **OpenClaw Skill**: `infrastructure/openclaw/skills/rtb-hub/SKILL.md` enables Slack→Hub conversational triggers via exec tool. Supports starting Jira work, checking status, and triggering deploys from Slack.
- **Preview environments**: `PREVIEW_ENABLED=true` enables branch-based preview environments. Uses git worktree + `CREATE DATABASE ... TEMPLATE` + process spawn. Each preview gets unique web/api ports. State stored in Redis. Auto-cleanup after `PREVIEW_TTL_HOURS` (default 24h).
- **Dashboard chat**: `POST /api/chat` provides Anthropic-powered AI chat with tool-calling. 4 read-only tools: `list_previews`, `get_preview`, `get_workflow_status`, `get_system_info`. Max 10 tool-calling iterations per request. Requires `ANTHROPIC_API_KEY`.
- **Team AI Coordinator (Phase A+B+C complete)**: 9 features implemented. Phase A: role-aware notifications (A-1), PR context enrichment (A-2), daily team digest (A-3). Phase B: cross-reference engine (B-1), smart handoff (B-2), blocker detection (B-3). Phase C: PR impact analysis (C-1), decision journal (C-2), meeting prep automation (C-3). All use feature flags for gradual activation. 192 new tests (282→474 total).
- **Role-aware notifications**: `TEAM_ROLE_CHANNELS=designer=C01234,developer=C05678,...` enables role-specific Slack channels. 7 event types × 6 roles. Falls back to default channel if unconfigured.
- **PR context enrichment**: `buildEnrichedPrDescription()` is a pure function that generates rich PR body with Jira/Figma/CI/wiki context sections.
- **Cross-reference engine**: `context_links` table (22 columns, 5 indexes) stores Jira↔Figma↔GitHub↔Preview↔Deploy relationships. `updateContext()` uses upsert with array append for PRs/deploys. REST API at `GET /api/context/:jiraKey`. Chat tool `get_issue_context` added.
- **Daily team digest**: `TEAM_DIGEST_ENABLED=true` + BullMQ cron. Collects sprint data from Jira REST API + workflow execution stats from DB. Korean-formatted Slack message.
- **Blocker detection**: `BLOCKER_DETECTION_ENABLED=true` + BullMQ cron. Detects stale In Progress tickets (configurable thresholds). Korean-formatted alert messages.
- **Smart handoff**: `SMART_HANDOFF_ENABLED=true`. Triggers on Jira status changes (4 transitions: Design Complete→In Progress, In Progress→Code Review, Code Review→QA, QA→Done). Template-based briefings with context engine data.
- **Impact analysis**: `IMPACT_ANALYSIS_ENABLED=true` enables PR diff impact analysis. Classifies affected modules, calculates risk level, suggests reviewers. Config: `IMPACT_SIMILAR_CHANGE_LIMIT`, `IMPACT_HIGH_THRESHOLD`, `IMPACT_MEDIUM_THRESHOLD`.
- **Decision journal**: `DECISION_JOURNAL_ENABLED=true` enables automatic decision detection from PR/Jira comments. Korean+English keyword detection, DB storage with tags/participants, weekly digest. Config: `DECISION_CONFIDENCE_THRESHOLD`, `DECISION_WEEKLY_DIGEST_DAY`.
- **Meeting prep**: `MEETING_PREP_ENABLED=true` enables meeting prep automation. Daily scrum prep + sprint review prep from Jira data. BullMQ cron scheduler. Config: `DAILY_SCRUM_PREP_CRON`, `SPRINT_REVIEW_PREP_HOURS`, `MEETING_PREP_CHANNEL`.
- **MCP migration (Phase M-1~M-5 complete)**: Design doc at `docs/designs/MCP_MIGRATION.md`. Replaced 4 custom MCP servers (jira, github, figma, datadog) with official/community MCP servers + `@modelcontextprotocol/sdk` native Client. Uses `supergateway` for stdio→HTTP bridge in Docker (Jira, Datadog). GitHub official server (`github/github-mcp-server`) confirmed 100% tool coverage. Jira community server (`@aashari/mcp-server-atlassian-jira` v3.3.0, Generic REST 5 tools) confirmed 100% coverage. Figma official MCP server (`mcp.figma.com/mcp`, Streamable HTTP direct — no Docker needed) confirmed 7 tools, near-complete coverage (getComments unsupported but unused). Datadog community server (`@winor30/mcp-server-datadog` v1.7.0, 20 tools) confirmed near-complete coverage (createMonitor gap, proxy extension planned).
- **MCP Phase M-1 (client abstraction) complete**: `IMCPClient` interface + `NativeMCPClient` (SDK-based) + `tool-name-mapper` (4-service mapping) + feature flag routing (`shouldUseNative()` → `getMcpClient()`). Files: `mcp-client-interface.ts`, `native-mcp-client.ts`, `mcp-sdk-loader.ts`, `tool-name-mapper.ts`. Modified: `mcp-client.ts` (implements IMCPClient + routing), `mcp-helper.ts` (MCPClient→IMCPClient types). 75 new tests (549 total).
- **MCP Phase M-2 (GitHub auth) complete**: Remote HTTP chosen (no Docker/supergateway). `NativeMCPClient` now accepts `authToken` parameter, passes `Authorization: Bearer` header via `StreamableHTTPClientTransport` requestInit opts. `getNativeMcpToken(service, env)` loads env-specific tokens (e.g., `INT_GITHUB_TOKEN` → fallback `GITHUB_TOKEN`). `getMcpClient()` wires token from `getNativeMcpToken()` to `NativeMCPClient`. `McpServiceKey` type exported. `SdkTransportConstructor` accepts opts. 6 new tests (555 total).
- **MCP Phase M-3/M-4 (Docker + env-aware endpoints) complete**: `getNativeMcpEndpoint(service, env)` loads env-specific endpoints (e.g., `NATIVE_MCP_JIRA_INT_ENDPOINT` → fallback `NATIVE_MCP_ENDPOINTS['JIRA']`). `mcp-client.ts` uses `getNativeMcpEndpoint()` instead of static endpoints. `docker-compose.yml` has 4 native MCP containers under `native-mcp` profile (jira-native-int/stg, datadog-native-int/stg). `.env` has NATIVE_MCP feature flags + endpoint vars (commented out). Dockerfiles: `mcp-servers/jira-native/` (supergateway + @aashari/mcp-server-atlassian-jira), `mcp-servers/datadog-native/` (supergateway + @winor30/mcp-server-datadog). 3 new tests (558 total).
- **OpenCode MCP (official servers) complete**: `infrastructure/opencode/opencode.json` migrated from 8 custom Docker MCP servers to 4 official/community MCP servers. GitHub: `@modelcontextprotocol/server-github` (stdio, GITHUB_TOKEN). Atlassian: `mcp-remote` + `mcp.atlassian.com/v1/sse` (OAuth). Figma: `mcp-remote` + `mcp.figma.com/mcp` (OAuth). Datadog: `@winor30/mcp-server-datadog` (stdio, DATADOG_API_KEY). No Docker dependency for MCP — npx or Remote HTTP. `jira-auto-dev-opencode.ts` prompt updated with official tool names.
- **MCP Phase M-5 (legacy cleanup) complete**: Deleted 4 custom MCP server directories (`mcp-servers/jira/`, `github/`, `figma/`, `datadog/`). Removed 12 custom MCP Docker containers from `docker-compose.yml`. Removed `MCPClient` legacy class, `shouldUseNative()` function, `MCP_ENDPOINTS`/`MCP_ENDPOINTS_BY_ENV` constants, `getMcpEndpointsForEnv()` function, and 5 `USE_NATIVE_MCP*` feature flags from `constants.ts`. `getMcpClient()` now always returns `NativeMCPClient`. Also deleted `mcp-servers/jira-native/` and `mcp-servers/datadog-native/` (supergateway Docker) and removed 4 native-mcp profile containers from `docker-compose.yml`. Tests: 552 (6 legacy tests removed from 558).
