# Multi-Provider Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 7개 역할별 에이전트가 Claude뿐 아니라 OpenAI, Gemini를 에이전트별로 개별 사용할 수 있도록 Provider Adapter Pattern으로 리팩토링한다.

**Architecture:** `ProviderAdapter` 인터페이스를 도입해 각 AI 프로바이더를 독립 어댑터로 구현하고, `AIProviderRouter`가 DB의 `agent_model_config` 테이블에서 에이전트별 설정을 로드해 적절한 어댑터로 라우팅한다. 기존 `AnthropicClient`는 `ClaudeAdapter`로 전환되며, `DebateEngine`은 단일 클라이언트 대신 Router를 사용한다.

**Tech Stack:** `@anthropic-ai/sdk` (기존), `openai` ^4.x (신규), `@google/generative-ai` ^0.x (신규), Drizzle ORM, Vitest

---

## Task 1: Shared 타입 — ProviderAdapter 인터페이스 추가

기존 `AIClient` 인터페이스를 `ProviderAdapter`로 교체하고, `PersonaDefinition`에 `preferredProvider` 필드를 추가한다.

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/debate-types.ts`

**Step 1: `types.ts`에서 기존 `AIClient` 인터페이스 제거 후 아래로 교체**

```ts
// packages/shared/src/types.ts

// AIModel enum — Claude 전용 항목 유지, 아래에 새 타입 추가
export type ProviderType = 'claude' | 'openai' | 'gemini';

export interface ProviderAdapter {
  readonly provider: ProviderType;

  complete(
    prompt: string,
    options: {
      systemPrompt: string;
      maxTokens: number;
      temperature: number;
    }
  ): Promise<AIResponse>;

  calculateCost(tokensInput: number, tokensOutput: number, model: string): number;
}
```

`AIClient`, `AIGenerateOptions`, `AIResponseWithTools` 인터페이스는 제거. `AIResponse`, `MCPTool`, `MCPToolCall` 타입은 유지.

**Step 2: `debate-types.ts`에서 `PersonaDefinition`에 옵셔널 필드 추가**

```ts
export type PersonaDefinition = {
  persona: AgentPersona;
  codename: string;
  role: string;
  description: string;
  traits: string[];
  vocabulary: string[];
  decisionFramework: string;
  domainExpertise: string[];
  handoffTriggers: Partial<Record<AgentPersona, string>>;
  aiTier: AITier;                         // fallback용 — DB 설정 없을 때 Claude tier 결정에 사용
  preferredProvider?: ProviderType;       // 신규: persona 수준 권장 provider
  maxTokensPerTurn: number;
};
```

**Step 3: `packages/shared/src/index.ts`에서 `ProviderType`, `ProviderAdapter` export 추가 확인**

```ts
export type { ProviderType, ProviderAdapter } from './types';
```

**Step 4: shared 빌드**

```bash
pnpm build:shared
```

Expected: 빌드 성공, 오류 없음.

**Step 5: typecheck**

```bash
pnpm typecheck
```

Expected: `AIClient` 참조가 남아 있으면 타입 오류 발생 — 다음 Task에서 해결됨.

**Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/debate-types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ProviderAdapter interface and ProviderType for multi-provider support"
```

---

## Task 2: DB 스키마 — agent_model_config 테이블 추가

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Run: `pnpm db:generate && pnpm db:migrate`

**Step 1: schema.ts에 테이블 추가**

`debateSessionsRelations` 블록 아래에 추가:

```ts
// ─── agent_model_config ──────────────────────────────────────────────────────

export const agentModelConfig = pgTable(
  'agent_model_config',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    persona: varchar('persona', { length: 50 }).notNull(),    // AgentPersona enum 값
    provider: varchar('provider', { length: 20 }).notNull(),  // 'claude' | 'openai' | 'gemini'
    model: varchar('model', { length: 100 }).notNull(),       // 실제 모델 ID
    env: varchar('env', { length: 10 }).notNull().default('all'), // 'all' | 'int' | 'stg' | 'prd'
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_agent_model_config_persona').on(table.persona),
    index('idx_agent_model_config_env').on(table.env),
  ]
);
```

**Step 2: shared 빌드**

```bash
pnpm build:shared
```

**Step 3: 마이그레이션 생성**

```bash
pnpm db:generate
```

Expected: `drizzle/` 디렉토리에 새 migration SQL 파일 생성.

**Step 4: 마이그레이션 실행 (Docker infra 실행 중이어야 함)**

```bash
pnpm db:migrate
```

Expected: Migration applied successfully.

**Step 5: seed 스크립트 작성**

`packages/workflow-engine/src/clients/adapters/seed-agent-config.ts` (임시 스크립트):

```ts
// 이 파일은 최초 1회 실행 후 삭제 가능
import { db } from '../database';
import { agentModelConfig } from '@rtb-ai-hub/shared';
import { generateId } from '@rtb-ai-hub/shared';

const DEFAULT_CONFIGS = [
  { persona: 'pm',               provider: 'claude', model: 'claude-sonnet-4-20250514' },
  { persona: 'system-planner',   provider: 'claude', model: 'claude-sonnet-4-20250514' },
  { persona: 'ux-designer',      provider: 'openai', model: 'gpt-4o' },
  { persona: 'ui-developer',     provider: 'openai', model: 'gpt-4o' },
  { persona: 'backend-developer',provider: 'claude', model: 'claude-sonnet-4-20250514' },
  { persona: 'qa',               provider: 'gemini', model: 'gemini-2.0-flash' },
  { persona: 'devops',           provider: 'gemini', model: 'gemini-2.0-flash' },
] as const;

for (const config of DEFAULT_CONFIGS) {
  await db.insert(agentModelConfig).values({
    id: generateId('amc'),
    ...config,
    env: 'all',
    enabled: true,
  }).onConflictDoNothing();
}
console.log('Seeded agent_model_config');
process.exit(0);
```

**Step 6: Commit**

```bash
git add packages/shared/src/db/schema.ts drizzle/
git commit -m "feat(shared): add agent_model_config table for per-agent provider settings"
```

---

## Task 3: ClaudeAdapter 구현

기존 `AnthropicClient` 로직을 `ClaudeAdapter`로 이전하고 `ProviderAdapter` 인터페이스를 구현한다.

**Files:**
- Create: `packages/workflow-engine/src/clients/adapters/claude-adapter.ts`
- Create: `packages/workflow-engine/src/clients/adapters/__tests__/claude-adapter.test.ts`

**Step 1: 실패하는 테스트 작성**

```ts
// packages/workflow-engine/src/clients/adapters/__tests__/claude-adapter.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

describe('ClaudeAdapter', () => {
  let adapter: import('../claude-adapter').ClaudeAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ClaudeAdapter } = await import('../claude-adapter');
    adapter = new ClaudeAdapter('test-api-key');
  });

  it('should have provider = claude', () => {
    expect(adapter.provider).toBe('claude');
  });

  it('complete() returns AIResponse', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello from Claude' }],
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: 'end_turn',
    });

    const result = await adapter.complete('Say hello', {
      systemPrompt: 'You are PM',
      maxTokens: 1000,
      temperature: 0.7,
    });

    expect(result.text).toBe('Hello from Claude');
    expect(result.tokensUsed.input).toBe(10);
    expect(result.tokensUsed.output).toBe(20);
    expect(result.model).toBe('claude-sonnet-4-20250514');
  });

  it('calculateCost() returns correct USD amount', () => {
    // claude-sonnet-4: input $3/MTok, output $15/MTok
    const cost = adapter.calculateCost(1_000_000, 1_000_000, 'claude-sonnet-4-20250514');
    expect(cost).toBeCloseTo(18.0, 2); // $3 + $15
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/adapters/__tests__/claude-adapter.test.ts
```

Expected: FAIL — `ClaudeAdapter` not found.

**Step 3: ClaudeAdapter 구현**

```ts
// packages/workflow-engine/src/clients/adapters/claude-adapter.ts

import Anthropic from '@anthropic-ai/sdk';
import type { ProviderAdapter, ProviderType, AIResponse } from '@rtb-ai-hub/shared';
import { requireEnv, createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('claude-adapter');

export class ClaudeAdapter implements ProviderAdapter {
  readonly provider: ProviderType = 'claude';
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({ apiKey: apiKey || requireEnv('ANTHROPIC_API_KEY') });
    this.defaultModel = model || process.env.AI_MODEL_CLAUDE || 'claude-sonnet-4-20250514';
  }

  async complete(
    prompt: string,
    options: { systemPrompt: string; maxTokens: number; temperature: number }
  ): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected content type from Anthropic');

    logger.debug({ model: response.model, tokens: response.usage }, 'Claude complete');

    return {
      text: content.text,
      model: response.model,
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      finishReason: response.stop_reason || 'unknown',
    };
  }

  calculateCost(tokensInput: number, tokensOutput: number, model: string): number {
    const costs: Record<string, { input: number; output: number }> = {
      'claude-sonnet-4-20250514':    { input: 3.0,  output: 15.0 },
      'claude-sonnet-4-5-20250514':  { input: 2.0,  output: 10.0 },
      'claude-3-7-sonnet-20250219':  { input: 3.0,  output: 15.0 },
      'claude-3-5-sonnet-20241022':  { input: 3.0,  output: 15.0 },
      'claude-3-5-haiku-20241022':   { input: 0.8,  output: 4.0  },
      'claude-3-opus-20240229':      { input: 15.0, output: 75.0 },
    };
    const rate = costs[model] ?? costs['claude-sonnet-4-20250514'];
    return (tokensInput * rate.input + tokensOutput * rate.output) / 1_000_000;
  }
}
```

**Step 4: 테스트 통과 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/adapters/__tests__/claude-adapter.test.ts
```

Expected: PASS — 3 tests passed.

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/clients/adapters/
git commit -m "feat(workflow-engine): add ClaudeAdapter implementing ProviderAdapter interface"
```

---

## Task 4: OpenAIAdapter 구현

**Files:**
- Modify: `packages/workflow-engine/package.json` (openai 패키지 추가)
- Create: `packages/workflow-engine/src/clients/adapters/openai-adapter.ts`
- Create: `packages/workflow-engine/src/clients/adapters/__tests__/openai-adapter.test.ts`

**Step 1: openai 패키지 설치**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine add openai
```

Expected: `openai` ^4.x가 `package.json`에 추가됨.

**Step 2: 실패하는 테스트 작성**

```ts
// packages/workflow-engine/src/clients/adapters/__tests__/openai-adapter.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe('OpenAIAdapter', () => {
  let adapter: import('../openai-adapter').OpenAIAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { OpenAIAdapter } = await import('../openai-adapter');
    adapter = new OpenAIAdapter('test-api-key');
  });

  it('should have provider = openai', () => {
    expect(adapter.provider).toBe('openai');
  });

  it('complete() maps system prompt to messages array', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello from GPT' }, finish_reason: 'stop' }],
      model: 'gpt-4o',
      usage: { prompt_tokens: 15, completion_tokens: 25 },
    });

    const result = await adapter.complete('Say hello', {
      systemPrompt: 'You are QA engineer',
      maxTokens: 1000,
      temperature: 0.7,
    });

    expect(result.text).toBe('Hello from GPT');
    expect(result.tokensUsed.input).toBe(15);
    expect(result.tokensUsed.output).toBe(25);

    // system prompt가 messages[0] 으로 전달되어야 함
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: 'You are QA engineer' }),
        ]),
      })
    );
  });

  it('calculateCost() returns correct USD for gpt-4o', () => {
    // gpt-4o: input $2.5/MTok, output $10/MTok
    const cost = adapter.calculateCost(1_000_000, 1_000_000, 'gpt-4o');
    expect(cost).toBeCloseTo(12.5, 2);
  });
});
```

**Step 3: 테스트 실패 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/adapters/__tests__/openai-adapter.test.ts
```

Expected: FAIL — `OpenAIAdapter` not found.

**Step 4: OpenAIAdapter 구현**

```ts
// packages/workflow-engine/src/clients/adapters/openai-adapter.ts

import OpenAI from 'openai';
import type { ProviderAdapter, ProviderType, AIResponse } from '@rtb-ai-hub/shared';
import { requireEnv, createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('openai-adapter');

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider: ProviderType = 'openai';
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey?: string, model?: string) {
    this.client = new OpenAI({ apiKey: apiKey || requireEnv('OPENAI_API_KEY') });
    this.defaultModel = model || process.env.AI_MODEL_OPENAI || 'gpt-4o';
  }

  async complete(
    prompt: string,
    options: { systemPrompt: string; maxTokens: number; temperature: number }
  ): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    const choice = response.choices[0];
    if (!choice?.message.content) throw new Error('Empty response from OpenAI');

    logger.debug({ model: response.model, tokens: response.usage }, 'OpenAI complete');

    return {
      text: choice.message.content,
      model: response.model,
      tokensUsed: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
      },
      finishReason: choice.finish_reason || 'unknown',
    };
  }

  calculateCost(tokensInput: number, tokensOutput: number, model: string): number {
    const costs: Record<string, { input: number; output: number }> = {
      'gpt-4o':        { input: 2.5,  output: 10.0 },
      'gpt-4o-mini':   { input: 0.15, output: 0.6  },
      'gpt-4-turbo':   { input: 10.0, output: 30.0 },
      'o1':            { input: 15.0, output: 60.0 },
    };
    const rate = costs[model] ?? costs['gpt-4o'];
    return (tokensInput * rate.input + tokensOutput * rate.output) / 1_000_000;
  }
}
```

**Step 5: 테스트 통과 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/adapters/__tests__/openai-adapter.test.ts
```

Expected: PASS — 3 tests passed.

**Step 6: Commit**

```bash
git add packages/workflow-engine/src/clients/adapters/openai-adapter.ts \
        packages/workflow-engine/src/clients/adapters/__tests__/openai-adapter.test.ts \
        packages/workflow-engine/package.json pnpm-lock.yaml
git commit -m "feat(workflow-engine): add OpenAIAdapter for GPT-4o support"
```

---

## Task 5: GeminiAdapter 구현

**Files:**
- Modify: `packages/workflow-engine/package.json`
- Create: `packages/workflow-engine/src/clients/adapters/gemini-adapter.ts`
- Create: `packages/workflow-engine/src/clients/adapters/__tests__/gemini-adapter.test.ts`

**Step 1: Gemini 패키지 설치**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine add @google/generative-ai
```

**Step 2: 실패하는 테스트 작성**

```ts
// packages/workflow-engine/src/clients/adapters/__tests__/gemini-adapter.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe('GeminiAdapter', () => {
  let adapter: import('../gemini-adapter').GeminiAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { GeminiAdapter } = await import('../gemini-adapter');
    adapter = new GeminiAdapter('test-api-key');
  });

  it('should have provider = gemini', () => {
    expect(adapter.provider).toBe('gemini');
  });

  it('complete() injects system prompt via systemInstruction', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Hello from Gemini',
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 18 },
      },
    });

    const result = await adapter.complete('Say hello', {
      systemPrompt: 'You are DevOps',
      maxTokens: 1000,
      temperature: 0.7,
    });

    expect(result.text).toBe('Hello from Gemini');
    expect(result.tokensUsed.input).toBe(12);
    expect(result.tokensUsed.output).toBe(18);

    // Gemini는 systemInstruction으로 전달
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: 'You are DevOps',
      })
    );
  });

  it('calculateCost() returns correct USD for gemini-2.0-flash', () => {
    // gemini-2.0-flash: input $0.075/MTok, output $0.30/MTok
    const cost = adapter.calculateCost(1_000_000, 1_000_000, 'gemini-2.0-flash');
    expect(cost).toBeCloseTo(0.375, 3);
  });
});
```

**Step 3: 테스트 실패 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/adapters/__tests__/gemini-adapter.test.ts
```

Expected: FAIL.

**Step 4: GeminiAdapter 구현**

```ts
// packages/workflow-engine/src/clients/adapters/gemini-adapter.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ProviderAdapter, ProviderType, AIResponse } from '@rtb-ai-hub/shared';
import { requireEnv, createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('gemini-adapter');

export class GeminiAdapter implements ProviderAdapter {
  readonly provider: ProviderType = 'gemini';
  private genAI: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(apiKey?: string, model?: string) {
    this.genAI = new GoogleGenerativeAI(apiKey || requireEnv('GEMINI_API_KEY'));
    this.defaultModel = model || process.env.AI_MODEL_GEMINI || 'gemini-2.0-flash';
  }

  async complete(
    prompt: string,
    options: { systemPrompt: string; maxTokens: number; temperature: number }
  ): Promise<AIResponse> {
    const model = this.genAI.getGenerativeModel({
      model: this.defaultModel,
      systemInstruction: options.systemPrompt,
      generationConfig: {
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    if (!text) throw new Error('Empty response from Gemini');

    const usage = response.usageMetadata;
    logger.debug({ model: this.defaultModel, usage }, 'Gemini complete');

    return {
      text,
      model: this.defaultModel,
      tokensUsed: {
        input: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0,
      },
      finishReason: 'end_turn',
    };
  }

  calculateCost(tokensInput: number, tokensOutput: number, model: string): number {
    const costs: Record<string, { input: number; output: number }> = {
      'gemini-2.0-flash':        { input: 0.075,  output: 0.30  },
      'gemini-2.0-flash-lite':   { input: 0.0375, output: 0.15  },
      'gemini-1.5-pro':          { input: 1.25,   output: 5.0   },
      'gemini-1.5-flash':        { input: 0.075,  output: 0.30  },
    };
    const rate = costs[model] ?? costs['gemini-2.0-flash'];
    return (tokensInput * rate.input + tokensOutput * rate.output) / 1_000_000;
  }
}
```

**Step 5: 테스트 통과 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/adapters/__tests__/gemini-adapter.test.ts
```

Expected: PASS — 3 tests passed.

**Step 6: Commit**

```bash
git add packages/workflow-engine/src/clients/adapters/gemini-adapter.ts \
        packages/workflow-engine/src/clients/adapters/__tests__/gemini-adapter.test.ts \
        packages/workflow-engine/package.json pnpm-lock.yaml
git commit -m "feat(workflow-engine): add GeminiAdapter for Gemini 2.0 Flash support"
```

---

## Task 6: AIProviderRouter 구현

DB에서 에이전트별 설정을 로드하고 적절한 Adapter를 반환하는 라우터.

**Files:**
- Create: `packages/workflow-engine/src/clients/provider-router.ts`
- Create: `packages/workflow-engine/src/clients/__tests__/provider-router.test.ts`

**Step 1: 실패하는 테스트 작성**

```ts
// packages/workflow-engine/src/clients/__tests__/provider-router.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPersona } from '@rtb-ai-hub/shared';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';

const mockDbSelect = vi.fn();
vi.mock('../../utils/database', () => ({
  db: { select: mockDbSelect },
}));

describe('AIProviderRouter', () => {
  let router: import('../provider-router').AIProviderRouter;
  const mockClaudeAdapter: ProviderAdapter = {
    provider: 'claude',
    complete: vi.fn(),
    calculateCost: vi.fn(),
  };
  const mockOpenAIAdapter: ProviderAdapter = {
    provider: 'openai',
    complete: vi.fn(),
    calculateCost: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { AIProviderRouter } = await import('../provider-router');
    router = new AIProviderRouter([mockClaudeAdapter, mockOpenAIAdapter]);
  });

  it('getAdapterForAgent() returns adapter matching DB config', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { persona: 'pm', provider: 'openai', model: 'gpt-4o', enabled: true },
        ]),
      }),
    });

    await router.loadConfig('int');
    const { adapter, model } = router.getAdapterForAgent(AgentPersona.PM);

    expect(adapter.provider).toBe('openai');
    expect(model).toBe('gpt-4o');
  });

  it('getAdapterForAgent() falls back to claude if no config', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]), // 설정 없음
      }),
    });

    await router.loadConfig('int');
    const { adapter } = router.getAdapterForAgent(AgentPersona.QA);

    expect(adapter.provider).toBe('claude'); // fallback
  });

  it('getAdapterForAgent() throws if adapter not registered for provider', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { persona: 'pm', provider: 'gemini', model: 'gemini-2.0-flash', enabled: true },
        ]),
      }),
    });

    await router.loadConfig('int');
    // gemini adapter가 등록되지 않음 → fallback to claude
    const { adapter } = router.getAdapterForAgent(AgentPersona.PM);
    expect(adapter.provider).toBe('claude');
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/__tests__/provider-router.test.ts
```

Expected: FAIL.

**Step 3: AIProviderRouter 구현**

```ts
// packages/workflow-engine/src/clients/provider-router.ts

import { eq, or } from 'drizzle-orm';
import type { AgentPersona, ProviderAdapter, ProviderType } from '@rtb-ai-hub/shared';
import { agentModelConfig } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { db } from '../utils/database';

const logger = createLogger('provider-router');

type AgentAdapterResult = {
  adapter: ProviderAdapter;
  model: string;
};

export class AIProviderRouter {
  private adapterMap: Map<ProviderType, ProviderAdapter>;
  private configCache: Map<string, { provider: ProviderType; model: string }>;
  private loaded = false;

  constructor(adapters: ProviderAdapter[]) {
    this.adapterMap = new Map(adapters.map((a) => [a.provider, a]));
    this.configCache = new Map();
  }

  /** 토론 세션 시작 시 DB에서 전체 에이전트 설정 로드 (한 번만) */
  async loadConfig(env: string): Promise<void> {
    const rows = await db
      .select()
      .from(agentModelConfig)
      .where(or(eq(agentModelConfig.env, env), eq(agentModelConfig.env, 'all')));

    this.configCache.clear();

    // env-specific config가 'all' 보다 우선
    const byPersona = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      if (!row.enabled) continue;
      const existing = byPersona.get(row.persona);
      if (!existing || row.env === env) {
        byPersona.set(row.persona, row);
      }
    }

    for (const [persona, row] of byPersona) {
      this.configCache.set(persona, { provider: row.provider as ProviderType, model: row.model });
    }

    this.loaded = true;
    logger.info({ count: this.configCache.size, env }, 'Agent model config loaded');
  }

  /** 에이전트에 맞는 adapter + model 반환. 설정/adapter 없으면 Claude fallback */
  getAdapterForAgent(persona: AgentPersona): AgentAdapterResult {
    const fallbackAdapter = this.adapterMap.get('claude');
    if (!fallbackAdapter) throw new Error('ClaudeAdapter must always be registered as fallback');

    const config = this.configCache.get(persona);
    if (!config) {
      logger.warn({ persona }, 'No model config found — falling back to claude');
      return { adapter: fallbackAdapter, model: process.env.AI_MODEL_CLAUDE || 'claude-sonnet-4-20250514' };
    }

    const adapter = this.adapterMap.get(config.provider);
    if (!adapter) {
      logger.warn({ persona, provider: config.provider }, 'Adapter not registered — falling back to claude');
      return { adapter: fallbackAdapter, model: process.env.AI_MODEL_CLAUDE || 'claude-sonnet-4-20250514' };
    }

    return { adapter, model: config.model };
  }
}

export function createProviderRouter(adapters: ProviderAdapter[]): AIProviderRouter {
  return new AIProviderRouter(adapters);
}
```

**Step 4: 테스트 통과 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/clients/__tests__/provider-router.test.ts
```

Expected: PASS — 3 tests passed.

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/clients/provider-router.ts \
        packages/workflow-engine/src/clients/__tests__/provider-router.test.ts
git commit -m "feat(workflow-engine): add AIProviderRouter for per-agent model routing from DB"
```

---

## Task 7: TurnExecutor → Router로 전환

**Files:**
- Modify: `packages/workflow-engine/src/debate/turn-executor.ts`

**Step 1: 현재 `TurnExecutorOptions` 타입 확인**

`turn-executor.ts:18` — `aiClient: AnthropicClient` 필드 확인.

**Step 2: `TurnExecutorOptions` 수정**

```ts
// 변경 전
import { AnthropicClient } from '../clients/anthropic';

export type TurnExecutorOptions = {
  aiClient: AnthropicClient;
  maxTokens?: number;
  temperature?: number;
};

// 변경 후
import { AIProviderRouter } from '../clients/provider-router';

export type TurnExecutorOptions = {
  router: AIProviderRouter;
  temperature?: number;
};
```

**Step 3: `executeTurn` 함수 내부 호출 변경**

```ts
// 변경 전
const aiResponse = await options.aiClient.generateText(turnInstruction, {
  maxTokens: options.maxTokens ?? persona.maxTokensPerTurn,
  temperature: options.temperature ?? 0.7,
  systemPrompt,
  tier: persona.aiTier,
});

// 변경 후
const { adapter, model } = options.router.getAdapterForAgent(input.agent);
const aiResponse = await adapter.complete(turnInstruction, {
  systemPrompt,
  maxTokens: persona.maxTokensPerTurn,
  temperature: options.temperature ?? 0.7,
});
```

**Step 4: 비용 계산 변경 (turn 반환값에 model이 포함되므로 adapter에서 직접 계산)**

`DebateTurn`의 `model` 필드는 `aiResponse.model`로 유지 — 변경 없음.

**Step 5: 기존 `context-builder.test.ts` 등 관련 테스트 확인**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run src/claude-code/__tests__/context-builder.test.ts
```

Expected: 이 파일은 영향 없음 — PASS.

**Step 6: typecheck**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine tsc --noEmit
```

Expected: `AnthropicClient` 참조 오류 확인 → 다음 Task에서 해결.

**Step 7: Commit**

```bash
git add packages/workflow-engine/src/debate/turn-executor.ts
git commit -m "refactor(workflow-engine): turn-executor now uses AIProviderRouter instead of AnthropicClient"
```

---

## Task 8: DebateEngine → Router로 전환

**Files:**
- Modify: `packages/workflow-engine/src/debate/engine.ts`

**Step 1: `DebateEngineOptions` 타입 변경**

```ts
// 변경 전
import { AnthropicClient } from '../clients/anthropic';

export type DebateEngineOptions = {
  aiClient: AnthropicClient;
  store?: DebateStore;
  onTurnComplete?: (turn: DebateTurn, session: DebateSession) => void;
};

// 변경 후
import { AIProviderRouter } from '../clients/provider-router';

export type DebateEngineOptions = {
  router: AIProviderRouter;
  store?: DebateStore;
  onTurnComplete?: (turn: DebateTurn, session: DebateSession) => void;
};
```

**Step 2: 클래스 내부 `aiClient` → `router`로 변경**

```ts
// 변경 전
private aiClient: AnthropicClient;
constructor(options: DebateEngineOptions) {
  this.aiClient = options.aiClient;
  ...
}

// 변경 후
private router: AIProviderRouter;
constructor(options: DebateEngineOptions) {
  this.router = options.router;
  ...
}
```

**Step 3: `executeTurn` 호출 변경 (`engine.ts:327`)**

```ts
// 변경 전
const turn = await executeTurn(input, { aiClient: this.aiClient });

// 변경 후
const turn = await executeTurn(input, { router: this.router });
```

**Step 4: 비용 계산 변경**

`engine.ts` 내 `this.aiClient.calculateCost(...)` 호출 부분:

```ts
// 변경 전
const costUsd = this.aiClient.calculateCost(
  turn.tokensUsed.input,
  turn.tokensUsed.output,
  turn.model
);

// 변경 후
const { adapter } = this.router.getAdapterForAgent(input.agent);
const costUsd = adapter.calculateCost(
  turn.tokensUsed.input,
  turn.tokensUsed.output,
  turn.model
);
```

**Step 5: typecheck**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine tsc --noEmit
```

Expected: 오류가 있다면 `createDebateEngine` 호출부 수정 필요.

**Step 6: Commit**

```bash
git add packages/workflow-engine/src/debate/engine.ts
git commit -m "refactor(workflow-engine): DebateEngine now uses AIProviderRouter"
```

---

## Task 9: clients/index.ts 업데이트 + AnthropicClient 정리

**Files:**
- Modify: `packages/workflow-engine/src/clients/index.ts`
- Modify: `packages/workflow-engine/src/clients/anthropic.ts` (deprecated 처리)

**Step 1: `clients/index.ts` 업데이트**

```ts
// packages/workflow-engine/src/clients/index.ts

// Adapters
export { ClaudeAdapter } from './adapters/claude-adapter';
export { OpenAIAdapter } from './adapters/openai-adapter';
export { GeminiAdapter } from './adapters/gemini-adapter';

// Router
export { AIProviderRouter, createProviderRouter } from './provider-router';

// 기존 exports 유지 (다른 모듈에서 사용 중인 것들)
export { NativeMcpClient } from './native-mcp-client';
export { McpClient } from './mcp-client';
```

**Step 2: `anthropic.ts` 내 `anthropicClient` singleton 수정**

다른 곳에서 `anthropicClient` singleton을 사용 중인지 확인:

```bash
grep -r "anthropicClient\|AnthropicClient" packages/workflow-engine/src --include="*.ts" | grep -v "__tests__" | grep -v "adapters"
```

사용처가 있다면 `ClaudeAdapter`로 교체. 없다면 파일 제거.

**Step 3: 전체 테스트 실행**

```bash
pnpm --filter @rtb-ai-hub/workflow-engine vitest run
```

Expected: 기존 테스트 모두 PASS.

**Step 4: 전체 typecheck**

```bash
pnpm typecheck
```

Expected: 오류 없음.

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/clients/
git commit -m "refactor(workflow-engine): update clients/index.ts, finalize provider adapter migration"
```

---

## Task 10: DebateEngine 통합 — Router 초기화 코드 추가

실제 `DebateEngine`을 생성하는 곳(workflow 실행부)에서 Router를 초기화하고 `loadConfig()`를 호출해야 한다.

**Files:**
- Modify: `packages/workflow-engine/src/workflows/jira-auto-dev.ts` (또는 DebateEngine을 생성하는 위치)

**Step 1: jira-auto-dev.ts에서 DebateEngine 생성 위치 확인**

```bash
grep -n "createDebateEngine\|DebateEngine\|AnthropicClient" packages/workflow-engine/src/workflows/jira-auto-dev.ts
```

**Step 2: Router 초기화 패턴으로 변경**

```ts
import { ClaudeAdapter, OpenAIAdapter, GeminiAdapter, createProviderRouter } from '../clients';

// workflow 실행 함수 내부:
const router = createProviderRouter([
  new ClaudeAdapter(),
  new OpenAIAdapter(),
  new GeminiAdapter(),
]);
await router.loadConfig(env);

const engine = createDebateEngine({ router, store });
```

**Step 3: 전체 테스트**

```bash
pnpm test
```

Expected: All PASS.

**Step 4: 빌드 확인**

```bash
pnpm build
```

Expected: 빌드 성공.

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/workflows/jira-auto-dev.ts
git commit -m "feat(workflow-engine): wire AIProviderRouter into jira-auto-dev workflow"
```

---

## 완료 체크리스트

- [ ] `ProviderAdapter` 인터페이스가 `@rtb-ai-hub/shared`에서 export됨
- [ ] `agent_model_config` 테이블이 DB에 존재하고 seed 데이터가 삽입됨
- [ ] `ClaudeAdapter`, `OpenAIAdapter`, `GeminiAdapter` 각각 단위 테스트 PASS
- [ ] `AIProviderRouter` 단위 테스트 PASS (DB mock 포함)
- [ ] `pnpm typecheck` 오류 없음
- [ ] `pnpm test` 기존 테스트 모두 PASS
- [ ] DB에서 에이전트 설정 변경 시 다음 토론 세션에 즉시 반영됨
