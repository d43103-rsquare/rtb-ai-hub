/**
 * AI Consensus Analyzer — Uses lightweight AI to analyze debate consensus
 *
 * Analyzes debate turns with a haiku-class model to detect nuanced
 * agreement/disagreement that keyword matching misses.
 * Cost: ~$0.02 per analysis (haiku model).
 */

import type { AgentPersona, DebateTurn } from '@rtb-ai-hub/shared';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import type { AgentStance } from './consensus-detector';

const logger = createLogger('ai-consensus-analyzer');

export type AiConsensusInput = {
  turns: DebateTurn[];
  participants: AgentPersona[];
  topic: string;
};

export type AiConsensusResult = {
  stances: Record<string, AgentStance>;
  consensusRate: number;
  reasoning: string;
};

const ANALYSIS_PROMPT = `You are analyzing a multi-agent debate for consensus.

Given the debate turns below, determine each participant's stance toward the proposed solution.

For each participant, classify their stance as one of:
- "agree": Clearly supports the proposal
- "partial": Supports with reservations or conditions
- "disagree": Opposes or has significant concerns
- "neutral": Has not expressed a clear position

Respond ONLY with JSON:
{
  "stances": { "<agent-id>": "<stance>", ... },
  "consensusRate": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}`;

/**
 * Analyze debate consensus using a lightweight AI model.
 * Returns null on failure (caller should fall back to keyword analysis).
 */
export async function analyzeConsensusWithAi(
  adapter: ProviderAdapter,
  input: AiConsensusInput
): Promise<AiConsensusResult | null> {
  try {
    // Build context from recent turns (limit to last 2 per participant for cost)
    const recentTurns: string[] = [];
    for (const agent of input.participants) {
      const agentTurns = input.turns.filter((t) => t.agent === agent);
      const latest = agentTurns.slice(-2);
      for (const turn of latest) {
        recentTurns.push(`[${turn.agent}] (Turn ${turn.turnNumber}):\n${turn.content.slice(0, 500)}`);
      }
    }

    const userMessage = [
      `Topic: ${input.topic.slice(0, 200)}`,
      `Participants: ${input.participants.join(', ')}`,
      ``,
      `Recent turns:`,
      recentTurns.join('\n\n'),
    ].join('\n');

    const response = await adapter.complete(userMessage, {
      systemPrompt: ANALYSIS_PROMPT,
      maxTokens: 500,
      temperature: 0.1,
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('AI consensus analysis returned no JSON');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate stances
    const validStances: AgentStance[] = ['agree', 'partial', 'disagree', 'neutral'];
    const stances: Record<string, AgentStance> = {};
    for (const agent of input.participants) {
      const stance = parsed.stances?.[agent];
      stances[agent] = validStances.includes(stance) ? stance : 'neutral';
    }

    return {
      stances,
      consensusRate: typeof parsed.consensusRate === 'number'
        ? Math.max(0, Math.min(1, parsed.consensusRate))
        : 0,
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'AI consensus analysis failed — will use keyword fallback'
    );
    return null;
  }
}
