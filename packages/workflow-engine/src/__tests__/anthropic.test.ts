import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AITier } from '@rtb-ai-hub/shared';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

vi.mock('@rtb-ai-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rtb-ai-hub/shared')>();
  return {
    ...actual,
    requireEnv: vi.fn().mockReturnValue('test-api-key'),
    createLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

describe('AnthropicClient', () => {
  let AnthropicClient: typeof import('../clients/anthropic').AnthropicClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../clients/anthropic');
    AnthropicClient = mod.AnthropicClient;
  });

  describe('calculateCost', () => {
    it('calculates cost for claude-3-opus', () => {
      const client = new AnthropicClient('test-key');
      const cost = client.calculateCost(1000, 500, 'claude-3-opus-20240229');
      const expected = (1000 * 15.0 + 500 * 75.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected);
    });

    it('calculates cost for claude-3.5-sonnet', () => {
      const client = new AnthropicClient('test-key');
      const cost = client.calculateCost(1000, 500, 'claude-3-5-sonnet-20240620');
      const expected = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected);
    });

    it('calculates cost for claude-3-haiku', () => {
      const client = new AnthropicClient('test-key');
      const cost = client.calculateCost(1000, 500, 'claude-3-haiku-20240307');
      const expected = (1000 * 0.25 + 500 * 1.25) / 1_000_000;
      expect(cost).toBeCloseTo(expected);
    });

    it('falls back to sonnet pricing for unknown model', () => {
      const client = new AnthropicClient('test-key');
      const cost = client.calculateCost(1000, 500, 'unknown-model');
      const expectedSonnet = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expectedSonnet);
    });

    it('returns 0 for zero tokens', () => {
      const client = new AnthropicClient('test-key');
      const cost = client.calculateCost(0, 0, 'claude-3-opus-20240229');
      expect(cost).toBe(0);
    });

    it('handles large token counts', () => {
      const client = new AnthropicClient('test-key');
      const cost = client.calculateCost(1_000_000, 1_000_000, 'claude-3-opus-20240229');
      const expected = (1_000_000 * 15.0 + 1_000_000 * 75.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected);
    });
  });

  describe('getModelForTier', () => {
    it('returns sonnet-4 for HEAVY tier', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      });

      const client = new AnthropicClient('test-key');
      await client.generateText('test', { tier: AITier.HEAVY });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-20250514' })
      );
    });

    it('returns sonnet-4 for MEDIUM tier', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      });

      const client = new AnthropicClient('test-key');
      await client.generateText('test', { tier: AITier.MEDIUM });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-20250514' })
      );
    });

    it('returns sonnet-4.5 for LIGHT tier', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        model: 'claude-sonnet-4-5-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      });

      const client = new AnthropicClient('test-key');
      await client.generateText('test', { tier: AITier.LIGHT });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-5-20250514' })
      );
    });
  });

  describe('generateText', () => {
    it('returns AIResponse with correct structure', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello world' }],
        model: 'claude-3-5-sonnet-20240620',
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const client = new AnthropicClient('test-key');
      const result = await client.generateText('Say hello');

      expect(result).toEqual({
        text: 'Hello world',
        model: 'claude-3-5-sonnet-20240620',
        tokensUsed: { input: 100, output: 50 },
        finishReason: 'end_turn',
      });
    });

    it('throws when API call fails', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      const client = new AnthropicClient('test-key');
      await expect(client.generateText('test')).rejects.toThrow('API error');
    });

    it('passes custom options to API', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        model: 'claude-3-5-sonnet-20240620',
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
      });

      const client = new AnthropicClient('test-key');
      await client.generateText('test', {
        maxTokens: 500,
        temperature: 0.3,
        systemPrompt: 'You are a code reviewer.',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 500,
          temperature: 0.3,
          system: 'You are a code reviewer.',
        })
      );
    });
  });
});
