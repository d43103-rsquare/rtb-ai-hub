/**
 * Bug Fix Workflow
 *
 * Simplified pipeline for bug tickets — no design debate:
 * 1. Save workflow execution (status: in_progress, type: 'bug-fix')
 * 2. Collect bug context from Jira event (error logs, stack trace)
 * 3. Build bug-fix CLAUDE.md using buildBugFixClaudeMd
 * 4. Create worktree (if WORKTREE_ENABLED)
 * 5. Build Claude Code task
 * 6. Execute Claude Code with gate retry
 * 7. Policy validation
 * 8. Push + Create PR
 * 9. Update workflow status to completed
 */

import {
  createLogger,
  DEFAULT_ENVIRONMENT,
  WorkflowType,
  WorkflowStatus,
  generateId,
  FEATURE_FLAGS,
  loadWorkflowBudget,
} from '@rtb-ai-hub/shared';
import type {
  JiraWebhookEvent,
  Environment,
  ClaudeCodeTask,
  WorktreeInfo,
} from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { createPolicyEngine } from '../harness/policy-engine';
import { buildBugFixClaudeMd } from '../claude-code/bug-context-builder';
import { buildMcpServers, buildAllowedTools } from '../claude-code/mcp-config-builder';
import { executeWithGateRetry } from '../claude-code/executor';
import { parseAndValidate } from '../claude-code/result-parser';
import { createWorktreeManager } from '../worktree/manager';
import { createWorktreeRegistry } from '../worktree/registry';

const logger = createLogger('bug-fix-workflow');

export async function processBugFix(
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
    'Processing bug-fix workflow'
  );

  // ─── Step 1: Save Workflow Execution ───────────────────────────────────────

  let executionId: string | undefined;
  try {
    executionId = generateId('wf');
    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.BUG_FIX,
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

  // ─── Step 2: Collect Bug Context ───────────────────────────────────────────

  const errorLogs = extractErrorLogs(description);
  const stackTrace = extractStackTrace(description);

  // ─── Step 3: Build Bug-Fix CLAUDE.MD ───────────────────────────────────────

  const claudeMdContent = buildBugFixClaudeMd({
    issueKey,
    summary,
    description,
    env,
    errorLogs,
    stackTrace,
  });

  // ─── Step 4: Create Worktree ───────────────────────────────────────────────

  let worktreeManager: ReturnType<typeof createWorktreeManager> | null = null;
  let worktreeInfo: WorktreeInfo | undefined;
  try {
    if (FEATURE_FLAGS.WORKTREE_ENABLED && process.env.WORK_REPO_LOCAL_PATH) {
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

  // ─── Step 5 & 6: Build Task + Execute Claude Code with Gate Retry ─────────

  const budget = loadWorkflowBudget('bug-fix');
  const policyEngine = createPolicyEngine();
  const mcpServers = buildMcpServers({ env, allowedServices: ['GITHUB', 'JIRA'] });
  const allowedTools = buildAllowedTools(['GITHUB', 'JIRA']);

  const task: ClaudeCodeTask = {
    id: generateId('cc-task'),
    debateSessionId: executionId || 'none',
    worktreePath: workDir,
    prompt: buildBugFixPrompt(issueKey, summary, description, errorLogs, stackTrace),
    claudeMdContent,
    mcpServers,
    allowedTools,
    maxTurns: budget.claudeCode.maxTurns,
    timeoutMs: budget.claudeCode.timeoutMs,
  };

  const runGates = async () => {
    if (worktreeManager && worktreeInfo) {
      return worktreeManager.runGates(issueKey);
    }
    // Fallback: no gates
    return { allPassed: true, gates: [], totalDurationMs: 0 };
  };

  let codeResult;
  let gateResult;
  try {
    const result = await executeWithGateRetry(task, runGates);
    codeResult = result.codeResult;
    gateResult = result.gateResult;
  } catch (execError) {
    logger.error(
      { error: execError instanceof Error ? execError.message : String(execError) },
      'Claude Code execution failed'
    );
    await updateWorkflowStatus(executionId, WorkflowStatus.FAILED, {
      error: `Execution failed: ${execError instanceof Error ? execError.message : String(execError)}`,
    });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  // ─── Step 7: Policy Validation ─────────────────────────────────────────────

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

  // ─── Step 8: Push + PR ─────────────────────────────────────────────────────

  let prResult: { prNumber?: number; prUrl?: string } = {};
  if (worktreeManager && worktreeInfo) {
    try {
      const prBody = buildBugFixPrBody(issueKey, summary, description, errorLogs, gateResult);
      prResult = await worktreeManager.pushAndCreatePR(issueKey, {
        title: `fix(${issueKey}): ${summary}`,
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

  // ─── Step 9: Complete Workflow ──────────────────────────────────────────────

  await updateWorkflowStatus(executionId, WorkflowStatus.COMPLETED, {
    prNumber: prResult.prNumber,
    prUrl: prResult.prUrl,
    totalCostUsd: codeResult.costUsd || 0,
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
      type: WorkflowType.BUG_FIX,
      status,
      completedAt: new Date(),
      ...extra,
    });
  } catch {
    // best effort
  }
}

function buildBugFixPrompt(
  issueKey: string,
  summary: string,
  description: string,
  errorLogs?: string,
  stackTrace?: string
): string {
  const parts: string[] = [];

  parts.push(`Bug Fix: ${issueKey} — ${summary}`);
  parts.push('');
  parts.push('위 CLAUDE.md의 버그 수정 가이드를 참고하여 다음을 수행하세요:');
  parts.push('1. 근본 원인을 분석하세요 (증상이 아닌 원인)');
  parts.push('2. 최소한의 변경으로 수정하세요');
  parts.push('3. 이 버그를 감지할 수 있는 회귀 테스트를 작성하세요');
  parts.push('');

  if (description) {
    parts.push(`Bug Description:\n${description}`);
    parts.push('');
  }

  if (errorLogs) {
    parts.push(`Error Logs:\n${errorLogs}`);
    parts.push('');
  }

  if (stackTrace) {
    parts.push(`Stack Trace:\n${stackTrace}`);
  }

  return parts.join('\n');
}

function buildBugFixPrBody(
  issueKey: string,
  summary: string,
  description: string,
  errorLogs?: string,
  gateResult?: any
): string {
  const sections: string[] = [];

  sections.push(`## Bug Fix\n- **Jira Issue**: ${issueKey}\n- **Summary**: ${summary}`);

  sections.push(`## Root Cause Analysis\n_See commit messages and code comments for detailed analysis._`);

  if (description) {
    const truncated = description.length > 1000 ? description.slice(0, 1000) + '...' : description;
    sections.push(`## Bug Report\n${truncated}`);
  }

  if (errorLogs) {
    const truncated = errorLogs.length > 500 ? errorLogs.slice(0, 500) + '...' : errorLogs;
    sections.push(`## Error Logs\n\`\`\`\n${truncated}\n\`\`\``);
  }

  if (gateResult?.gates?.length > 0) {
    const gateLines = gateResult.gates
      .map((g: any) => `- ${g.passed ? '✅' : '❌'} ${g.gate} (${g.durationMs}ms)`)
      .join('\n');
    sections.push(`## Quality Gates\n${gateLines}`);
  }

  sections.push(`---\n\n🤖 Generated by RTB AI Hub — Bug Fix Workflow`);

  return sections.join('\n\n');
}

function extractErrorLogs(description: string): string | undefined {
  // Extract content between common error log markers
  const patterns = [
    /```(?:error|log|logs)?\n([\s\S]*?)```/i,
    /Error Logs?:?\s*\n([\s\S]*?)(?:\n\n|\n#{1,3}\s)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}

function extractStackTrace(description: string): string | undefined {
  // Extract stack traces from description
  const patterns = [
    /```(?:stacktrace|stack|trace)?\n([\s\S]*?at\s[\s\S]*?)```/i,
    /Stack\s*Trace:?\s*\n([\s\S]*?)(?:\n\n|\n#{1,3}\s|$)/i,
    /((?:Error|TypeError|ReferenceError|SyntaxError)[\s\S]*?(?:\n\s+at\s.*){2,})/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}
