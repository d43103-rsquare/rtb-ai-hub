import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPersona } from '@rtb-ai-hub/shared';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';

const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();

vi.mock('../../utils/database', () => ({
  db: {
    select: mockSelect,
  },
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
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    const { AIProviderRouter } = await import('../provider-router');
    router = new AIProviderRouter([mockClaudeAdapter, mockOpenAIAdapter]);
  });

  it('getAdapterForAgent() returns adapter matching DB config', async () => {
    mockWhere.mockResolvedValue([
      { persona: 'pm', provider: 'openai', model: 'gpt-4o', enabled: true, env: 'int' },
    ]);

    await router.loadConfig('int');
    const { adapter, model } = router.getAdapterForAgent(AgentPersona.PM);

    expect(adapter.provider).toBe('openai');
    expect(model).toBe('gpt-4o');
  });

  it('getAdapterForAgent() falls back to claude if no config', async () => {
    mockWhere.mockResolvedValue([]); // 설정 없음

    await router.loadConfig('int');
    const { adapter } = router.getAdapterForAgent(AgentPersona.QA);

    expect(adapter.provider).toBe('claude'); // fallback
  });

  it('getAdapterForAgent() falls back to claude if adapter not registered for provider', async () => {
    mockWhere.mockResolvedValue([
      { persona: 'pm', provider: 'gemini', model: 'gemini-2.0-flash', enabled: true, env: 'int' },
    ]);

    await router.loadConfig('int');
    // gemini adapter가 등록되지 않음 → fallback to claude
    const { adapter } = router.getAdapterForAgent(AgentPersona.PM);
    expect(adapter.provider).toBe('claude');
  });
});
