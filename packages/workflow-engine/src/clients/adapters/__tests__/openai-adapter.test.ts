import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mockCreate } } };
  }),
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
