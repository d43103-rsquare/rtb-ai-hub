import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FEATURE_FLAGS } from '@rtb-ai-hub/shared';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('../../clients/database', () => ({
  database: {
    saveWorkflowExecution: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../target-cd', () => ({
  runTargetCd: vi.fn(),
}));

const { runTargetCd } = await import('../target-cd');

import { processTargetDeploy } from '../../workflows/target-deploy';

function makeGitHubPushEvent(overrides: Record<string, unknown> = {}) {
  return {
    source: 'github' as const,
    type: 'push' as const,
    repository: 'org/repo',
    branch: 'develop',
    sha: 'abc123',
    timestamp: new Date().toISOString(),
    payload: { autoDeploy: true },
    ...overrides,
  };
}

describe('processTargetDeploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FEATURE_FLAGS as Record<string, boolean>).TARGET_CD_ENABLED = false;
  });

  it('skips deploy when TARGET_CD_ENABLED=false', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).TARGET_CD_ENABLED = false;
    const event = makeGitHubPushEvent();
    const result = await processTargetDeploy(event, null, 'int');
    expect(result.skipped).toBe(true);
    expect(result.cdResults).toBeNull();
  });

  it('skips deploy when autoDeploy=false (prd manual approval)', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).TARGET_CD_ENABLED = true;
    const event = makeGitHubPushEvent({
      branch: 'main',
      payload: { autoDeploy: false },
    });
    const result = await processTargetDeploy(event, null, 'prd');
    expect(result.skipped).toBe(true);
    expect(result.cdResults).toBeNull();
  });

  it('runs CD when enabled and autoDeploy=true', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).TARGET_CD_ENABLED = true;
    process.env.WORK_REPO_LOCAL_PATH = '';

    (runTargetCd as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      services: [{ service: 'api', success: true, rolledBack: false, durationMs: 5000 }],
      totalDurationMs: 5000,
    });

    const event = makeGitHubPushEvent();
    const result = await processTargetDeploy(event, null, 'int');
    expect(result.skipped).toBe(false);
    expect(result.success).toBe(true);
    expect(result.cdResults?.success).toBe(true);
  });

  it('reports failure when CD fails', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).TARGET_CD_ENABLED = true;
    process.env.WORK_REPO_LOCAL_PATH = '';

    (runTargetCd as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    });

    const event = makeGitHubPushEvent();
    const result = await processTargetDeploy(event, null, 'int');
    expect(result.success).toBe(false);
    expect(result.cdResults?.success).toBe(false);
  });
});
