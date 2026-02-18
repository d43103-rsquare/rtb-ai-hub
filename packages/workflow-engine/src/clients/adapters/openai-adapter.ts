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
