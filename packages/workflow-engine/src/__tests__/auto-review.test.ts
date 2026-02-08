import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowStatus, WorkflowType, AITier } from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent } from '@rtb-ai-hub/shared';

const mockGenerateText = vi.fn();
const mockCalculateCost = vi.fn();
const mockSaveWorkflowExecution = vi.fn();
const mockSaveAICost = vi.fn();
const mockGetApiKey = vi.fn();

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

vi.mock('../clients/anthropic', () => ({
  anthropicClient: {
    generateText: mockGenerateText,
    calculateCost: mockCalculateCost,
  },
  AnthropicClient: class MockAnthropicClient {
    generateText = mockGenerateText;
    calculateCost = mockCalculateCost;
  },
}));

vi.mock('../clients/database', () => ({
  database: {
    saveWorkflowExecution: mockSaveWorkflowExecution,
    saveAICost: mockSaveAICost,
  },
}));

vi.mock('../credential/credential-manager', () => {
  return {
    CredentialManager: class MockCredentialManager {
      getApiKey = mockGetApiKey;
    },
  };
});

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

const mockAIResponse = {
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
};

describe('processAutoReview', () => {
  let processAutoReview: typeof import('../workflows/auto-review').processAutoReview;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue(mockAIResponse);
    mockCalculateCost.mockReturnValue(0.0045);
    mockSaveWorkflowExecution.mockResolvedValue(undefined);
    mockSaveAICost.mockResolvedValue(undefined);

    const mod = await import('../workflows/auto-review');
    processAutoReview = mod.processAutoReview;
  });

  it('successfully executes with mocked AI response (JSON parseable)', async () => {
    const result = await processAutoReview(mockEvent, null);

    expect(result.success).toBe(true);
    expect(result.executionId).toBe('test-id-123');
    expect(result.review.approved).toBe(true);
    expect(result.review.summary).toBe('Code looks good overall');
    expect(result.review.comments).toHaveLength(1);
    expect(result.cost).toBe(0.0045);
    expect(typeof result.duration).toBe('number');
  });

  it('handles non-JSON AI response (falls back to raw text)', async () => {
    mockGenerateText.mockResolvedValue({
      ...mockAIResponse,
      text: 'This is a plain text review without JSON formatting.',
    });

    const result = await processAutoReview(mockEvent, null);

    expect(result.success).toBe(true);
    expect(result.review.summary).toBe('This is a plain text review without JSON formatting.');
    expect(result.review.approved).toBe(false);
    expect(result.review.comments).toEqual([]);
    expect(result.review.suggestions).toEqual([]);
  });

  it('uses user-specific API key when userId provided', async () => {
    mockGetApiKey.mockResolvedValue('user-specific-key');

    await processAutoReview(mockEvent, 'user-123');

    expect(mockGetApiKey).toHaveBeenCalledWith('user-123', 'anthropic');
  });

  it('falls back to default client when user key retrieval fails', async () => {
    mockGetApiKey.mockRejectedValue(new Error('API key not found'));

    const result = await processAutoReview(mockEvent, 'user-123');

    expect(result.success).toBe(true);
    expect(mockGetApiKey).toHaveBeenCalledWith('user-123', 'anthropic');
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

  it('saves AI cost record', async () => {
    await processAutoReview(mockEvent, null);

    expect(mockSaveAICost).toHaveBeenCalledTimes(1);
    expect(mockSaveAICost).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-123',
        workflowExecutionId: 'test-id-123',
        model: 'claude-sonnet-4-20250514',
        tokensInput: 500,
        tokensOutput: 200,
        costUsd: 0.0045,
      })
    );
  });

  it('handles errors and saves failed execution', async () => {
    const error = new Error('AI service unavailable');
    mockGenerateText.mockRejectedValue(error);

    await expect(processAutoReview(mockEvent, 'user-456')).rejects.toThrow(
      'AI service unavailable'
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
    expect(failedExecution.error).toBe('AI service unavailable');
    expect(failedExecution.type).toBe(WorkflowType.AUTO_REVIEW);
    expect(failedExecution.completedAt).toBeInstanceOf(Date);
  });

  it('calls AI with correct parameters', async () => {
    await processAutoReview(mockEvent, null);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const [prompt, options] = mockGenerateText.mock.calls[0];
    expect(prompt).toContain('org/repo');
    expect(prompt).toContain('#42');
    expect(prompt).toContain('Add authentication');
    expect(options.tier).toBe(AITier.MEDIUM);
    expect(options.maxTokens).toBe(3000);
  });
});
