# MCP SERVERS

5 Model Context Protocol servers (Jira, Figma, GitHub, Datadog, OpenCode). Each is an independent Node.js project — NOT part of pnpm workspace.

## STRUCTURE (identical pattern per server)

```
mcp-servers/{service}/
├── package.json          # Independent npm project (NOT workspace:*)
├── package-lock.json     # npm lockfile (NOT pnpm)
├── tsconfig.json         # Node16 modules, ES2022 target
├── Dockerfile            # Standalone Docker image
└── src/
    ├── index.ts          # MCP server setup + tool registration
    ├── client.ts         # API client for external service (axios-based)
    └── tools/
        ├── index.ts      # Barrel export of all tools
        └── {toolName}.ts # Individual tool implementation
```

## TOOLS PER SERVER

| Server           | Tools                                                                                                                                                                    | Key Operations                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| **jira** (8)     | createEpic, createIssue, createSubtask, getIssue, searchIssues, updateIssue, transitionIssue, addComment                                                                 |                                |
| **figma** (6)    | getFile, getFileNodes, getFileComponents, getFileStyles, getFileVariables, getComments                                                                                   |                                |
| **github** (10)  | createBranch, createCommit, createPullRequest, createReview, createReviewComment, createIssueComment, getPullRequest, getPullRequestDiff, mergePullRequest, searchIssues |                                |
| **datadog** (6)  | getLogs, queryMetrics, getTraces, getAlerts, getMonitors, createMonitor                                                                                                  |                                |
| **opencode** (3) | trigger-figma-workflow, trigger-jira-workflow, get-workflow-status                                                                                                       | Trigger RTB workflows from CLI |

## CONVENTIONS

- **Module system**: Node16 (ESM-compatible) — different from backend packages (CommonJS)
- **Build/install**: `npm install` + `npm run build` (NOT pnpm)
- **Docker**: Each has own Dockerfile, runs on port 3000 inside container
- **Environment**: Credentials via env vars (JIRA_HOST, FIGMA_ACCESS_TOKEN, etc.)
- **Multi-env containers**: docker-compose.yml creates `mcp-{service}-int`, `mcp-{service}-stg` per env

## ADDING A TOOL

1. Create `src/tools/{toolName}.ts` — export tool definition
2. Add export in `src/tools/index.ts`
3. Register tool in `src/index.ts` server setup
4. Rebuild: `npm run build` (in the specific mcp-server directory)

## ANTI-PATTERNS

- `as unknown as string` in github/getPullRequestDiff.ts — double cast hides type issue
- No tests in any MCP server
- Not managed by pnpm workspace — easy to forget to install/build separately
