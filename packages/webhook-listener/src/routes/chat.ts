import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import type Redis from 'ioredis';
import { createLogger } from '@rtb-ai-hub/shared';
import { chatTools, handleToolCall } from '../utils/chat-tools';
import { optionalAuth, type AuthRequest } from '../middleware/auth';

const logger = createLogger('chat-api');

export function createChatRouter(redis: Redis) {
  const router = Router();

  router.post('/api/chat', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'messages array required' });
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
        return;
      }

      const anthropic = new Anthropic({ apiKey });

      const systemPrompt = `You are the RTB AI Hub assistant. You help developers manage their Jira issues, AI workflows, and preview environments.

Available capabilities:
- Check workflow execution status
- Manage preview environments (list, get details)
- Query system information and feature flags

Always be concise and helpful. Format responses in markdown when appropriate.`;

      const currentMessages: Anthropic.Messages.MessageParam[] = messages.map(
        (m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })
      );

      const maxIterations = 10;
      let iteration = 0;
      let finalResponse = '';

      while (iteration < maxIterations) {
        iteration++;

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: currentMessages,
          tools: chatTools as Anthropic.Messages.Tool[],
        });

        const textBlocks: Anthropic.Messages.TextBlock[] = [];
        const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            textBlocks.push(block);
          } else if (block.type === 'tool_use') {
            toolUseBlocks.push(block);
          }
        }

        if (toolUseBlocks.length === 0) {
          finalResponse = textBlocks.map((b) => b.text).join('');
          break;
        }

        currentMessages.push({
          role: 'assistant',
          content: response.content,
        });

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          const result = await handleToolCall(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            redis
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        currentMessages.push({
          role: 'user',
          content: toolResults,
        });

        if (response.stop_reason === 'end_turn') {
          finalResponse = textBlocks.map((b) => b.text).join('');
          break;
        }
      }

      res.json({
        role: 'assistant',
        content: finalResponse,
      });
    } catch (error) {
      logger.error({ error }, 'Chat API error');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Chat request failed',
      });
    }
  });

  return router;
}
