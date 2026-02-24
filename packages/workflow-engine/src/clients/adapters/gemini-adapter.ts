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
      'gemini-2.0-flash':      { input: 0.075,  output: 0.30  },
      'gemini-2.0-flash-lite': { input: 0.0375, output: 0.15  },
      'gemini-1.5-pro':        { input: 1.25,   output: 5.0   },
      'gemini-1.5-flash':      { input: 0.075,  output: 0.30  },
    };
    const rate = costs[model] ?? costs['gemini-2.0-flash'];
    return (tokensInput * rate.input + tokensOutput * rate.output) / 1_000_000;
  }
}
