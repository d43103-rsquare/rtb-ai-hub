import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return { getGenerativeModel: mockGetGenerativeModel };
  }),
}));

describe('GeminiAdapter', () => {
  let adapter: import('../gemini-adapter').GeminiAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    // mockGetGenerativeModel을 clearAllMocks 이후 재설정
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
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
