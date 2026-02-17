import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionGuard } from '../execution-guard';
import { AgentPersona } from '@rtb-ai-hub/shared';

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<typeof import('@rtb-ai-hub/shared')>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

describe('ExecutionGuard', () => {
  let guard: ExecutionGuard;

  beforeEach(() => {
    guard = new ExecutionGuard('test-session', {
      maxTotalCostUsd: 5,
      maxDebateTurns: 12,
      maxClaudeCodeRetries: 3,
      maxTokensPerTurn: 8192,
      claudeCodeTimeoutMs: 600000,
      debateTimeoutMs: 1800000,
    });
  });

  describe('checkToolAccess', () => {
    it('allows PM to use jira tools', () => {
      const result = guard.checkToolAccess(AgentPersona.PM, 'jira_get_issue');
      expect(result).toBeNull();
    });

    it('denies PM from using github tools', () => {
      const result = guard.checkToolAccess(AgentPersona.PM, 'github_push_files');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('tool_denied');
    });

    it('allows Backend Developer to use github tools', () => {
      const result = guard.checkToolAccess(AgentPersona.BACKEND_DEVELOPER, 'github_get_file_contents');
      expect(result).toBeNull();
    });

    it('allows QA to use github_search_code', () => {
      const result = guard.checkToolAccess(AgentPersona.QA, 'github_search_code');
      expect(result).toBeNull();
    });

    it('denies QA from using figma tools', () => {
      const result = guard.checkToolAccess(AgentPersona.QA, 'figma_get_file');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('tool_denied');
    });

    it('allows DevOps to use datadog tools', () => {
      const result = guard.checkToolAccess(AgentPersona.DEVOPS, 'datadog_get_metrics');
      expect(result).toBeNull();
    });
  });

  describe('recordTurn', () => {
    it('accumulates cost and tokens', () => {
      guard.recordTurn({ input: 100, output: 200 }, 0.01);
      guard.recordTurn({ input: 150, output: 300 }, 0.02);

      const state = guard.getState();
      expect(state.tokensUsed.input).toBe(250);
      expect(state.tokensUsed.output).toBe(500);
      expect(state.costAccumulated).toBeCloseTo(0.03);
      expect(state.turnsElapsed).toBe(2);
    });

    it('returns violation when cost budget exceeded', () => {
      const result = guard.recordTurn({ input: 1000, output: 2000 }, 6);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('budget_exceeded');
    });

    it('returns violation when turn limit reached', () => {
      let result: ReturnType<typeof guard.recordTurn> = null;
      for (let i = 0; i < 12; i++) {
        result = guard.recordTurn({ input: 10, output: 20 }, 0.001);
      }
      expect(result).not.toBeNull();
      expect(result!.type).toBe('turn_limit');
    });

    it('returns null when within budget', () => {
      const result = guard.recordTurn({ input: 100, output: 200 }, 0.01);
      expect(result).toBeNull();
    });
  });

  describe('checkTurnTokens', () => {
    it('returns null when within limit', () => {
      const result = guard.checkTurnTokens({ input: 2000, output: 3000 });
      expect(result).toBeNull();
    });

    it('returns violation when token limit exceeded', () => {
      const result = guard.checkTurnTokens({ input: 5000, output: 5000 });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('budget_exceeded');
    });
  });

  describe('recordRetry', () => {
    it('returns null within limit', () => {
      expect(guard.recordRetry()).toBeNull();
      expect(guard.recordRetry()).toBeNull();
      expect(guard.recordRetry()).toBeNull();
    });

    it('returns violation when retry limit exceeded', () => {
      guard.recordRetry();
      guard.recordRetry();
      guard.recordRetry();
      const result = guard.recordRetry();
      expect(result).not.toBeNull();
      expect(result!.type).toBe('retry_limit');
    });
  });

  describe('checkDebateTimeout', () => {
    it('returns null within timeout', () => {
      const result = guard.checkDebateTimeout();
      expect(result).toBeNull();
    });

    it('returns violation when timeout reached', () => {
      // Create a guard that started 2 hours ago
      const oldGuard = new ExecutionGuard('old-session', {
        debateTimeoutMs: 100, // 100ms timeout
      });
      // Wait a bit
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const result = oldGuard.checkDebateTimeout();
          expect(result).not.toBeNull();
          expect(result!.type).toBe('timeout');
          resolve();
        }, 150);
      });
    });
  });

  describe('getRemainingBudget', () => {
    it('calculates remaining budget correctly', () => {
      guard.recordTurn({ input: 100, output: 200 }, 1);
      guard.recordRetry();

      const remaining = guard.getRemainingBudget();
      expect(remaining.costRemaining).toBe(4);
      expect(remaining.turnsRemaining).toBe(11);
      expect(remaining.retriesRemaining).toBe(2);
      expect(remaining.costUsedPercent).toBe(20);
    });
  });

  describe('getAllowedTools', () => {
    it('returns allowed tools for PM', () => {
      const tools = guard.getAllowedTools(AgentPersona.PM);
      expect(tools).toContain('jira_get_issue');
      expect(tools).not.toContain('github_push_files');
    });

    it('returns empty array for unknown agent', () => {
      const tools = guard.getAllowedTools('unknown-agent' as AgentPersona);
      expect(tools).toEqual([]);
    });
  });

  describe('custom budget overrides', () => {
    it('applies budget overrides', () => {
      const customGuard = new ExecutionGuard('custom-session', {
        maxTotalCostUsd: 10,
        maxDebateTurns: 20,
      });

      const state = customGuard.getState();
      expect(state.budget.maxTotalCostUsd).toBe(10);
      expect(state.budget.maxDebateTurns).toBe(20);
    });
  });
});
