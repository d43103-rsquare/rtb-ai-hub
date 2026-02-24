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
