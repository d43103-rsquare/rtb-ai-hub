/**
 * RTB AI Hub - Debate Engine & Harness Types
 *
 * 7개 직무별 에이전트 페르소나 기반 턴 제 토론 시스템,
 * Claude Code 실행, Git Worktree 관리, Harness 계층 타입 정의
 */

import type { AITier, Environment, ProviderType } from './types';

// ─── Agent Persona ──────────────────────────────────────────────────────────────

export enum AgentPersona {
  PM = 'pm', // VisionKeeper
  SYSTEM_PLANNER = 'system-planner', // BlueprintMaster
  UX_DESIGNER = 'ux-designer', // ExperienceCraftsman
  UI_DEVELOPER = 'ui-developer', // PixelPerfect
  BACKEND_DEVELOPER = 'backend-developer', // DataGuardian
  QA = 'qa', // QualityGatekeeper
  DEVOPS = 'devops', // InfrastructureKeeper
}

export type PersonaDefinition = {
  persona: AgentPersona;
  codename: string;
  role: string;
  description: string;
  traits: string[];
  vocabulary: string[];
  decisionFramework: string;
  domainExpertise: string[];
  handoffTriggers: Partial<Record<AgentPersona, string>>;
  aiTier: AITier;                         // fallback용 — DB 설정 없을 때 Claude tier 결정에 사용
  preferredProvider?: ProviderType;       // 신규: persona 수준 권장 provider
  maxTokensPerTurn: number;
};

// ─── Debate Turn ────────────────────────────────────────────────────────────────

export type DebateTurnType =
  | 'proposal' // Initial position statement
  | 'counter' // Disagreement with rationale
  | 'supplement' // Agreement with additions
  | 'consensus' // Moderator summarizes agreement
  | 'decision'; // Moderator makes final call (stalemate)

export type DebateArtifact = {
  type:
    | 'design-doc'
    | 'implementation-plan'
    | 'code'
    | 'test-plan'
    | 'review-comment'
    | 'architecture'
    | 'api-spec';
  title: string;
  content: string;
  format: 'markdown' | 'json' | 'typescript' | 'yaml';
};

export type DebateTurn = {
  turnNumber: number;
  agent: AgentPersona;
  content: string;
  type: DebateTurnType;
  references?: number[]; // Turn numbers referenced
  artifacts: DebateArtifact[];
  tokensUsed: { input: number; output: number };
  model: string;
  durationMs: number;
  timestamp: string;
};

// ─── Debate Config & Context ────────────────────────────────────────────────────

export type DebateContext = {
  jiraKey: string;
  summary: string;
  description?: string;
  env: Environment;
  wikiKnowledge?: string;
  figmaContext?: string;
  codeContext?: string;
  previousDecisions?: string;
  additionalContext?: Record<string, string>;
};

export type DebateConfig = {
  topic: string;
  participants: AgentPersona[];
  moderator: AgentPersona;
  maxTurns: number;
  consensusRequired: boolean;
  outputSchema?: Record<string, unknown>;
  context: DebateContext;
  budgetUsd?: number;
};

// ─── Debate Session & Outcome ───────────────────────────────────────────────────

export type ConsensusStatus = 'consensus' | 'partial' | 'disagreement' | 'stalemate';

export type DebateOutcome = {
  status: 'consensus' | 'moderator-decided' | 'max-turns-reached' | 'budget-exceeded' | 'error';
  decision: string;
  artifacts: DebateArtifact[];
  dissentingViews?: Array<{ agent: AgentPersona; view: string }>;
  error?: string;
};

export type DebateSession = {
  id: string;
  workflowExecutionId: string;
  config: DebateConfig;
  turns: DebateTurn[];
  outcome?: DebateOutcome;
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
  durationMs: number;
  createdAt: string;
  completedAt?: string;
};

// ─── Claude Code Execution ──────────────────────────────────────────────────────

export type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type ClaudeCodeTask = {
  id: string;
  debateSessionId: string;
  worktreePath: string;
  prompt: string;
  systemPrompt?: string;
  claudeMdContent: string;
  mcpServers: McpServerConfig[];
  allowedTools: string[];
  maxTurns: number;
  timeoutMs: number;
};

export type ClaudeCodeResult = {
  taskId: string;
  success: boolean;
  output: string;
  filesChanged: string[];
  tokensUsed: { input: number; output: number };
  costUsd: number;
  durationMs: number;
  error?: string;
};

// ─── Hard Gates ─────────────────────────────────────────────────────────────────

export type GateType = 'lint' | 'typecheck' | 'test' | 'build' | 'e2e';

export type GateResult = {
  gate: GateType;
  passed: boolean;
  output: string;
  durationMs: number;
};

export type GatePipelineResult = {
  allPassed: boolean;
  gates: GateResult[];
  totalDurationMs: number;
};

// ─── Worktree ───────────────────────────────────────────────────────────────────

export type WorktreeStatus =
  | 'creating'
  | 'active'
  | 'gating'
  | 'pr-created'
  | 'merged'
  | 'failed'
  | 'cleaning';

export type WorktreeInfo = {
  issueKey: string;
  branchName: string;
  worktreePath: string;
  baseBranch: string;
  env: Environment;
  status: WorktreeStatus;
  createdAt: string;
  lastActivityAt: string;
  prNumber?: number;
  prUrl?: string;
  error?: string;
};

// ─── Harness ────────────────────────────────────────────────────────────────────

// Execution Control
export type ExecutionBudget = {
  maxTokensPerTurn: number;
  maxTotalCostUsd: number;
  maxDebateTurns: number;
  maxClaudeCodeRetries: number;
  claudeCodeTimeoutMs: number;
  debateTimeoutMs: number;
};

export type ToolAllowlist = Partial<Record<AgentPersona, string[]>>;

// Observability
export type ObserverEvent = {
  type: 'turn_start' | 'turn_end' | 'budget_warning' | 'anomaly_detected' | 'gate_result';
  sessionId: string;
  agent?: AgentPersona;
  data: Record<string, unknown>;
  timestamp: string;
};

export type AnomalyType =
  | 'infinite-loop' // Same content repeated 3+ times
  | 'token-spike' // Token usage > 2x average
  | 'timeout-approaching' // > 80% of timeout elapsed
  | 'cost-spike'; // Cost > 80% of budget

// Policy Engine
export type PolicyScope = 'env' | 'file' | 'agent' | 'workflow';
export type PolicyAction = 'block' | 'warn' | 'require-approval';

export type HarnessPolicy = {
  id: string;
  name: string;
  scope: PolicyScope;
  condition: string;
  action: PolicyAction;
  message: string;
  enabled: boolean;
};

export type HarnessViolation = {
  policyId: string;
  policyName: string;
  action: PolicyAction;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
};

export type PolicyCheckResult = {
  allowed: boolean;
  violations: HarnessViolation[];
  warnings: HarnessViolation[];
};
