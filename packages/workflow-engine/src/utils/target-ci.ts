import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import {
  createLogger,
  loadTargetCiConfig,
  type CiStepConfig,
  type TargetCiConfig,
} from '@rtb-ai-hub/shared';

const execAsync = promisify(exec);
const logger = createLogger('target-ci');

export type CiStepResult = {
  name: string;
  command: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type CiRunResult = {
  success: boolean;
  steps: CiStepResult[];
  totalDurationMs: number;
  failedStep: CiStepResult | null;
};

async function runStep(step: CiStepConfig, workDir: string): Promise<CiStepResult> {
  const start = Date.now();
  logger.info({ step: step.name, command: step.command }, 'Running CI step');

  try {
    const { stdout, stderr } = await execAsync(step.command, {
      cwd: workDir,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    });

    const durationMs = Date.now() - start;
    logger.info({ step: step.name, durationMs }, 'CI step passed');

    return {
      name: step.name,
      command: step.command,
      success: true,
      exitCode: 0,
      stdout: stdout.slice(-5000),
      stderr: stderr.slice(-2000),
      durationMs,
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - start;
    const execError = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    logger.error({ step: step.name, durationMs, exitCode: execError.code }, 'CI step failed');

    return {
      name: step.name,
      command: step.command,
      success: false,
      exitCode: execError.code ?? 1,
      stdout: (execError.stdout || '').slice(-5000),
      stderr: (execError.stderr || execError.message || '').slice(-5000),
      durationMs,
    };
  }
}

export async function runTargetCi(
  branchName: string,
  config?: Partial<TargetCiConfig>
): Promise<CiRunResult> {
  const ciConfig = { ...loadTargetCiConfig(), ...config };
  const { steps, workDir } = ciConfig;

  if (!workDir) {
    return {
      success: false,
      steps: [],
      totalDurationMs: 0,
      failedStep: null,
    };
  }

  try {
    await access(workDir);
  } catch {
    logger.error({ workDir }, 'Work repo directory not found');
    return { success: false, steps: [], totalDurationMs: 0, failedStep: null };
  }

  if (steps.length === 0) {
    logger.info('No CI steps configured — skipping');
    return { success: true, steps: [], totalDurationMs: 0, failedStep: null };
  }

  const start = Date.now();

  await execAsync(`git checkout ${branchName}`, { cwd: workDir }).catch((e) => {
    logger.warn(
      { branchName, error: (e as Error).message },
      'Branch checkout failed — continuing on current branch'
    );
  });

  const results: CiStepResult[] = [];

  for (const step of steps) {
    const result = await runStep(step, workDir);
    results.push(result);

    if (!result.success && step.required) {
      return {
        success: false,
        steps: results,
        totalDurationMs: Date.now() - start,
        failedStep: result,
      };
    }
  }

  const totalDurationMs = Date.now() - start;
  logger.info({ totalDurationMs, stepsRun: results.length }, 'All CI steps passed');

  return {
    success: true,
    steps: results,
    totalDurationMs,
    failedStep: null,
  };
}

export function formatCiFailure(result: CiRunResult): string {
  if (result.success || !result.failedStep) return '';

  const step = result.failedStep;
  const lines = [
    `CI failed at step "${step.name}" (exit code ${step.exitCode})`,
    `Command: ${step.command}`,
  ];

  if (step.stderr) {
    lines.push('', 'STDERR (last 3000 chars):', step.stderr.slice(-3000));
  }
  if (step.stdout) {
    lines.push('', 'STDOUT (last 2000 chars):', step.stdout.slice(-2000));
  }

  return lines.join('\n');
}
