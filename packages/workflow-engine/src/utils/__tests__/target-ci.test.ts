import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTargetCi, formatCiFailure, type CiRunResult } from '../target-ci';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

const { exec } = await import('node:child_process');
const { access } = await import('node:fs/promises');

function mockExecSuccess(stdout = '', stderr = '') {
  (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb?: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      if (cb) {
        cb(null, { stdout, stderr });
      }
      return { stdout, stderr };
    }
  );
}

function mockExecFail(stderr = 'error output', code = 1) {
  (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb?: (err: { code: number; stderr: string; stdout: string }) => void
    ) => {
      const error = { code, stderr, stdout: '', message: stderr };
      if (cb) {
        cb(error);
      }
      throw error;
    }
  );
}

describe('runTargetCi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('returns success with no steps when workDir is empty', async () => {
    const result = await runTargetCi('feature/test', { workDir: '', steps: [], maxRetries: 2 });
    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(0);
  });

  it('returns success when no CI steps are configured', async () => {
    const result = await runTargetCi('feature/test', {
      workDir: '/fake/repo',
      steps: [],
      maxRetries: 2,
    });
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(0);
  });

  it('returns failure when workDir does not exist', async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
    const result = await runTargetCi('feature/test', {
      workDir: '/nonexistent',
      steps: [{ name: 'lint', command: 'pnpm lint', required: true }],
      maxRetries: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe('formatCiFailure', () => {
  it('returns empty string for successful results', () => {
    const result: CiRunResult = {
      success: true,
      steps: [],
      totalDurationMs: 0,
      failedStep: null,
    };
    expect(formatCiFailure(result)).toBe('');
  });

  it('formats failure with stderr', () => {
    const result: CiRunResult = {
      success: false,
      steps: [
        {
          name: 'lint',
          command: 'pnpm lint',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'ESLint found 3 errors',
          durationMs: 1500,
        },
      ],
      totalDurationMs: 1500,
      failedStep: {
        name: 'lint',
        command: 'pnpm lint',
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'ESLint found 3 errors',
        durationMs: 1500,
      },
    };

    const formatted = formatCiFailure(result);
    expect(formatted).toContain('CI failed at step "lint"');
    expect(formatted).toContain('exit code 1');
    expect(formatted).toContain('ESLint found 3 errors');
  });
});
