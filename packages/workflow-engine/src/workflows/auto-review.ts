import {
  createLogger,
  generateId,
  WorkflowStatus,
  WorkflowType,
  AITier,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent, WorkflowExecution, Environment } from '@rtb-ai-hub/shared';
import { anthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';
import {
  createGitHubReview,
  createGitHubReviewComment,
  getGitHubRepo,
} from '../clients/mcp-helper';

const logger = createLogger('auto-review-workflow');

type ReviewAnalysis = {
  summary: string;
  approved: boolean;
  comments: Array<{
    file: string;
    line: number;
    comment: string;
    severity: 'critical' | 'warning' | 'suggestion';
  }>;
  suggestions: string[];
};

export async function processAutoReview(
  event: GitHubWebhookEvent,
  userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId, env }, 'Starting auto-review workflow');

  const aiClient = anthropicClient;

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.AUTO_REVIEW,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    env,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    const prompt = `
Analyze this GitHub Pull Request and provide a thorough code review.

Repository: ${event.repository}
PR #${event.prNumber}: ${event.prTitle}
Branch: ${event.branch}
Commit SHA: ${event.sha}

PR Payload:
${JSON.stringify(event.payload, null, 2)}

Please review the code changes for:
1. Code quality and maintainability
2. Security vulnerabilities
3. Performance issues
4. Best practices and design patterns
5. Potential bugs or edge cases

Format your response as JSON:
{
  "summary": "Overall review summary",
  "approved": true/false,
  "comments": [
    { "file": "path/to/file", "line": 42, "comment": "...", "severity": "critical|warning|suggestion" }
  ],
  "suggestions": ["..."]
}
`;

    const aiResponse = await aiClient.generateText(prompt, {
      tier: AITier.MEDIUM,
      maxTokens: 3000,
      systemPrompt:
        'You are an expert code reviewer focused on code quality, security vulnerabilities, performance issues, and best practices.',
    });

    logger.info({ executionId, tokensUsed: aiResponse.tokensUsed }, 'AI analysis complete');

    let review: ReviewAnalysis;
    try {
      const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        review = JSON.parse(jsonMatch[0]);
      } else {
        review = {
          summary: aiResponse.text,
          approved: false,
          comments: [],
          suggestions: [],
        };
      }
    } catch (parseError) {
      logger.warn({ parseError }, 'Failed to parse AI response as JSON, using raw text');
      review = {
        summary: aiResponse.text,
        approved: false,
        comments: [],
        suggestions: [],
      };
    }

    const cost = aiClient.calculateCost(
      aiResponse.tokensUsed.input,
      aiResponse.tokensUsed.output,
      aiResponse.model
    );

    await database.saveAICost({
      id: generateId('cost'),
      workflowExecutionId: executionId,
      model: aiResponse.model,
      tokensInput: aiResponse.tokensUsed.input,
      tokensOutput: aiResponse.tokensUsed.output,
      costUsd: cost,
    });

    const mcpResults = await executeGitHubReviewMcpCalls(env, event, review);

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.AUTO_REVIEW,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: { review, mcpResults },
      userId,
      env,
      aiModel: aiResponse.model,
      tokensUsed: aiResponse.tokensUsed,
      costUsd: cost,
      startedAt,
      completedAt,
      duration,
    };

    await database.saveWorkflowExecution(finalExecution);

    logger.info(
      {
        executionId,
        approved: review.approved,
        commentCount: review.comments.length,
        reviewPosted: mcpResults.reviewPosted,
        cost,
      },
      'auto-review workflow completed'
    );

    return {
      success: true,
      executionId,
      review,
      mcpResults,
      cost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'auto-review workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.AUTO_REVIEW,
      status: WorkflowStatus.FAILED,
      input: event,
      userId,
      env,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      completedAt,
      duration,
    });

    throw error;
  }
}

async function executeGitHubReviewMcpCalls(
  env: Environment,
  event: GitHubWebhookEvent,
  review: ReviewAnalysis
) {
  const { owner, repo } = getGitHubRepo(env);
  const prNumber = event.prNumber;

  if (!owner || !repo || !prNumber) {
    logger.warn(
      { owner, repo, prNumber, env },
      'GitHub repo or PR number not available — skipping MCP review calls'
    );
    return { reviewPosted: false, commentsPosted: 0, error: 'Missing repo or PR info' };
  }

  let commentsPosted = 0;

  for (const comment of review.comments) {
    const result = await createGitHubReviewComment(env, {
      owner,
      repo,
      pullNumber: prNumber,
      body: `[${comment.severity.toUpperCase()}] ${comment.comment}`,
      path: comment.file,
      line: comment.line,
    });

    if (result.success) {
      commentsPosted++;
    } else {
      logger.warn(
        { file: comment.file, line: comment.line, error: result.error },
        'Failed to post inline review comment via MCP'
      );
    }
  }

  const reviewEvent = review.approved ? 'APPROVE' : 'REQUEST_CHANGES';
  const reviewBody = [
    `## AI Code Review\n\n${review.summary}`,
    review.suggestions.length > 0
      ? `\n### Suggestions\n${review.suggestions.map((s) => `- ${s}`).join('\n')}`
      : '',
  ].join('');

  const reviewResult = await createGitHubReview(env, {
    owner,
    repo,
    pullNumber: prNumber,
    event: reviewEvent as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: reviewBody,
  });

  return {
    reviewPosted: reviewResult.success,
    reviewError: reviewResult.success ? null : reviewResult.error,
    commentsPosted,
    commentsFailed: review.comments.length - commentsPosted,
  };
}
