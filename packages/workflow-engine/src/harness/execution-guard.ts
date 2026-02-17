/**
 * Execution Guard — 에이전트 실행 경계를 코드로 강제
 *
 * - 에이전트별 Tool Allowlist
 * - 토큰/비용 예산 관리
 * - 재시도 상한
 * - 타임아웃 관리
 */

import type {
  AgentPersona,
  ExecutionBudget,
  ToolAllowlist,
} from '@rtb-ai-hub/shared';
import { AgentPersona as AP } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('execution-guard');

// ─── Default Budget ────────────────────────────────────────────────────────────

const DEFAULT_BUDGET: ExecutionBudget = {
  maxTokensPerTurn: 8192,
  maxTotalCostUsd: parseFloat(process.env.DEBATE_COST_LIMIT_USD || '5'),
  maxDebateTurns: parseInt(process.env.DEBATE_MAX_TURNS || '12', 10),
  maxClaudeCodeRetries: parseInt(process.env.CLAUDE_CODE_MAX_RETRIES || '3', 10),
  claudeCodeTimeoutMs: parseInt(process.env.CLAUDE_CODE_TIMEOUT_MS || '600000', 10),
  debateTimeoutMs: parseInt(process.env.DEBATE_TIMEOUT_MS || '1800000', 10),
};

// ─── Default Tool Allowlist ────────────────────────────────────────────────────

const DEFAULT_TOOL_ALLOWLIST: ToolAllowlist = {
  [AP.PM]: [
    'jira_get_issue',
    'jira_search_issues',
    'jira_update_issue',
    'jira_add_comment',
    'jira_create_subtask',
  ],
  [AP.SYSTEM_PLANNER]: [
    'jira_get_issue',
    'github_search_code',
    'github_get_file_contents',
    'github_list_files',
  ],
  [AP.UX_DESIGNER]: [
    'figma_get_file',
    'figma_get_node',
    'figma_get_comments',
    'jira_get_issue',
  ],
  [AP.UI_DEVELOPER]: [
    'figma_get_file',
    'figma_get_node',
    'github_get_file_contents',
    'github_search_code',
    'github_list_files',
  ],
  [AP.BACKEND_DEVELOPER]: [
    'github_get_file_contents',
    'github_search_code',
    'github_list_files',
    'jira_get_issue',
  ],
  [AP.QA]: [
    'github_get_file_contents',
    'github_search_code',
    'jira_get_issue',
  ],
  [AP.DEVOPS]: [
    'github_get_file_contents',
    'github_list_files',
    'datadog_get_metrics',
    'datadog_get_events',
  ],
};

// ─── Guard State ───────────────────────────────────────────────────────────────

export type GuardState = {
  sessionId: string;
  budget: ExecutionBudget;
  toolAllowlist: ToolAllowlist;
  tokensUsed: { input: number; output: number };
  costAccumulated: number;
  turnsElapsed: number;
  retriesUsed: number;
  startedAt: number;
};

// ─── Violation ─────────────────────────────────────────────────────────────────

export type GuardViolation = {
  type: 'budget_exceeded' | 'turn_limit' | 'retry_limit' | 'timeout' | 'tool_denied';
  message: string;
  details: Record<string, unknown>;
};

// ─── ExecutionGuard ────────────────────────────────────────────────────────────

export class ExecutionGuard {
  private state: GuardState;

  constructor(
    sessionId: string,
    budgetOverrides?: Partial<ExecutionBudget>,
    toolAllowlistOverrides?: ToolAllowlist
  ) {
    this.state = {
      sessionId,
      budget: { ...DEFAULT_BUDGET, ...budgetOverrides },
      toolAllowlist: { ...DEFAULT_TOOL_ALLOWLIST, ...toolAllowlistOverrides },
      tokensUsed: { input: 0, output: 0 },
      costAccumulated: 0,
      turnsElapsed: 0,
      retriesUsed: 0,
      startedAt: Date.now(),
    };

    logger.info(
      { sessionId, budget: this.state.budget },
      'ExecutionGuard initialized'
    );
  }

  /** Check if a tool call is allowed for the given agent */
  checkToolAccess(agent: AgentPersona, toolName: string): GuardViolation | null {
    const allowed = this.state.toolAllowlist[agent];
    if (!allowed) return null; // no allowlist = all tools allowed
    if (allowed.includes(toolName)) return null;

    const violation: GuardViolation = {
      type: 'tool_denied',
      message: `Agent ${agent} is not allowed to use tool ${toolName}`,
      details: { agent, toolName, allowedTools: allowed },
    };

    logger.warn(violation, 'Tool access denied');
    return violation;
  }

  /** Record tokens & cost after a turn; returns violation if budget exceeded */
  recordTurn(tokens: { input: number; output: number }, costUsd: number): GuardViolation | null {
    this.state.tokensUsed.input += tokens.input;
    this.state.tokensUsed.output += tokens.output;
    this.state.costAccumulated += costUsd;
    this.state.turnsElapsed += 1;

    // Check cost budget
    if (this.state.costAccumulated >= this.state.budget.maxTotalCostUsd) {
      const violation: GuardViolation = {
        type: 'budget_exceeded',
        message: `Cost budget exceeded: $${this.state.costAccumulated.toFixed(4)} >= $${this.state.budget.maxTotalCostUsd}`,
        details: {
          accumulated: this.state.costAccumulated,
          limit: this.state.budget.maxTotalCostUsd,
        },
      };
      logger.error(violation, 'Budget exceeded');
      return violation;
    }

    // Check turn limit
    if (this.state.turnsElapsed >= this.state.budget.maxDebateTurns) {
      const violation: GuardViolation = {
        type: 'turn_limit',
        message: `Turn limit reached: ${this.state.turnsElapsed} >= ${this.state.budget.maxDebateTurns}`,
        details: {
          turns: this.state.turnsElapsed,
          limit: this.state.budget.maxDebateTurns,
        },
      };
      logger.warn(violation, 'Turn limit reached');
      return violation;
    }

    return null;
  }

  /** Check if a single turn's tokens exceed per-turn limit */
  checkTurnTokens(tokens: { input: number; output: number }): GuardViolation | null {
    const total = tokens.input + tokens.output;
    if (total > this.state.budget.maxTokensPerTurn) {
      return {
        type: 'budget_exceeded',
        message: `Turn token limit exceeded: ${total} > ${this.state.budget.maxTokensPerTurn}`,
        details: { tokens, limit: this.state.budget.maxTokensPerTurn },
      };
    }
    return null;
  }

  /** Record a retry attempt; returns violation if limit reached */
  recordRetry(): GuardViolation | null {
    this.state.retriesUsed += 1;

    if (this.state.retriesUsed > this.state.budget.maxClaudeCodeRetries) {
      const violation: GuardViolation = {
        type: 'retry_limit',
        message: `Retry limit exceeded: ${this.state.retriesUsed} > ${this.state.budget.maxClaudeCodeRetries}`,
        details: {
          retries: this.state.retriesUsed,
          limit: this.state.budget.maxClaudeCodeRetries,
        },
      };
      logger.error(violation, 'Retry limit exceeded');
      return violation;
    }

    return null;
  }

  /** Check if debate timeout has been reached */
  checkDebateTimeout(): GuardViolation | null {
    const elapsed = Date.now() - this.state.startedAt;
    if (elapsed >= this.state.budget.debateTimeoutMs) {
      return {
        type: 'timeout',
        message: `Debate timeout reached: ${elapsed}ms >= ${this.state.budget.debateTimeoutMs}ms`,
        details: { elapsed, limit: this.state.budget.debateTimeoutMs },
      };
    }
    return null;
  }

  /** Get remaining budget info */
  getRemainingBudget() {
    const elapsed = Date.now() - this.state.startedAt;
    return {
      costRemaining: this.state.budget.maxTotalCostUsd - this.state.costAccumulated,
      turnsRemaining: this.state.budget.maxDebateTurns - this.state.turnsElapsed,
      retriesRemaining: this.state.budget.maxClaudeCodeRetries - this.state.retriesUsed,
      timeRemainingMs: this.state.budget.debateTimeoutMs - elapsed,
      costUsedPercent: (this.state.costAccumulated / this.state.budget.maxTotalCostUsd) * 100,
    };
  }

  /** Get current guard state snapshot */
  getState(): Readonly<GuardState> {
    return { ...this.state };
  }

  /** Get allowed tools for a specific agent */
  getAllowedTools(agent: AgentPersona): string[] {
    return this.state.toolAllowlist[agent] ?? [];
  }
}

export function createExecutionGuard(
  sessionId: string,
  budgetOverrides?: Partial<ExecutionBudget>,
  toolAllowlistOverrides?: ToolAllowlist
): ExecutionGuard {
  return new ExecutionGuard(sessionId, budgetOverrides, toolAllowlistOverrides);
}
