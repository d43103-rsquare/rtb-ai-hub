import OpenAI from 'openai';
import { requireEnv, createLogger, AIResponse } from '@rtb-ai-hub/shared';

const logger = createLogger('openai-client');

export class OpenAIClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: requireEnv('OPENAI_API_KEY'),
    });
  }

  async generateText(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
      model?: string;
    } = {}
  ): Promise<AIResponse> {
    const {
      maxTokens = 2000,
      temperature = 0.7,
      systemPrompt = 'You are a helpful AI assistant.',
      model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    } = options;

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      const choice = response.choices[0];
      if (!choice.message.content) {
        throw new Error('No content in OpenAI response');
      }

      return {
        text: choice.message.content,
        model: response.model,
        tokensUsed: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
        },
        finishReason: choice.finish_reason,
      };
    } catch (error) {
      logger.error({ error }, 'OpenAI API call failed');
      throw error;
    }
  }

  calculateCost(tokensInput: number, tokensOutput: number, model: string): number {
    const costs: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 30.0, output: 60.0 },
      'gpt-4-turbo-preview': { input: 10.0, output: 30.0 },
    };

    const modelCost = costs[model] || costs['gpt-4-turbo-preview'];
    return (tokensInput * modelCost.input + tokensOutput * modelCost.output) / 1_000_000;
  }
}

export const openaiClient = new OpenAIClient();
