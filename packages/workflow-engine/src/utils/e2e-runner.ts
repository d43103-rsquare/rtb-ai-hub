import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@rtb-ai-hub/shared';

const execAsync = promisify(exec);
const logger = createLogger('e2e-runner');

export interface E2EResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  failureReasons?: string[];
  summary: string;
}

export async function runE2ETests(branchName: string, workDir?: string): Promise<E2EResult> {
  const targetDir = workDir || process.env.WORK_REPO_LOCAL_PATH || process.cwd();
  const startTime = Date.now();

  try {
    logger.info({ branchName, targetDir }, 'Starting E2E tests');

    const { stdout, stderr } = await execAsync('pnpm test:e2e --reporter=json', {
      cwd: targetDir,
      env: {
        ...process.env,
        CI: 'true',
      },
      timeout: 300000,
    });

    const duration = Date.now() - startTime;

    try {
      const result = JSON.parse(stdout);
      const stats = result.stats || {};

      const totalTests = stats.tests || 0;
      const passedTests = stats.passes || 0;
      const failedTests = stats.failures || 0;
      const success = failedTests === 0;

      const failureReasons =
        result.failures?.map((f: any) => {
          const title = f.fullTitle || f.title || 'Unknown test';
          const message = f.err?.message || 'No error message';
          return `${title}: ${message}`;
        }) || [];

      const summary = success
        ? `All ${totalTests} E2E tests passed in ${(duration / 1000).toFixed(1)}s`
        : `${failedTests}/${totalTests} E2E tests failed`;

      logger.info(
        { branchName, totalTests, passedTests, failedTests, duration, success },
        'E2E tests completed'
      );

      return {
        success,
        totalTests,
        passedTests,
        failedTests,
        duration,
        failureReasons: success ? undefined : failureReasons,
        summary,
      };
    } catch (parseError) {
      logger.warn({ parseError, stdout: stdout.slice(0, 500) }, 'Failed to parse E2E test output');

      const hasFailure =
        stderr.includes('failed') || stdout.includes('failed') || stdout.includes('Error:');

      return {
        success: !hasFailure,
        totalTests: 0,
        passedTests: 0,
        failedTests: hasFailure ? 1 : 0,
        duration: Date.now() - startTime,
        failureReasons: hasFailure ? ['Failed to parse test output'] : undefined,
        summary: hasFailure ? 'E2E tests failed (parse error)' : 'E2E tests completed',
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({ error, branchName, targetDir }, 'E2E tests execution failed');

    return {
      success: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 1,
      duration,
      failureReasons: [errorMessage],
      summary: `E2E tests execution failed: ${errorMessage}`,
    };
  }
}

export function formatE2EResultForAgent(result: E2EResult): string {
  if (result.success) {
    return `✅ E2E Tests PASSED\n${result.summary}\n- Total: ${result.totalTests}\n- Passed: ${result.passedTests}\n- Duration: ${(result.duration / 1000).toFixed(1)}s`;
  }

  const failures = result.failureReasons?.join('\n- ') || 'Unknown failures';
  return `❌ E2E Tests FAILED\n${result.summary}\n- Total: ${result.totalTests}\n- Passed: ${result.passedTests}\n- Failed: ${result.failedTests}\n\nFailure Details:\n- ${failures}`;
}
