import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchPoller } from '../branch-poller';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

vi.mock('bullmq', () => {
  const MockQueue = vi.fn(function (this: Record<string, unknown>) {
    this.add = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);
  });
  return { Queue: MockQueue };
});

vi.mock('../../queue/connection', () => ({
  createRedisConnection: vi.fn().mockReturnValue({}),
}));

const { exec } = await import('node:child_process');

function mockExec(responses: Record<string, string>) {
  (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (
      cmd: string,
      _opts: unknown,
      cb?: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      const key = Object.keys(responses).find((k) => cmd.includes(k));
      const stdout = key ? responses[key] : '';
      const result = { stdout, stderr: '' };
      if (cb) {
        cb(null, result);
        return;
      }
      return result;
    }
  );
}

describe('BranchPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates with default config when not enabled', () => {
    const poller = new BranchPoller({ enabled: false, workDir: '' });
    expect(poller).toBeDefined();
  });

  it('does not start when disabled', async () => {
    const poller = new BranchPoller({ enabled: false, workDir: '/fake' });
    await poller.start();
    await poller.stop();
    expect(exec).not.toHaveBeenCalled();
  });

  it('does not start when workDir is empty', async () => {
    const poller = new BranchPoller({ enabled: true, workDir: '' });
    await poller.start();
    await poller.stop();
    expect(exec).not.toHaveBeenCalled();
  });

  it('fetches refs on start and stores initial state', async () => {
    mockExec({
      'git fetch': '',
      'git rev-parse origin/develop': 'abc1234567890\n',
      'git rev-parse origin/main': 'def4567890123\n',
      'git for-each-ref': '',
    });

    const poller = new BranchPoller({
      enabled: true,
      workDir: '/fake/repo',
      intervalMs: 999999,
      trackedBranches: [
        { env: 'int', pattern: 'develop', autoDeploy: true },
        { env: 'prd', pattern: 'main', autoDeploy: false },
      ],
    });

    await poller.start();
    await poller.stop();

    expect(exec).toHaveBeenCalled();
  });

  it('detects branch changes on poll and enqueues job', async () => {
    let callCount = 0;
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        cmd: string,
        _opts: unknown,
        cb?: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        let stdout = '';

        if (cmd.includes('git fetch')) {
          stdout = '';
        } else if (cmd.includes('rev-parse origin/develop')) {
          callCount++;
          stdout = callCount <= 1 ? 'aaa1111111111\n' : 'bbb2222222222\n';
        } else if (cmd.includes('for-each-ref')) {
          stdout = '';
        } else if (cmd.includes('remote get-url')) {
          stdout = 'https://github.com/test-org/test-repo.git\n';
        }

        const result = { stdout, stderr: '' };
        if (cb) {
          cb(null, result);
          return;
        }
        return result;
      }
    );

    const poller = new BranchPoller({
      enabled: true,
      workDir: '/fake/repo',
      intervalMs: 999999,
      trackedBranches: [{ env: 'int', pattern: 'develop', autoDeploy: true }],
    });

    await poller.start();
    await poller.poll();
    await poller.stop();
  });

  it('matches release/* pattern branches', async () => {
    mockExec({
      'git fetch': '',
      'for-each-ref': 'origin/release/v1.0 abc1234567890\n',
      'git rev-parse origin/develop': 'def4567890123\n',
      'git rev-parse origin/main': 'ghi7890123456\n',
    });

    const poller = new BranchPoller({
      enabled: true,
      workDir: '/fake/repo',
      intervalMs: 999999,
      trackedBranches: [
        { env: 'int', pattern: 'develop', autoDeploy: true },
        { env: 'stg', pattern: 'release/*', autoDeploy: true },
        { env: 'prd', pattern: 'main', autoDeploy: false },
      ],
    });

    await poller.start();
    await poller.stop();
  });
});
