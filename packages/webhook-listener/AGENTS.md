# WEBHOOK LISTENER

Express API receiving external webhooks (Figma, Jira, GitHub, Datadog), validating them, and enqueuing BullMQ jobs. Port 4000.

## STRUCTURE

```
src/
├── index.ts              # Express app setup, Redis connection, queue init
├── routes/
│   ├── index.ts          # Route factory: createRoutes({...queues, redis})
│   ├── figma.ts          # POST /webhooks/figma
│   ├── jira.ts           # POST /webhooks/jira
│   ├── github.ts         # POST /webhooks/github
│   ├── datadog.ts        # POST /webhooks/datadog
│   └── chat.ts           # POST /api/chat — Anthropic tool-calling AI chat
├── utils/
│   └── chat-tools.ts     # 4 chat tools: list_previews, get_preview, get_workflow_status, get_system_info
├── middleware/
│   ├── webhook-signature.ts  # HMAC-SHA256 verification per provider
│   └── auth.ts               # JWT auth middleware (Bearer or cookie)
└── __tests__/            # 3 test files (routes, signatures, rate-limit)
```

## REQUEST FLOW

```
Webhook POST → rate-limit → signature verify → Zod validate → extract env → enqueue BullMQ job → 202 Accepted
```

## CONVENTIONS

- **Env routing**: Every handler extracts env from `req.query.env` || `req.headers['x-env']` || `DEFAULT_ENVIRONMENT`
- **Raw body**: `index.ts` captures `req.rawBody` (Buffer) for HMAC signature verification
- **Job data shape**: `{ event: WebhookEvent, userId?: string, env: Environment }`
- **Jira event extraction**: `jira.ts` explicitly extracts `projectKey`, `components[]`, `labels[]` from `issue.fields` for repo routing
- **Rate limiting**: 60 req/min on health, 30 req/min on webhooks
- **Queue names**: Import from `@rtb-ai-hub/shared` `QUEUE_NAMES`

## ADDING A NEW WEBHOOK

1. Create `src/routes/{service}.ts` — copy existing handler pattern
2. Add Zod schema in `packages/shared/src/schemas.ts`
3. Add queue name in `packages/shared/src/constants.ts`
4. Register route in `src/routes/index.ts`
5. Add signature verifier in `src/middleware/webhook-signature.ts`
6. Add matching worker in `packages/workflow-engine/src/queue/workers.ts`

## CHAT API

```
POST /api/chat → Anthropic Claude tool-calling loop (max 10 iterations)
```

- **Route**: `routes/chat.ts` — `createChatRouter(redis)` returns Express Router
- **Tools**: `utils/chat-tools.ts` — 4 read-only tools (`list_previews`, `get_preview`, `get_workflow_status`, `get_system_info`)
- **Handler**: `handleToolCall(toolName, input, redis)` dispatches to tool implementations
- **Redis dependency**: Chat route needs Redis connection for preview state queries
- **Dependency**: `@anthropic-ai/sdk@0.74.0` (upgraded from 0.17.2 for tool support)
- **Env var**: `ANTHROPIC_API_KEY` required for chat functionality

## ANTI-PATTERNS

- `as any` on logger in pinoHttp call (index.ts:36) — pino type mismatch
- `as any` on eventType in github.ts:37 — should be union type
- Signature secrets are optional — verification silently skips if secret not set
