/**
 * Claude Code Executor — `claude` CLI 서브프로세스 실행
 *
 * - claude --print --output-format json CLI 실행
 * - Working directory = worktree 경로
 * - 동적 CLAUDE.md + .mcp.json 생성 후 실행
 * - Hard gate 실패 시 gate 에러를 컨텍스트로 재실행 (최대 3회)
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import type { ClaudeCodeTask, ClaudeCodeResult, GatePipelineResult } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { ExecutionGuard } from '../harness/execution-guard';

const logger = createLogger('claude-code-executor');

const CLAUDE_CLI = process.env.CLAUDE_CODE_CLI_PATH || 'claude';
const MAX_TURNS = parseInt(process.env.CLAUDE_CODE_MAX_TURNS || '30', 10);

export type ClaudeCodeExecOptions = {
  guard?: ExecutionGuard;
  onOutput?: (chunk: string) => void;
};

/** Execute a Claude Code task in the given worktree */
export async function executeClaudeCode(
  task: ClaudeCodeTask,
  options: ClaudeCodeExecOptions = {}
): Promise<ClaudeCodeResult> {
  const startTime = Date.now();

  logger.info(
    { taskId: task.id, worktree: task.worktreePath, maxTurns: task.maxTurns },
    'Starting Claude Code execution'
  );

  // Write CLAUDE.md to worktree
  const claudeMdPath = path.join(task.worktreePath, 'CLAUDE.md');
  await fs.writeFile(claudeMdPath, task.claudeMdContent, 'utf-8');

  // Write .mcp.json if MCP servers configured
  if (task.mcpServers.length > 0) {
    const mcpConfig = buildMcpJsonConfig(task);
    const mcpConfigPath = path.join(task.worktreePath, '.mcp.json');
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  }

  try {
    const result = await runClaudeCli(task, options);

    logger.info(
      {
        taskId: task.id,
        success: result.success,
        filesChanged: result.filesChanged.length,
        durationMs: result.durationMs,
      },
      'Claude Code execution completed'
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    logger.error({ taskId: task.id, error: message }, 'Claude Code execution failed');

    return {
      taskId: task.id,
      success: false,
      output: '',
      filesChanged: [],
      tokensUsed: { input: 0, output: 0 },
      costUsd: 0,
      durationMs,
      error: message,
    };
  }
}

/** Execute Claude Code with gate retry loop */
export async function executeWithGateRetry(
  task: ClaudeCodeTask,
  runGates: () => Promise<GatePipelineResult>,
  options: ClaudeCodeExecOptions = {}
): Promise<{ codeResult: ClaudeCodeResult; gateResult: GatePipelineResult }> {
  const maxRetries = options.guard?.getState().budget.maxClaudeCodeRetries ?? 3;
  let lastCodeResult: ClaudeCodeResult | null = null;
  let lastGateResult: GatePipelineResult | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info({ taskId: task.id, attempt, maxRetries }, 'Claude Code attempt');

    // Check retry budget
    if (attempt > 1 && options.guard) {
      const violation = options.guard.recordRetry();
      if (violation) {
        logger.warn({ violation }, 'Retry limit reached');
        break;
      }
    }

    // Run Claude Code
    const codeResult = await executeClaudeCode(task, options);
    lastCodeResult = codeResult;

    if (!codeResult.success) {
      logger.warn({ taskId: task.id, attempt, error: codeResult.error }, 'Claude Code failed');
      continue;
    }

    // Run gates
    const gateResult = await runGates();
    lastGateResult = gateResult;

    if (gateResult.allPassed) {
      logger.info({ taskId: task.id, attempt }, 'All gates passed');
      return { codeResult, gateResult };
    }

    // Prepare retry with gate error context
    const failedGates = gateResult.gates
      .filter((g) => !g.passed)
      .map((g) => `${g.gate}: ${g.output.slice(0, 1000)}`)
      .join('\n\n');

    task.prompt = `이전 실행에서 다음 게이트가 실패했습니다. 이 문제를 수정해주세요:\n\n${failedGates}\n\n원래 요청:\n${task.prompt}`;

    logger.info(
      { taskId: task.id, attempt, failedGates: gateResult.gates.filter((g) => !g.passed).map((g) => g.gate) },
      'Retrying with gate error context'
    );
  }

  return {
    codeResult: lastCodeResult ?? {
      taskId: task.id,
      success: false,
      output: '',
      filesChanged: [],
      tokensUsed: { input: 0, output: 0 },
      costUsd: 0,
      durationMs: 0,
      error: 'All retry attempts exhausted',
    },
    gateResult: lastGateResult ?? {
      allPassed: false,
      gates: [],
      totalDurationMs: 0,
    },
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function runClaudeCli(
  task: ClaudeCodeTask,
  options: ClaudeCodeExecOptions
): Promise<ClaudeCodeResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const args = [
      '--print',
      '--output-format', 'json',
      '--max-turns', String(task.maxTurns || MAX_TURNS),
    ];

    if (task.systemPrompt) {
      args.push('--system-prompt', task.systemPrompt);
    }

    if (task.allowedTools.length > 0) {
      args.push('--allowedTools', task.allowedTools.join(','));
    }

    // Add prompt as the last argument
    args.push(task.prompt);

    const child = spawn(CLAUDE_CLI, args, {
      cwd: task.worktreePath,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: task.timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (options.onOutput) {
        options.onOutput(chunk);
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;

      if (code !== 0) {
        resolve({
          taskId: task.id,
          success: false,
          output: stdout || stderr,
          filesChanged: [],
          tokensUsed: { input: 0, output: 0 },
          costUsd: 0,
          durationMs,
          error: `Claude CLI exited with code ${code}: ${stderr.slice(0, 1000)}`,
        });
        return;
      }

      try {
        const parsed = parseClaudeOutput(stdout);
        resolve({
          taskId: task.id,
          success: true,
          output: parsed.text,
          filesChanged: parsed.filesChanged,
          tokensUsed: parsed.tokensUsed,
          costUsd: parsed.costUsd,
          durationMs,
        });
      } catch (parseError) {
        resolve({
          taskId: task.id,
          success: true,
          output: stdout,
          filesChanged: [],
          tokensUsed: { input: 0, output: 0 },
          costUsd: 0,
          durationMs,
        });
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function parseClaudeOutput(stdout: string): {
  text: string;
  filesChanged: string[];
  tokensUsed: { input: number; output: number };
  costUsd: number;
} {
  // Try to parse as JSON (claude --output-format json)
  try {
    const json = JSON.parse(stdout);
    return {
      text: json.result ?? json.text ?? stdout,
      filesChanged: json.files_changed ?? [],
      tokensUsed: {
        input: json.usage?.input_tokens ?? json.tokens_used?.input ?? 0,
        output: json.usage?.output_tokens ?? json.tokens_used?.output ?? 0,
      },
      costUsd: json.cost_usd ?? 0,
    };
  } catch {
    // Fallback: treat as plain text
    return {
      text: stdout,
      filesChanged: [],
      tokensUsed: { input: 0, output: 0 },
      costUsd: 0,
    };
  }
}

function buildMcpJsonConfig(task: ClaudeCodeTask): Record<string, unknown> {
  const servers: Record<string, unknown> = {};

  for (const server of task.mcpServers) {
    servers[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env ?? {},
    };
  }

  return { mcpServers: servers };
}
