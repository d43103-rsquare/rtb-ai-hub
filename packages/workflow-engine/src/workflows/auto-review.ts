import { createLogger, generateId, WorkflowStatus, WorkflowType, AITier } from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent, WorkflowExecution } from '@rtb-ai-hub/shared';
import { anthropicClient, AnthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';
import { CredentialManager } from '../credential/credential-manager';

const logger = createLogger('auto-review-workflow');
const credentialManager = new CredentialManager();

export async function processAutoReview(
  event: GitHubWebhookEvent,
  userId: string | null
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId }, 'Starting auto-review workflow');

  let aiClient = anthropicClient;

  if (userId) {
    try {
      const anthropicKey = await credentialManager.getApiKey(userId, 'anthropic');
      aiClient = new AnthropicClient(anthropicKey);
      logger.info({ userId, executionId }, 'Using user-specific Anthropic API key');
    } catch (error) {
      logger.warn({ userId, error }, 'Failed to get user API key, falling back to default');
    }
  }

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.AUTO_REVIEW,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
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

    let review;
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

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.AUTO_REVIEW,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: review,
      userId,
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
        cost,
      },
      'auto-review workflow completed'
    );

    return {
      success: true,
      executionId,
      review,
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
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      completedAt,
      duration,
    });

    throw error;
  }
}
