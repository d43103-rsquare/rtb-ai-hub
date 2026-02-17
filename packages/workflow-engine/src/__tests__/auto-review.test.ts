import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowStatus, WorkflowType, AgentPersona } from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent } from '@rtb-ai-hub/shared';

const mockGenerateText = vi.fn();
const mockCalculateCost = vi.fn();
const mockSaveWorkflowExecution = vi.fn();
const mockSaveAICost = vi.fn();
const mockDebateRun = vi.fn();

vi.mock('@rtb-ai-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rtb-ai-hub/shared')>();
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('test-id-123'),
    createLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

vi.mock('../clients/anthropic', () => {
  class MockAnthropicClient {
    generateText = mockGenerateText;
    calculateCost = mockCalculateCost;
  }
  return {
    AnthropicClient: MockAnthropicClient,
    anthropicClient: new MockAnthropicClient(),
  };
});

vi.mock('../clients/database', () => ({
  database: {
    saveWorkflowExecution: mockSaveWorkflowExecution,
    saveAICost: mockSaveAICost,
  },
}));

vi.mock('../clients/mcp-helper', () => ({
  createGitHubReview: vi.fn().mockResolvedValue({ success: true }),
  createGitHubReviewComment: vi.fn().mockResolvedValue({ success: true }),
  getGitHubRepo: vi.fn().mockReturnValue({ owner: 'test-org', repo: 'test-repo' }),
}));

vi.mock('../debate/engine', () => ({
  createDebateEngine: vi.fn(() => ({
    run: mockDebateRun,
  })),
}));

vi.mock('../debate/debate-store', () => ({
  createDebateStore: vi.fn(() => ({})),
}));

const mockEvent: GitHubWebhookEvent = {
  source: 'github',
  type: 'pull_request',
  repository: 'org/repo',
  prNumber: 42,
  prTitle: 'Add authentication',
  branch: 'feature/auth',
  sha: 'abc123',
  timestamp: new Date().toISOString(),
  payload: { action: 'opened' },
};

const mockDebateSession = {
  id: 'debate-session-1',
  turns: [
    {
      agentPersona: AgentPersona.BACKEND_DEVELOPER,
      content: 'Code looks good overall',
      artifacts: [
        {
          content: JSON.stringify({
            summary: 'Code looks good overall',
            approved: true,
            comments: [
              {
                file: 'src/auth.ts',
                line: 10,
                comment: 'Consider adding error handling',
                severity: 'suggestion',
              },
            ],
            suggestions: ['Add unit tests'],
          }),
        },
      ],
    },
  ],
  outcome: {
    status: 'consensus',
    decision: 'Approved with minor suggestions',
  },
  totalCostUsd: 0.0045,
};

describe('processAutoReview', () => {
  let processAutoReview: typeof import('../workflows/auto-review').processAutoReview;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDebateRun.mockResolvedValue(mockDebateSession);
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        summary: 'Code looks good overall',
        approved: true,
        comments: [
          {
            file: 'src/auth.ts',
            line: 10,
            comment: 'Consider adding error handling',
            severity: 'suggestion',
          },
        ],
        suggestions: ['Add unit tests'],
      }),
      model: 'claude-sonnet-4-20250514',
      tokensUsed: { input: 500, output: 200 },
      finishReason: 'end_turn',
    });
    mockCalculateCost.mockReturnValue(0.0045);
    mockSaveWorkflowExecution.mockResolvedValue(undefined);
    mockSaveAICost.mockResolvedValue(undefined);

    const mod = await import('../workflows/auto-review');
    processAutoReview = mod.processAutoReview;
  });

  it('successfully executes with debate engine', async () => {
    const result = await processAutoReview(mockEvent, null);

    expect(result.success).toBe(true);
    expect(result.executionId).toBe('test-id-123');
    expect(result.review.approved).toBe(true);
    expect(result.review.summary).toBe('Code looks good overall');
    expect(result.review.comments).toHaveLength(1);
    expect(result.cost).toBe(0.0045);
    expect(typeof result.duration).toBe('number');
  });

  it('falls back to single AI call when debate fails', async () => {
    mockDebateRun.mockRejectedValue(new Error('Debate engine unavailable'));

    const result = await processAutoReview(mockEvent, null);

    expect(result.success).toBe(true);
    expect(result.review.approved).toBe(true);
    expect(result.review.summary).toBe('Code looks good overall');
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('falls back handles non-JSON AI response (raw text)', async () => {
    mockDebateRun.mockRejectedValue(new Error('Debate engine unavailable'));
    mockGenerateText.mockResolvedValue({
      text: 'This is a plain text review without JSON formatting.',
      model: 'claude-sonnet-4-20250514',
      tokensUsed: { input: 500, output: 200 },
      finishReason: 'end_turn',
    });

    const result = await processAutoReview(mockEvent, null);

    expect(result.success).toBe(true);
    expect(result.review.summary).toBe('This is a plain text review without JSON formatting.');
    expect(result.review.approved).toBe(false);
    expect(result.review.comments).toEqual([]);
    expect(result.review.suggestions).toEqual([]);
  });

  it('uses shared env-based API key for all users', async () => {
    const result = await processAutoReview(mockEvent, 'user-123');
    expect(result.success).toBe(true);
    expect(mockDebateRun).toHaveBeenCalledTimes(1);
  });

  it('saves workflow execution on start and on completion', async () => {
    await processAutoReview(mockEvent, null);

    expect(mockSaveWorkflowExecution).toHaveBeenCalledTimes(2);

    const firstCall = mockSaveWorkflowExecution.mock.calls[0][0];
    expect(firstCall.status).toBe(WorkflowStatus.IN_PROGRESS);
    expect(firstCall.type).toBe(WorkflowType.AUTO_REVIEW);
    expect(firstCall.id).toBe('test-id-123');

    const secondCall = mockSaveWorkflowExecution.mock.calls[1][0];
    expect(secondCall.status).toBe(WorkflowStatus.COMPLETED);
    expect(secondCall.type).toBe(WorkflowType.AUTO_REVIEW);
    expect(secondCall.output).toBeDefined();
    expect(secondCall.completedAt).toBeInstanceOf(Date);
    expect(typeof secondCall.duration).toBe('number');
  });

  it('handles errors and saves failed execution', async () => {
    const error = new Error('Fatal debate error');
    mockDebateRun.mockRejectedValue(error);
    mockGenerateText.mockRejectedValue(error);

    await expect(processAutoReview(mockEvent, 'user-456')).rejects.toThrow(
      'Fatal debate error'
    );

    const failedCall = mockSaveWorkflowExecution.mock.calls.find(
      (call: unknown[]) => (call[0] as { status: string }).status === WorkflowStatus.FAILED
    );
    expect(failedCall).toBeDefined();
    const failedExecution = failedCall![0] as {
      error: string;
      type: string;
      completedAt: Date;
    };
    expect(failedExecution.error).toBe('Fatal debate error');
    expect(failedExecution.type).toBe(WorkflowType.AUTO_REVIEW);
    expect(failedExecution.completedAt).toBeInstanceOf(Date);
  });

  it('passes correct debate config', async () => {
    await processAutoReview(mockEvent, null);

    expect(mockDebateRun).toHaveBeenCalledTimes(1);
    const [config] = mockDebateRun.mock.calls[0];
    expect(config.participants).toEqual([
      AgentPersona.BACKEND_DEVELOPER,
      AgentPersona.QA,
      AgentPersona.DEVOPS,
    ]);
    expect(config.moderator).toBe(AgentPersona.BACKEND_DEVELOPER);
    expect(config.consensusRequired).toBe(true);
    expect(config.topic).toContain('org/repo');
    expect(config.topic).toContain('#42');
    expect(config.topic).toContain('Add authentication');
  });
});
