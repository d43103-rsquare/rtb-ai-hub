import {
  createLogger,
  generateId,
  WorkflowStatus,
  WorkflowType,
  AITier,
} from '@rtb-ai-hub/shared';
import type { FigmaWebhookEvent, WorkflowExecution } from '@rtb-ai-hub/shared';
import { anthropicClient, AnthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';
import { CredentialManager } from '../credential/credential-manager';

const logger = createLogger('figma-to-jira-workflow');
const credentialManager = new CredentialManager();

export async function processFigmaToJira(
  event: FigmaWebhookEvent,
  userId: string | null
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId }, 'Starting figma-to-jira workflow');

  let aiClient = anthropicClient;

  if (userId) {
    try {
      const anthropicKey = await credentialManager.getApiKey(userId, 'anthropic');
      aiClient = new AnthropicClient(anthropicKey);
      logger.info({ userId, executionId }, 'Using user-specific Anthropic API key');
    } catch (error) {
      logger.warn(
        { userId, error },
        'Failed to get user API key, falling back to default'
      );
    }
  }

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.FIGMA_TO_JIRA,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    const prompt = `
Analyze this Figma design update and generate a Jira Epic with Sub-tasks.

Figma File: ${event.fileName} (${event.fileKey})
URL: ${event.fileUrl}
Event Type: ${event.type}

Please provide:
1. Epic Summary (one line)
2. Epic Description (detailed)
3. List of Sub-tasks with:
   - Task name
   - Description
   - Estimated story points (1-8)
   - Component type (Button, Form, Layout, etc.)

Format your response as JSON:
{
  "epic": {
    "summary": "...",
    "description": "..."
  },
  "subtasks": [
    {
      "name": "...",
      "description": "...",
      "storyPoints": 3,
      "componentType": "..."
    }
  ]
}
`;

    const aiResponse = await aiClient.generateText(prompt, {
      tier: AITier.HEAVY,
      maxTokens: 3000,
      systemPrompt: 'You are an expert at analyzing UI designs and creating development tasks.',
    });

    logger.info({ executionId, tokensUsed: aiResponse.tokensUsed }, 'AI analysis complete');

    let analysis;
    try {
      const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = { epic: { summary: 'Figma Design Update', description: aiResponse.text }, subtasks: [] };
      }
    } catch (parseError) {
      logger.warn({ parseError }, 'Failed to parse AI response as JSON, using raw text');
      analysis = { epic: { summary: 'Figma Design Update', description: aiResponse.text }, subtasks: [] };
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
      type: WorkflowType.FIGMA_TO_JIRA,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: analysis,
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
        epicSummary: analysis.epic.summary,
        subtaskCount: analysis.subtasks.length,
        cost,
      },
      'figma-to-jira workflow completed'
    );

    return {
      success: true,
      executionId,
      analysis,
      cost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'figma-to-jira workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.FIGMA_TO_JIRA,
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
