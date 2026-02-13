import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTargetCd, type CdRunResult } from '../target-cd';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

const { exec } = await import('node:child_process');
const { access } = await import('node:fs/promises');

function mockExecImpl(
  responses: Record<string, { stdout?: string; stderr?: string; error?: boolean }>
) {
  (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      cmd: string,
      _opts: unknown,
      cb?: (err: unknown, result?: { stdout: string; stderr: string }) => void
    ) => {
      const key = Object.keys(responses).find((k) => cmd.includes(k));
      const resp = key ? responses[key] : { stdout: '', stderr: '' };

      if (resp.error) {
        const error = new Error(resp.stderr || 'command failed');
        if (cb) {
          cb(error);
          return;
        }
        throw error;
      }

      const result = { stdout: resp.stdout || '', stderr: resp.stderr || '' };
      if (cb) {
        cb(null, result);
        return;
      }
      return result;
    }
  );
}

describe('runTargetCd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('returns failure when workDir is empty', async () => {
    const result = await runTargetCd({
      workDir: '',
      services: [],
      composeFile: 'docker-compose.yml',
      healthTimeout: 30,
      healthInterval: 2,
    });
    expect(result.success).toBe(false);
    expect(result.services).toHaveLength(0);
  });

  it('returns success when no services are configured', async () => {
    const result = await runTargetCd({
      workDir: '/fake/repo',
      services: [],
      composeFile: 'docker-compose.yml',
      healthTimeout: 30,
      healthInterval: 2,
    });
    expect(result.success).toBe(true);
    expect(result.services).toHaveLength(0);
  });

  it('returns failure when workDir does not exist', async () => {
    (access as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
    const result = await runTargetCd({
      workDir: '/nonexistent',
      services: ['api'],
      composeFile: 'docker-compose.yml',
      healthTimeout: 30,
      healthInterval: 2,
    });
    expect(result.success).toBe(false);
    expect(result.services).toHaveLength(0);
  });

  it('returns failure when docker build fails', async () => {
    mockExecImpl({
      'build --no-cache': { error: true, stderr: 'build failed' },
    });

    const result = await runTargetCd({
      workDir: '/fake/repo',
      services: ['api'],
      composeFile: 'docker-compose.yml',
      healthTimeout: 5,
      healthInterval: 1,
    });
    expect(result.success).toBe(false);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].success).toBe(false);
    expect(result.services[0].error).toContain('build failed');
  });
});

describe('CdRunResult type', () => {
  it('has correct shape for successful result', () => {
    const result: CdRunResult = {
      success: true,
      services: [{ service: 'api', success: true, rolledBack: false, durationMs: 5000 }],
      totalDurationMs: 5000,
    };
    expect(result.success).toBe(true);
    expect(result.services[0].rolledBack).toBe(false);
  });

  it('has correct shape for failure with rollback', () => {
    const result: CdRunResult = {
      success: false,
      services: [
        {
          service: 'api',
          success: false,
          rolledBack: true,
          durationMs: 10000,
          error: 'Health check failed',
        },
      ],
      totalDurationMs: 10000,
    };
    expect(result.success).toBe(false);
    expect(result.services[0].rolledBack).toBe(true);
    expect(result.services[0].error).toBeDefined();
  });
});
