/**
 * Jira Auto-Dev Workflow — v2
 *
 * 새 흐름:
 * 1. Workflow Execution 저장
 * 2. Context 로드 (wiki, figma, 과거 결정)
 * 3. DEBATE: 설계 토론 (PM, System Planner, Backend Dev, QA)
 * 4. WORKTREE 생성 (이슈 키 기반)
 * 5. CLAUDE.MD 생성 (debate 결과 + 컨텍스트)
 * 6. CLAUDE CODE 실행 (worktree 내)
 * 7. HARD GATES 실행 (실패 시 재시도 최대 3회)
 * 8. PUSH + PR 생성
 * 9. context_links 업데이트
 */

import {
  createLogger,
  DEFAULT_ENVIRONMENT,
  WorkflowType,
  WorkflowStatus,
  generateId,
  AgentPersona,
} from '@rtb-ai-hub/shared';
import type {
  JiraWebhookEvent,
  Environment,
  DebateConfig,
  ClaudeCodeTask,
  WorktreeInfo,
} from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { ClaudeAdapter } from '../clients/adapters/claude-adapter';
import { OpenAIAdapter } from '../clients/adapters/openai-adapter';
import { GeminiAdapter } from '../clients/adapters/gemini-adapter';
import { createProviderRouter } from '../clients/provider-router';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';
import { updateContext } from '../utils/context-engine';
import { createDebateEngine } from '../debate/engine';
import { createDebateStore } from '../debate/debate-store';
import { createPolicyEngine } from '../harness/policy-engine';
import { buildClaudeMd } from '../claude-code/context-builder';
import { buildMcpServers, buildAllowedTools } from '../claude-code/mcp-config-builder';
import { executeClaudeCode, executeWithGateRetry } from '../claude-code/executor';
import { parseAndValidate } from '../claude-code/result-parser';
import { createWorktreeManager } from '../worktree/manager';
import { createWorktreeRegistry } from '../worktree/registry';
import { WikiKnowledge } from '../utils/wiki-knowledge';
import { findDecisionsByJiraKey } from '../utils/decision-store';
import { createTaskFolder } from '../utils/task-folder';
import { buildOpsVerificationPrompt, parseOpsVerificationResult } from '../utils/ops-verifier';
import { isPaused } from '../utils/pause-checker';

const logger = createLogger('jira-auto-dev-workflow');

export async function processJiraAutoDev(
  event: JiraWebhookEvent,
  _userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<{ dispatched: boolean; workflowExecutionId?: string }> {
  const issueKey = event.issueKey || event.payload?.issue?.key || 'UNKNOWN';
  const summary = event.payload?.issue?.fields?.summary || event.payload?.summary || 'No summary';
  const description = event.payload?.issue?.fields?.description || '';
  const issueType = event.issueType || event.payload?.issue?.fields?.issuetype?.name;

  logger.info(
    { issueKey, summary, env },
    'Processing Jira auto-dev workflow — debate + Claude Code pipeline'
  );

  // ─── Step 1: Save Workflow Execution ───────────────────────────────────────

  let executionId: string | undefined;
  try {
    executionId = generateId('wf');
    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.JIRA_AUTO_DEV,
      status: WorkflowStatus.IN_PROGRESS,
      input: event,
      env,
      startedAt: new Date(),
    });
  } catch (dbError) {
    logger.warn(
      { error: dbError instanceof Error ? dbError.message : String(dbError) },
      'Failed to save workflow execution — continuing'
    );
  }

  // ─── Step 1b: Initialize Task Folder ─────────────────────────────────────

  try {
    await createTaskFolder(issueKey, summary);
    logger.info({ issueKey, path: `docs/plans/${issueKey}` }, 'Task folder initialized');
  } catch (folderError) {
    logger.warn(
      { error: folderError instanceof Error ? folderError.message : String(folderError) },
      'Failed to create task folder — continuing'
    );
  }

  // ─── Step 2: Load Context ─────────────────────────────────────────────────

  try {
    await updateContext({ jiraKey: issueKey, summary, env });
  } catch (ctxError) {
    logger.warn(
      { error: ctxError instanceof Error ? ctxError.message : String(ctxError) },
      'Failed to update context — continuing'
    );
  }

  // Load wiki knowledge & previous decisions
  let wikiKnowledge: string | undefined;
  let previousDecisions: string | undefined;
  try {
    const wiki = new WikiKnowledge();
    if (wiki.isAvailable) {
      wikiKnowledge = await wiki.searchForContext(`${issueKey} ${summary}`);
    }
  } catch {
    // wiki knowledge optional
  }
  try {
    const decisions = await findDecisionsByJiraKey(issueKey);
    if (decisions && decisions.length > 0) {
      previousDecisions = decisions
        .map((d) => `[${d.title}] ${d.decision}`)
        .join('\n');
    }
  } catch {
    // decision journal optional
  }

  // ─── Step 3: Design Debate ────────────────────────────────────────────────

  // Pause check before Design Debate
  if (executionId && await isPaused(executionId)) {
    logger.info({ executionId, issueKey }, 'Workflow paused before design debate');
    return { dispatched: false, workflowExecutionId: executionId };
  }

  if (!executionId) {
    return { dispatched: false };
  }

  const adapters: ProviderAdapter[] = [new ClaudeAdapter()];
  if (process.env.OPENAI_API_KEY) adapters.push(new OpenAIAdapter());
  if (process.env.GEMINI_API_KEY) adapters.push(new GeminiAdapter());
  const router = createProviderRouter(adapters);
  await router.loadConfig(env);
  const debateStore = createDebateStore(database);
  const policyEngine = createPolicyEngine();

  const debateConfig: DebateConfig = {
    topic: `Jira Issue ${issueKey}: ${summary}\n\n${description}\n\n이 이슈의 기술 설계와 구현 방안을 논의하세요.`,
    participants: [
      AgentPersona.PM,
      AgentPersona.SYSTEM_PLANNER,
      AgentPersona.BACKEND_DEVELOPER,
      AgentPersona.QA,
    ],
    moderator: AgentPersona.PM,
    maxTurns: parseInt(process.env.DEBATE_MAX_TURNS || '12', 10),
    consensusRequired: true,
    context: {
      jiraKey: issueKey,
      summary,
      description,
      env,
      wikiKnowledge,
      previousDecisions,
    },
    budgetUsd: parseFloat(process.env.DEBATE_COST_LIMIT_USD || '5'),
  };

  const debateEngine = createDebateEngine({
    router,
    store: debateStore,
  });

  let debateSession;
  try {
    debateSession = await debateEngine.run(debateConfig, executionId);
    logger.info(
      {
        sessionId: debateSession.id,
        outcome: debateSession.outcome?.status,
        turns: debateSession.turns.length,
        cost: debateSession.totalCostUsd.toFixed(4),
      },
      'Design debate completed'
    );
  } catch (debateError) {
    logger.error(
      { error: debateError instanceof Error ? debateError.message : String(debateError) },
      'Design debate failed'
    );
    await updateWorkflowStatus(executionId, WorkflowStatus.FAILED, {
      error: `Debate failed: ${debateError instanceof Error ? debateError.message : String(debateError)}`,
    });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  // ─── Step 4: Create Worktree ──────────────────────────────────────────────

  let worktreeManager: ReturnType<typeof createWorktreeManager> | null = null;
  let worktreeInfo: WorktreeInfo | undefined;
  try {
    // Attempt to create worktree — requires WORK_REPO_LOCAL_PATH
    if (process.env.WORK_REPO_LOCAL_PATH) {
      const registry = createWorktreeRegistry();
      worktreeManager = createWorktreeManager(registry);

      worktreeInfo = await worktreeManager.createWorktree(issueKey, summary, env, issueType);
      logger.info({ issueKey, worktreePath: worktreeInfo.worktreePath }, 'Worktree created');
    }
  } catch (wtError) {
    logger.warn(
      { error: wtError instanceof Error ? wtError.message : String(wtError) },
      'Failed to create worktree — using main repo'
    );
  }

  const workDir = worktreeInfo?.worktreePath || process.env.WORK_REPO_LOCAL_PATH || '';

  if (!workDir) {
    logger.error('No working directory available');
    await updateWorkflowStatus(executionId, WorkflowStatus.FAILED, {
      error: 'No WORK_REPO_LOCAL_PATH configured',
    });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  // ─── Step 5: Build CLAUDE.MD ──────────────────────────────────────────────

  const policyConstraints = policyEngine.generateConstraints(env);
  const claudeMdContent = buildClaudeMd({
    debateSession,
    context: debateConfig.context,
    env,
    policyConstraints,
  });

  // ─── Step 6 & 7: Claude Code + Gate Retry ─────────────────────────────────

  // Pause check before Claude Code execution
  if (executionId && await isPaused(executionId)) {
    logger.info({ executionId, issueKey }, 'Workflow paused before code generation');
    return { dispatched: false, workflowExecutionId: executionId };
  }

  const mcpServers = buildMcpServers({ env, allowedServices: ['GITHUB', 'JIRA'] });
  const allowedTools = buildAllowedTools(['GITHUB', 'JIRA']);

  const task: ClaudeCodeTask = {
    id: generateId('cc-task'),
    debateSessionId: debateSession.id,
    worktreePath: workDir,
    prompt: `Jira Issue ${issueKey}: ${summary}\n\n위 CLAUDE.md의 설계 결정과 아티팩트를 참고하여 구현하세요.`,
    claudeMdContent,
    mcpServers,
    allowedTools,
    maxTurns: parseInt(process.env.CLAUDE_CODE_MAX_TURNS || '30', 10),
    timeoutMs: parseInt(process.env.CLAUDE_CODE_TIMEOUT_MS || '600000', 10),
  };

  const runGates = async () => {
    if (worktreeManager && worktreeInfo) {
      return worktreeManager.runGates(issueKey);
    }
    // Fallback: no gates
    return { allPassed: true, gates: [], totalDurationMs: 0 };
  };

  const { codeResult, gateResult } = await executeWithGateRetry(task, runGates);

  // Validate against policies
  const parsed = parseAndValidate(codeResult, env, policyEngine);
  if (!parsed.policyCheck.allowed) {
    logger.error(
      { violations: parsed.policyCheck.violations },
      'Policy violations — code rejected'
    );
    await updateWorkflowStatus(executionId, WorkflowStatus.FAILED, {
      error: `Policy violations: ${parsed.policyCheck.violations.join('; ')}`,
    });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  if (!codeResult.success || !gateResult.allPassed) {
    logger.warn(
      { success: codeResult.success, gatesAllPassed: gateResult.allPassed },
      'Code generation or gates failed'
    );
    await updateWorkflowStatus(executionId, WorkflowStatus.FAILED, {
      error: codeResult.error || 'Gates failed after max retries',
    });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  // ─── Step 8.5: Ops Verification ──────────────────────────────────────────

  const opsVerificationEnabled = process.env.OPS_VERIFICATION_ENABLED === 'true';
  if (opsVerificationEnabled && workDir) {
    try {
      const opsPrompt = buildOpsVerificationPrompt(issueKey, env);
      const opsAllowedTools = buildAllowedTools([]);
      // Allow rtb-connections MCP tools for ops verification
      const opsExtendedTools = [
        ...opsAllowedTools,
        'mcp__rtb-connections__query_db',
        'mcp__rtb-connections__run_aws_cli',
        'mcp__rtb-connections__check_db_connection',
        'mcp__rtb-connections__check_aws_connection',
      ];

      const opsTask: ClaudeCodeTask = {
        id: generateId('ops-task'),
        debateSessionId: debateSession.id,
        worktreePath: workDir,
        prompt: opsPrompt,
        claudeMdContent: `# Ops Verification Task\n\nVerify ${env} environment readiness for ${issueKey}.`,
        mcpServers: buildMcpServers({ env, allowedServices: [] }),
        allowedTools: opsExtendedTools,
        maxTurns: 10,
        timeoutMs: 120000,
      };

      const opsCodeResult = await executeClaudeCode(opsTask);
      const opsResult = parseOpsVerificationResult(opsCodeResult.output || '');

      logger.info(
        { issueKey, env, passed: opsResult.passed, checks: opsResult.checks.length },
        'Ops verification completed'
      );

      if (!opsResult.passed && env === 'prd') {
        logger.error({ issueKey, opsResult }, 'Ops verification FAILED — blocking prd deployment');
        await updateWorkflowStatus(executionId, WorkflowStatus.FAILED, {
          error: `Ops verification failed: ${opsResult.summary}`,
          opsVerification: opsResult,
        });
        return { dispatched: false, workflowExecutionId: executionId };
      }
    } catch (opsError) {
      logger.warn(
        { error: opsError instanceof Error ? opsError.message : String(opsError) },
        'Ops verification error — continuing (non-prd)'
      );
    }
  }

  // ─── Step 8: Push + PR ────────────────────────────────────────────────────

  let prResult: { prNumber?: number; prUrl?: string } = {};
  if (worktreeManager && worktreeInfo) {
    try {
      const prBody = buildPrBody(debateSession, gateResult, issueKey);
      prResult = await worktreeManager.pushAndCreatePR(issueKey, {
        title: `${issueKey}: ${summary}`,
        body: prBody,
      });

      logger.info(
        { issueKey, prNumber: prResult.prNumber, prUrl: prResult.prUrl },
        'PR created successfully'
      );
    } catch (prError) {
      logger.error(
        { error: prError instanceof Error ? prError.message : String(prError) },
        'Failed to create PR'
      );
    }
  }

  // ─── Step 9: Update Context ───────────────────────────────────────────────

  try {
    await updateContext({
      jiraKey: issueKey,
      env,
      githubBranch: worktreeInfo?.branchName,
      githubPrNumber: prResult.prNumber,
      githubPrUrl: prResult.prUrl,
    });
  } catch {
    // context update optional
  }

  // Complete workflow
  await updateWorkflowStatus(executionId, WorkflowStatus.COMPLETED, {
    debateSessionId: debateSession.id,
    prNumber: prResult.prNumber,
    prUrl: prResult.prUrl,
    totalCostUsd: debateSession.totalCostUsd + (codeResult.costUsd || 0),
  });

  return { dispatched: true, workflowExecutionId: executionId };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function updateWorkflowStatus(
  executionId: string | undefined,
  status: WorkflowStatus,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!executionId) return;
  try {
    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.JIRA_AUTO_DEV,
      status,
      completedAt: new Date(),
      ...extra,
    });
  } catch {
    // best effort
  }
}

function buildPrBody(
  debateSession: any,
  gateResult: any,
  issueKey: string
): string {
  const sections: string[] = [];

  sections.push(`## Context\n- **Jira Issue**: ${issueKey}`);

  if (debateSession.outcome) {
    sections.push(`## Design Decision\n**Status**: ${debateSession.outcome.status}\n\n${debateSession.outcome.decision?.slice(0, 2000) || ''}`);
  }

  if (gateResult.gates.length > 0) {
    const gateLines = gateResult.gates
      .map((g: any) => `- ${g.passed ? '✅' : '❌'} ${g.gate} (${g.durationMs}ms)`)
      .join('\n');
    sections.push(`## Quality Gates\n${gateLines}`);
  }

  sections.push(`---\n\n🤖 Generated by RTB AI Hub — Debate Engine + Claude Code`);

  return sections.join('\n\n');
}
