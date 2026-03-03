/**
 * Short-term Memory — Sliding window + AI summarization for debate history
 *
 * Keeps recent N turns in full text and summarizes older turns,
 * reducing token usage in long debates while preserving key context.
 *
 * Configuration:
 * - RECENT_TURNS_FULL: Number of recent turns to keep in full (default: 4)
 * - MAX_TOKENS_BUDGET: Token budget for compressed history (default: 12000)
 */

import type { DebateTurn } from '@rtb-ai-hub/shared';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('short-term-memory');

const RECENT_TURNS_FULL = 4;
const MAX_TOKENS_BUDGET = 12_000;

// Rough token estimation: ~4 chars per token
const CHARS_PER_TOKEN = 4;

export type CompressedHistory = {
  /** AI-generated summary of older turns */
  summary: string | null;
  /** Full text of recent turns */
  recentTurns: DebateTurn[];
  /** Number of turns summarized */
  summarizedCount: number;
};

/** Cache for turn summaries (avoids re-summarizing on every turn) */
const summaryCache = new Map<string, string>();

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function buildCacheKey(turns: DebateTurn[]): string {
  return turns.map((t) => `${t.turnNumber}:${t.agent}`).join(',');
}

/**
 * Compress debate history using a sliding window approach.
 *
 * - Recent RECENT_TURNS_FULL turns: kept in full
 * - Older turns: summarized by AI (cached to avoid re-summarization)
 *
 * If no adapter is provided, returns all turns without compression.
 */
export async function compressHistory(
  turns: DebateTurn[],
  adapter: ProviderAdapter | null
): Promise<CompressedHistory> {
  // Not enough turns to need compression
  if (turns.length <= RECENT_TURNS_FULL) {
    return {
      summary: null,
      recentTurns: turns,
      summarizedCount: 0,
    };
  }

  const recentTurns = turns.slice(-RECENT_TURNS_FULL);
  const olderTurns = turns.slice(0, -RECENT_TURNS_FULL);

  // Check if compression is needed based on token estimate
  const totalTokens = estimateTokens(
    turns.map((t) => t.content).join('\n')
  );

  if (totalTokens <= MAX_TOKENS_BUDGET) {
    return {
      summary: null,
      recentTurns: turns,
      summarizedCount: 0,
    };
  }

  // No adapter = can't summarize, fall back to truncation
  if (!adapter) {
    const truncated = olderTurns.map((t) => ({
      ...t,
      content: t.content.slice(0, 200) + '...',
    }));
    return {
      summary: null,
      recentTurns: [...truncated, ...recentTurns],
      summarizedCount: 0,
    };
  }

  // Check summary cache
  const cacheKey = buildCacheKey(olderTurns);
  let summary = summaryCache.get(cacheKey);

  if (!summary) {
    try {
      summary = await summarizeTurns(olderTurns, adapter);
      summaryCache.set(cacheKey, summary);
      logger.info(
        { summarizedTurns: olderTurns.length, summaryLength: summary.length },
        'Debate history summarized'
      );
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to summarize debate history — using truncation'
      );
      summary = olderTurns
        .map((t) => `[${t.agent}] ${t.content.slice(0, 150)}`)
        .join('\n');
    }
  }

  return {
    summary,
    recentTurns,
    summarizedCount: olderTurns.length,
  };
}

async function summarizeTurns(
  turns: DebateTurn[],
  adapter: ProviderAdapter
): Promise<string> {
  const turnsText = turns
    .map((t) => `[Turn ${t.turnNumber} — ${t.agent}] (${t.type}):\n${t.content.slice(0, 800)}`)
    .join('\n\n');

  const response = await adapter.complete(turnsText, {
    systemPrompt: `You are summarizing earlier rounds of a multi-agent design debate.
Preserve: key positions of each agent, points of agreement, unresolved disagreements, any artifacts or decisions made.
Output a concise summary (max 500 words) in the same language as the input.`,
    maxTokens: 800,
    temperature: 0.1,
  });

  return response.text;
}

/**
 * Format compressed history for use in debate instructions.
 */
export function formatCompressedHistory(compressed: CompressedHistory): string {
  const parts: string[] = [];

  if (compressed.summary) {
    parts.push(`### 이전 토론 요약 (Turn 1-${compressed.summarizedCount})\n${compressed.summary}`);
  }

  if (compressed.recentTurns.length > 0) {
    const recentFormatted = compressed.recentTurns
      .map((t) => {
        const artifacts = t.artifacts.length > 0
          ? `\n📎 Artifacts: ${t.artifacts.map((a) => a.title).join(', ')}`
          : '';
        return `### [Turn ${t.turnNumber}] ${t.agent} (${t.type})\n${t.content}${artifacts}`;
      })
      .join('\n\n');

    parts.push(recentFormatted);
  }

  return parts.join('\n\n---\n\n');
}
