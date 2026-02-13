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
import { createDatadogMonitor } from '../clients/mcp-helper';

const logger = createLogger('deploy-monitor-workflow');

type MonitoringAnalysis = {
  analysis: { summary: string; riskLevel: string; affectedServices: string[] };
  risks: Array<{ description: string; severity: string; mitigation: string }>;
  monitoringChecklist: Array<{
    metric: string;
    threshold: string;
    duration: string;
    action: string;
  }>;
  rollbackCriteria: Array<{ condition: string; threshold: string; autoRollback: boolean }>;
};

export async function processDeployMonitor(
  event: GitHubWebhookEvent,
  userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId, env }, 'Starting deploy-monitor workflow');

  const aiClient = anthropicClient;

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.DEPLOY_MONITOR,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    env,
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

    let monitoring: MonitoringAnalysis;
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

    const mcpResults = await executeDatadogMonitorMcpCalls(env, event, monitoring);

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.DEPLOY_MONITOR,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: { monitoring, mcpResults },
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
        riskLevel: monitoring.analysis.riskLevel,
        checklistCount: monitoring.monitoringChecklist.length,
        monitorsCreated: mcpResults.monitorsCreated,
        cost,
      },
      'deploy-monitor workflow completed'
    );

    return {
      success: true,
      executionId,
      monitoring,
      mcpResults,
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
      env,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      completedAt,
      duration,
    });

    throw error;
  }
}

async function executeDatadogMonitorMcpCalls(
  env: Environment,
  event: GitHubWebhookEvent,
  monitoring: MonitoringAnalysis
) {
  if (monitoring.monitoringChecklist.length === 0) {
    return { monitorsCreated: 0, monitorsAttempted: 0 };
  }

  let monitorsCreated = 0;
  const monitorResults: Array<{ metric: string; created: boolean; error?: string }> = [];

  for (const check of monitoring.monitoringChecklist) {
    const result = await createDatadogMonitor(env, {
      name: `[Deploy Monitor] ${event.repository} — ${check.metric}`,
      type: 'metric alert',
      query: `avg(last_5m):avg:${check.metric}{*} > ${check.threshold}`,
      message: [
        `Deploy monitor triggered for ${event.repository} (${event.branch})`,
        `Threshold: ${check.threshold}`,
        `Action: ${check.action}`,
        `SHA: ${event.sha}`,
      ].join('\n'),
      tags: [
        `repo:${event.repository}`,
        `branch:${event.branch || 'unknown'}`,
        `env:${env}`,
        'source:rtb-ai-hub',
      ],
    });

    if (result.success) {
      monitorsCreated++;
      monitorResults.push({ metric: check.metric, created: true });
    } else {
      monitorResults.push({ metric: check.metric, created: false, error: result.error });
      logger.warn(
        { metric: check.metric, error: result.error },
        'Failed to create Datadog monitor via MCP'
      );
    }
  }

  return {
    monitorsCreated,
    monitorsAttempted: monitoring.monitoringChecklist.length,
    monitorResults,
  };
}
