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
    const byPersona = new Map<string, (typeof rows)[0]>();
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

    logger.info({ count: this.configCache.size, env }, 'Agent model config loaded');
  }

  /** 에이전트에 맞는 adapter + model 반환. 설정/adapter 없으면 Claude fallback */
  getAdapterForAgent(persona: AgentPersona): AgentAdapterResult {
    const fallbackAdapter = this.adapterMap.get('claude');
    if (!fallbackAdapter) throw new Error('ClaudeAdapter must always be registered as fallback');

    const config = this.configCache.get(persona);
    if (!config) {
      logger.warn({ persona }, 'No model config found — falling back to claude');
      return {
        adapter: fallbackAdapter,
        model: process.env.AI_MODEL_CLAUDE || 'claude-sonnet-4-20250514',
      };
    }

    const adapter = this.adapterMap.get(config.provider);
    if (!adapter) {
      logger.warn({ persona, provider: config.provider }, 'Adapter not registered — falling back to claude');
      return {
        adapter: fallbackAdapter,
        model: process.env.AI_MODEL_CLAUDE || 'claude-sonnet-4-20250514',
      };
    }

    return { adapter, model: config.model };
  }
}

export function createProviderRouter(adapters: ProviderAdapter[]): AIProviderRouter {
  return new AIProviderRouter(adapters);
}
