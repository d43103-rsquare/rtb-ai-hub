import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowStatus, WorkflowType } from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';

// ─── Mock Functions ──────────────────────────────────────────────────────────

const mockSaveWorkflowExecution = vi.fn();
const mockExecuteWithGateRetry = vi.fn();
const mockBuildBugFixClaudeMd = vi.fn().mockReturnValue('# Bug Fix CLAUDE.md');
const mockBuildMcpServers = vi.fn().mockReturnValue([]);
const mockBuildAllowedTools = vi.fn().mockReturnValue(['Read', 'Write', 'Edit', 'Bash']);
const mockParseAndValidate = vi.fn();
const mockCreateWorktreeManager = vi.fn();
const mockCreateWorktreeRegistry = vi.fn();
const mockCreatePolicyEngine = vi.fn().mockReturnValue({
  generateConstraints: vi.fn().mockReturnValue(''),
  check: vi.fn().mockReturnValue({ allowed: true, violations: [], warnings: [] }),
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@rtb-ai-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rtb-ai-hub/shared')>();
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('test-wf-123'),
    createLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      WORKTREE_ENABLED: false,
    },
  };
});

vi.mock('../../clients/database', () => ({
  database: {
    saveWorkflowExecution: mockSaveWorkflowExecution,
  },
}));

vi.mock('../../claude-code/executor', () => ({
  executeWithGateRetry: mockExecuteWithGateRetry,
  executeClaudeCode: vi.fn(),
}));

vi.mock('../../claude-code/bug-context-builder', () => ({
  buildBugFixClaudeMd: mockBuildBugFixClaudeMd,
}));

vi.mock('../../claude-code/mcp-config-builder', () => ({
  buildMcpServers: mockBuildMcpServers,
  buildAllowedTools: mockBuildAllowedTools,
}));

vi.mock('../../claude-code/result-parser', () => ({
  parseAndValidate: mockParseAndValidate,
}));

vi.mock('../../harness/policy-engine', () => ({
  createPolicyEngine: mockCreatePolicyEngine,
}));

vi.mock('../../worktree/manager', () => ({
  createWorktreeManager: mockCreateWorktreeManager,
}));

vi.mock('../../worktree/registry', () => ({
  createWorktreeRegistry: mockCreateWorktreeRegistry,
}));

// ─── Test Data ───────────────────────────────────────────────────────────────

const mockEvent: JiraWebhookEvent = {
  source: 'jira',
  type: 'issue_updated',
  issueKey: 'PROJ-456',
  issueType: 'Bug',
  status: 'In Progress',
  summary: 'Login button throws TypeError on click',
  description: 'When clicking the login button, a TypeError is thrown.\n\n```error\nTypeError: Cannot read property "email" of undefined\n```',
  timestamp: new Date().toISOString(),
  payload: {
    issue: {
      key: 'PROJ-456',
      fields: {
        summary: 'Login button throws TypeError on click',
        description: 'When clicking the login button, a TypeError is thrown.\n\n```error\nTypeError: Cannot read property "email" of undefined\n```',
        issuetype: { name: 'Bug' },
      },
    },
  },
};

const mockCodeResult = {
  taskId: 'cc-task-1',
  success: true,
  output: 'Fixed the bug by adding null check',
  filesChanged: ['src/auth/login.ts', 'src/auth/__tests__/login.test.ts'],
  tokensUsed: { input: 1000, output: 500 },
  costUsd: 0.02,
  durationMs: 15000,
};

const mockGateResult = {
  allPassed: true,
  gates: [
    { gate: 'lint', passed: true, output: '', durationMs: 100 },
    { gate: 'typecheck', passed: true, output: '', durationMs: 200 },
    { gate: 'test', passed: true, output: '', durationMs: 500 },
  ],
  totalDurationMs: 800,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('processBugFix', () => {
  let processBugFix: typeof import('../bug-fix').processBugFix;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up default successful mocks
    mockSaveWorkflowExecution.mockResolvedValue(undefined);
    mockExecuteWithGateRetry.mockResolvedValue({
      codeResult: mockCodeResult,
      gateResult: mockGateResult,
    });
    mockParseAndValidate.mockReturnValue({
      codeResult: mockCodeResult,
      policyCheck: { allowed: true, violations: [], warnings: [] },
    });

    // Provide a work directory
    process.env.WORK_REPO_LOCAL_PATH = '/tmp/test-repo';

    const mod = await import('../bug-fix');
    processBugFix = mod.processBugFix;
  });

  it('saves workflow execution at start with type bug-fix', async () => {
    await processBugFix(mockEvent, null, 'int');

    expect(mockSaveWorkflowExecution).toHaveBeenCalled();
    const firstCall = mockSaveWorkflowExecution.mock.calls[0][0];
    expect(firstCall.type).toBe(WorkflowType.BUG_FIX);
    expect(firstCall.status).toBe(WorkflowStatus.IN_PROGRESS);
    expect(firstCall.id).toBe('test-wf-123');
  });

  it('builds bug-specific CLAUDE.md via buildBugFixClaudeMd', async () => {
    await processBugFix(mockEvent, null, 'int');

    expect(mockBuildBugFixClaudeMd).toHaveBeenCalledWith(
      expect.objectContaining({
        issueKey: 'PROJ-456',
        summary: expect.any(String),
        env: 'int',
      })
    );
  });

  it('returns dispatched: true on success', async () => {
    const result = await processBugFix(mockEvent, null, 'int');

    expect(result.dispatched).toBe(true);
    expect(result.workflowExecutionId).toBe('test-wf-123');
  });

  it('updates status to completed on success', async () => {
    await processBugFix(mockEvent, null, 'int');

    // Last saveWorkflowExecution call should be COMPLETED
    const calls = mockSaveWorkflowExecution.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.status).toBe(WorkflowStatus.COMPLETED);
    expect(lastCall.type).toBe(WorkflowType.BUG_FIX);
  });

  it('handles executor failure gracefully', async () => {
    mockExecuteWithGateRetry.mockRejectedValue(new Error('Claude Code crashed'));

    const result = await processBugFix(mockEvent, null, 'int');

    expect(result.dispatched).toBe(false);
    expect(result.workflowExecutionId).toBe('test-wf-123');

    // Should save FAILED status
    const failedCall = mockSaveWorkflowExecution.mock.calls.find(
      (call: unknown[]) => (call[0] as { status: string }).status === WorkflowStatus.FAILED
    );
    expect(failedCall).toBeDefined();
  });

  it('handles policy violations', async () => {
    mockParseAndValidate.mockReturnValue({
      codeResult: mockCodeResult,
      policyCheck: {
        allowed: false,
        violations: ['[no-prd-schema-change] DB schema change in production'],
        warnings: [],
      },
    });

    const result = await processBugFix(mockEvent, null, 'prd');

    expect(result.dispatched).toBe(false);

    const failedCall = mockSaveWorkflowExecution.mock.calls.find(
      (call: unknown[]) => (call[0] as { status: string }).status === WorkflowStatus.FAILED
    );
    expect(failedCall).toBeDefined();
    expect((failedCall![0] as { error: string }).error).toContain('Policy violations');
  });

  it('handles gate failure', async () => {
    const failedGateResult = {
      allPassed: false,
      gates: [{ gate: 'test', passed: false, output: 'Test failed', durationMs: 100 }],
      totalDurationMs: 100,
    };
    mockExecuteWithGateRetry.mockResolvedValue({
      codeResult: { ...mockCodeResult, success: false, error: 'Gates failed' },
      gateResult: failedGateResult,
    });

    const result = await processBugFix(mockEvent, null, 'int');

    expect(result.dispatched).toBe(false);
  });

  it('continues when initial DB save fails', async () => {
    mockSaveWorkflowExecution
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValue(undefined);

    const result = await processBugFix(mockEvent, null, 'int');

    // Should still attempt to run the workflow
    expect(mockExecuteWithGateRetry).toHaveBeenCalled();
  });

  it('returns dispatched: false when no working directory is available', async () => {
    delete process.env.WORK_REPO_LOCAL_PATH;

    const result = await processBugFix(mockEvent, null, 'int');

    expect(result.dispatched).toBe(false);
    expect(mockExecuteWithGateRetry).not.toHaveBeenCalled();
  });
});
