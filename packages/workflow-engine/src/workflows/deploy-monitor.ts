import { createLogger, generateId, WorkflowStatus, WorkflowType, AITier } from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent, WorkflowExecution } from '@rtb-ai-hub/shared';
import { anthropicClient, AnthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';
import { CredentialManager } from '../credential/credential-manager';

const logger = createLogger('deploy-monitor-workflow');
const credentialManager = new CredentialManager();

export async function processDeployMonitor(
  event: GitHubWebhookEvent,
  userId: string | null
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId }, 'Starting deploy-monitor workflow');

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
    type: WorkflowType.DEPLOY_MONITOR,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    const prompt = `
Analyze this GitHub deployment and generate monitoring recommendations.

Repository: ${event.repository}
Branch: ${event.branch}
Commit SHA: ${event.sha}

Deployment Payload:
${JSON.stringify(event.payload, null, 2)}

Please provide:
1. Deployment context analysis
2. Potential risks based on the changes
3. Monitoring checklist (what metrics to watch)
4. Rollback criteria and thresholds

Format your response as JSON:
{
  "analysis": {
    "summary": "...",
    "riskLevel": "low|medium|high|critical",
    "affectedServices": ["..."]
  },
  "risks": [
    {
      "description": "...",
      "severity": "low|medium|high",
      "mitigation": "..."
    }
  ],
  "monitoringChecklist": [
    {
      "metric": "...",
      "threshold": "...",
      "duration": "...",
      "action": "..."
    }
  ],
  "rollbackCriteria": [
    {
      "condition": "...",
      "threshold": "...",
      "autoRollback": true/false
    }
  ]
}
`;

    const aiResponse = await aiClient.generateText(prompt, {
      tier: AITier.MEDIUM,
      maxTokens: 2000,
      systemPrompt:
        'You are an expert DevOps engineer specializing in deployment monitoring, risk assessment, and incident prevention.',
    });

    logger.info({ executionId, tokensUsed: aiResponse.tokensUsed }, 'AI analysis complete');

    let monitoring;
    try {
      const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        monitoring = JSON.parse(jsonMatch[0]);
      } else {
        monitoring = {
          analysis: { summary: aiResponse.text, riskLevel: 'medium', affectedServices: [] },
          risks: [],
          monitoringChecklist: [],
          rollbackCriteria: [],
        };
      }
    } catch (parseError) {
      logger.warn({ parseError }, 'Failed to parse AI response as JSON, using raw text');
      monitoring = {
        analysis: { summary: aiResponse.text, riskLevel: 'medium', affectedServices: [] },
        risks: [],
        monitoringChecklist: [],
        rollbackCriteria: [],
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
      type: WorkflowType.DEPLOY_MONITOR,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: monitoring,
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
        riskLevel: monitoring.analysis.riskLevel,
        checklistCount: monitoring.monitoringChecklist.length,
        cost,
      },
      'deploy-monitor workflow completed'
    );

    return {
      success: true,
      executionId,
      monitoring,
      cost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'deploy-monitor workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.DEPLOY_MONITOR,
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
