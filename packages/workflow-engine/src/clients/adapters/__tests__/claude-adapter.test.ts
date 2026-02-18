import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } };
  }),
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
