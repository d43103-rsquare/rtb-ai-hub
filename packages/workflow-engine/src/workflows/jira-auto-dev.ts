import { createLogger, generateId, WorkflowStatus, WorkflowType, AITier } from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent, WorkflowExecution } from '@rtb-ai-hub/shared';
import { anthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';

const logger = createLogger('jira-auto-dev-workflow');

export async function processJiraAutoDev(
  event: JiraWebhookEvent,
  userId: string | null
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId }, 'Starting jira-auto-dev workflow');

  const aiClient = anthropicClient;

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.JIRA_AUTO_DEV,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    const prompt = `
Analyze this Jira issue and generate a code implementation plan with React/TypeScript code.

Issue Key: ${event.issueKey}
Issue Type: ${event.issueType}
Status: ${event.status}
Summary: ${event.summary}
Description: ${event.description || 'No description provided'}

Issue Payload:
${JSON.stringify(event.payload, null, 2)}

Please provide:
1. Implementation plan with file structure
2. React/TypeScript component code based on the issue requirements
3. Suggested file paths and module organization
4. Test suggestions for the implementation

Format your response as JSON:
{
  "plan": {
    "summary": "...",
    "approach": "..."
  },
  "files": [
    {
      "path": "src/components/...",
      "code": "...",
      "description": "..."
    }
  ],
  "tests": [
    {
      "path": "src/__tests__/...",
      "description": "...",
      "testCases": ["..."]
    }
  ],
  "prSuggestion": {
    "title": "...",
    "description": "...",
    "branch": "..."
  }
}
`;

    const aiResponse = await aiClient.generateText(prompt, {
      tier: AITier.HEAVY,
      maxTokens: 4000,
      systemPrompt:
        'You are an expert React/TypeScript developer who generates clean, well-structured code implementations from Jira issue requirements.',
    });

    logger.info({ executionId, tokensUsed: aiResponse.tokensUsed }, 'AI analysis complete');

    let implementation;
    try {
      const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        implementation = JSON.parse(jsonMatch[0]);
      } else {
        implementation = {
          plan: { summary: event.summary, approach: aiResponse.text },
          files: [],
          tests: [],
          prSuggestion: {
            title: event.summary,
            description: aiResponse.text,
            branch: `feature/${event.issueKey.toLowerCase()}`,
          },
        };
      }
    } catch (parseError) {
      logger.warn({ parseError }, 'Failed to parse AI response as JSON, using raw text');
      implementation = {
        plan: { summary: event.summary, approach: aiResponse.text },
        files: [],
        tests: [],
        prSuggestion: {
          title: event.summary,
          description: aiResponse.text,
          branch: `feature/${event.issueKey.toLowerCase()}`,
        },
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
      type: WorkflowType.JIRA_AUTO_DEV,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: implementation,
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
        planSummary: implementation.plan.summary,
        fileCount: implementation.files.length,
        cost,
      },
      'jira-auto-dev workflow completed'
    );

    return {
      success: true,
      executionId,
      implementation,
      cost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'jira-auto-dev workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.JIRA_AUTO_DEV,
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
