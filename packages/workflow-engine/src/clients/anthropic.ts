import Anthropic from '@anthropic-ai/sdk';
import { requireEnv, createLogger, AIResponse, AITier } from '@rtb-ai-hub/shared';

const logger = createLogger('anthropic-client');

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || requireEnv('ANTHROPIC_API_KEY'),
    });
  }

  async generateText(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
      tier?: AITier;
    } = {}
  ): Promise<AIResponse> {
    const {
      maxTokens = 2000,
      temperature = 0.7,
      systemPrompt = 'You are a helpful AI assistant.',
      tier = AITier.MEDIUM,
    } = options;

    const model = this.getModelForTier(tier);

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected content type from Anthropic');
      }

      return {
        text: content.text,
        model: response.model,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        finishReason: response.stop_reason || 'unknown',
      };
    } catch (error) {
      logger.error({ error }, 'Anthropic API call failed');
      throw error;
    }
  }

  private getModelForTier(tier: AITier): string {
    switch (tier) {
      case AITier.HEAVY:
        return process.env.AI_MODEL_HEAVY || 'claude-sonnet-4-20250514';
      case AITier.MEDIUM:
        return process.env.AI_MODEL_MEDIUM || 'claude-sonnet-4-20250514';
      case AITier.LIGHT:
        return process.env.AI_MODEL_LIGHT || 'claude-sonnet-4-5-20250514';
      default:
        return process.env.AI_MODEL_MEDIUM || 'claude-sonnet-4-20250514';
    }
  }

  calculateCost(tokensInput: number, tokensOutput: number, model: string): number {
    const costs: Record<string, { input: number; output: number }> = {
      // Latest models (2026)
      'claude-sonnet-4-5-20250514': { input: 2.0, output: 10.0 },
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      'claude-3-7-sonnet-20250219': { input: 3.0, output: 15.0 },
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
      // Legacy models (backward compatibility)
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
      'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    };

    const modelCost = costs[model] || costs['claude-sonnet-4-5-20250514'];
    return (tokensInput * modelCost.input + tokensOutput * modelCost.output) / 1_000_000;
  }
}

export const anthropicClient = new AnthropicClient();
