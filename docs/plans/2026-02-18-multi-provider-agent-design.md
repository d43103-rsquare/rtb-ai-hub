# Multi-Provider Agent Architecture Design

**Date**: 2026-02-18
**Status**: Approved
**Scope**: `packages/workflow-engine`, `packages/shared`

---

## Background

현재 rtb-ai-hub의 7개 역할별 에이전트(PM, System Planner, UX Designer, UI Developer, Backend Developer, QA, DevOps)는 Anthropic Messages API를 system prompt만 바꿔 단일 호출하는 방식으로 동작한다. 모든 에이전트가 Claude 모델에만 종속되어 있으며, 비용 최적화나 모델별 특성 활용이 불가능한 상태다.

---

## Goals

- Claude 외 OpenAI(GPT-4o), Google Gemini를 에이전트별로 독립 사용 가능하게 한다
- 에이전트별 프로바이더/모델 설정을 DB에 저장하고 런타임에 변경 가능하게 한다
- 기존 토론 엔진(debate engine) 로직은 변경 없이 재사용한다
- 새로운 프로바이더 추가 시 기존 코드를 수정하지 않아도 된다

---

## Architecture: Provider Adapter Pattern

### 핵심 원칙

외부 서비스(LiteLLM 등) 없이 자체 구현. 각 프로바이더를 독립 Adapter로 격리해 provider별 quirk(tool use 포맷, 토큰 계산, 스트리밍)를 캡슐화한다.

### 레이어 구조

```
[Debate Engine / Turn Executor]
           ↓
    [AIProviderRouter]          ← DB에서 에이전트별 설정 로드
    ↓          ↓          ↓
[ClaudeAdapter] [OpenAIAdapter] [GeminiAdapter]
    ↓          ↓          ↓
  Anthropic   OpenAI      Google
  Messages    Chat        Gemini
  API         Completions GenerativeAI
           ↓
      [AIResponse]              ← 공통 응답 타입 (기존 유지)
```

---

## Data Model

### DB 테이블: `agent_model_config`

```sql
CREATE TABLE agent_model_config (
  id          VARCHAR PRIMARY KEY,
  persona     VARCHAR NOT NULL,          -- AgentPersona enum 값
  provider    VARCHAR NOT NULL,          -- 'claude' | 'openai' | 'gemini'
  model       VARCHAR NOT NULL,          -- 실제 모델 ID
  env         VARCHAR NOT NULL DEFAULT 'all',  -- 환경별 오버라이드
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 기본 설정 (seed data)

| persona | provider | model | 비고 |
|---|---|---|---|
| pm | claude | claude-sonnet-4-20250514 | 전략적 판단 → Claude 강점 |
| system-planner | claude | claude-sonnet-4-20250514 | 아키텍처 설계 → Claude 강점 |
| ux-designer | openai | gpt-4o | 창의적 설계 → GPT-4o 강점 |
| ui-developer | openai | gpt-4o | 코드 생성 → GPT-4o 강점 |
| backend-developer | claude | claude-sonnet-4-20250514 | 데이터 무결성 → Claude 강점 |
| qa | gemini | gemini-2.0-flash | 빠른 분석 → Gemini Flash 비용효율 |
| devops | gemini | gemini-2.0-flash | 인프라 체크 → Gemini Flash 비용효율 |

---

## Interface Definitions

### `ProviderAdapter` (packages/shared/src/types.ts)

```ts
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

기존 `AIClient` 인터페이스는 `ProviderAdapter`로 대체된다.

---

## File Structure

```
packages/workflow-engine/src/clients/
  ├── adapters/
  │   ├── claude-adapter.ts    ← AnthropicClient 로직 이동 + ProviderAdapter 구현
  │   ├── openai-adapter.ts    ← 신규: openai npm 패키지 사용
  │   └── gemini-adapter.ts    ← 신규: @google/generative-ai 패키지 사용
  ├── provider-router.ts       ← 신규: DB 로드 + 라우팅
  ├── anthropic.ts             ← 제거 (claude-adapter.ts로 통합)
  └── index.ts                 ← export 업데이트
```

---

## AIProviderRouter

```ts
// packages/workflow-engine/src/clients/provider-router.ts

export class AIProviderRouter {
  private adapters: Map<ProviderType, ProviderAdapter>;
  private configCache: Map<string, { provider: ProviderType; model: string }>;

  constructor(adapters: ProviderAdapter[]) {
    this.adapters = new Map(adapters.map(a => [a.provider, a]));
    this.configCache = new Map();
  }

  // 토론 세션 시작 시 DB에서 전체 에이전트 설정 로드 (한 번만)
  async loadConfig(db: Database, env: Environment): Promise<void>

  // Turn executor에서 호출 — 에이전트에 맞는 adapter + model 반환
  getAdapterForAgent(persona: AgentPersona): { adapter: ProviderAdapter; model: string }

  // 설정 없을 시 Claude fallback
}
```

---

## Turn Executor 변경

### 현재

```ts
const aiResponse = await options.aiClient.generateText(turnInstruction, {
  systemPrompt,
  tier: persona.aiTier,   // tier로 모델 선택
});
```

### 변경 후

```ts
const { adapter, model } = options.router.getAdapterForAgent(input.agent);
const aiResponse = await adapter.complete(turnInstruction, {
  systemPrompt,
  maxTokens: persona.maxTokensPerTurn,
  temperature: 0.7,
});
// model은 AIResponse에 포함되어 반환
```

---

## PersonaDefinition 변경

`aiTier` 필드는 DB 설정이 없을 때의 fallback 힌트로만 유지한다. 실제 모델 선택은 DB 우선이다.

```ts
export type PersonaDefinition = {
  // 기존 필드 유지...
  aiTier: AITier;          // fallback용 (DB config 없을 때)
  preferredProvider?: ProviderType;  // 추가: persona 정의 시 권장 provider
  maxTokensPerTurn: number;
};
```

---

## Dependencies 추가

```json
// packages/workflow-engine/package.json
"openai": "^4.x",
"@google/generative-ai": "^0.x"
```

---

## Cost Tracking

각 Adapter가 자체 `calculateCost()` 구현:

- **ClaudeAdapter**: 기존 로직 그대로
- **OpenAIAdapter**: GPT-4o 입력 $2.5/MTok, 출력 $10/MTok
- **GeminiAdapter**: Gemini 2.0 Flash 입력 $0.075/MTok, 출력 $0.30/MTok

`DebateSession.totalCostUsd` 집계는 변경 없음.

---

## Error Handling & Fallback

1. DB에 에이전트 설정 없음 → `aiTier` 기반 Claude fallback
2. 특정 Provider API 오류 → Claude로 retry 1회 후 실패 처리
3. 모든 설정 로드 실패 → 전체 Claude로 동작 (기존 동작 보장)

---

## Migration Strategy

1. DB 마이그레이션으로 `agent_model_config` 테이블 생성
2. seed data로 전체 에이전트 Claude 기본 설정 삽입
3. `ClaudeAdapter`로 기존 동작 100% 유지 확인
4. 에이전트별 OpenAI/Gemini 설정을 DB에서 순차 전환

---

## Testing

- 각 Adapter 단위 테스트 (mock API response)
- `AIProviderRouter` 단위 테스트 (DB mock)
- 기존 `debate-engine` 통합 테스트는 `ClaudeAdapter` mock으로 그대로 사용
