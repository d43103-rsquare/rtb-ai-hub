import {
  createLogger,
  generateId,
  WorkflowStatus,
  WorkflowType,
  AITier,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { DatadogWebhookEvent, WorkflowExecution, Environment } from '@rtb-ai-hub/shared';
import { anthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';
import { createJiraIssue, getJiraProjectKey } from '../clients/mcp-helper';

const logger = createLogger('incident-to-jira-workflow');

type IncidentAnalysis = {
  rootCause: { summary: string; analysis: string; confidence: string };
  jiraTicket: {
    summary: string;
    description: string;
    priority: string;
    component: string;
    labels: string[];
  };
  investigation: Array<{ step: number; action: string; command: string; expectedOutcome: string }>;
  runbook: Array<{ action: string; description: string; automated: boolean }>;
};

export async function processIncidentToJira(
  event: DatadogWebhookEvent,
  userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId, env }, 'Starting incident-to-jira workflow');

  const aiClient = anthropicClient;

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.INCIDENT_TO_JIRA,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    env,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    const prompt = `
Analyze this Datadog alert and generate a Jira bug ticket with root cause analysis.

Alert ID: ${event.alertId}
Title: ${event.title}
Message: ${event.message}
Priority: ${event.priority}
Event Type: ${event.type}
Service: ${event.service || 'Unknown'}

Alert Payload:
${JSON.stringify(event.payload, null, 2)}

Please provide:
1. Root cause analysis based on the alert context
2. A Jira bug ticket with summary, description, priority, and component
3. Investigation steps for the on-call engineer
4. Suggested runbook actions

Format your response as JSON:
{
  "rootCause": {
    "summary": "...",
    "analysis": "...",
    "confidence": "low|medium|high"
  },
  "jiraTicket": {
    "summary": "...",
    "description": "...",
    "priority": "P1|P2|P3",
    "component": "...",
    "labels": ["..."]
  },
  "investigation": [
    {
      "step": 1,
      "action": "...",
      "command": "...",
      "expectedOutcome": "..."
    }
  ],
  "runbook": [
    {
      "action": "...",
      "description": "...",
      "automated": true/false
    }
  ]
}
`;

    const aiResponse = await aiClient.generateText(prompt, {
      tier: AITier.MEDIUM,
      maxTokens: 2500,
      systemPrompt:
        'You are an expert SRE and incident responder who performs root cause analysis and creates actionable Jira tickets from monitoring alerts.',
    });

    logger.info({ executionId, tokensUsed: aiResponse.tokensUsed }, 'AI analysis complete');

    let incident: IncidentAnalysis;
    try {
      const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        incident = JSON.parse(jsonMatch[0]);
      } else {
        incident = {
          rootCause: { summary: event.title, analysis: aiResponse.text, confidence: 'low' },
          jiraTicket: {
            summary: event.title,
            description: aiResponse.text,
            priority: event.priority,
            component: event.service || 'Unknown',
            labels: ['incident'],
          },
          investigation: [],
          runbook: [],
        };
      }
    } catch (parseError) {
      logger.warn({ parseError }, 'Failed to parse AI response as JSON, using raw text');
      incident = {
        rootCause: { summary: event.title, analysis: aiResponse.text, confidence: 'low' },
        jiraTicket: {
          summary: event.title,
          description: aiResponse.text,
          priority: event.priority,
          component: event.service || 'Unknown',
          labels: ['incident'],
        },
        investigation: [],
        runbook: [],
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

    const mcpResults = await executeIncidentJiraMcpCalls(env, event, incident);

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.INCIDENT_TO_JIRA,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: { incident, mcpResults },
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
        rootCauseSummary: incident.rootCause.summary,
        jiraTicketSummary: incident.jiraTicket.summary,
        issueCreated: mcpResults.issueCreated,
        cost,
      },
      'incident-to-jira workflow completed'
    );

    return {
      success: true,
      executionId,
      incident,
      mcpResults,
      cost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'incident-to-jira workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.INCIDENT_TO_JIRA,
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

async function executeIncidentJiraMcpCalls(
  env: Environment,
  event: DatadogWebhookEvent,
  incident: IncidentAnalysis
) {
  const projectKey = getJiraProjectKey(env);
  const ticket = incident.jiraTicket;

  const jiraPriority =
    ticket.priority === 'P1' ? 'Highest' : ticket.priority === 'P2' ? 'High' : 'Medium';

  const description = [
    `## Root Cause Analysis\n`,
    `**Confidence:** ${incident.rootCause.confidence}`,
    `**Summary:** ${incident.rootCause.summary}\n`,
    incident.rootCause.analysis,
    `\n## Alert Details\n`,
    `- **Alert ID:** ${event.alertId}`,
    `- **Service:** ${event.service || 'Unknown'}`,
    `- **Priority:** ${event.priority}`,
    `- **Message:** ${event.message}`,
    incident.investigation.length > 0
      ? `\n## Investigation Steps\n${incident.investigation.map((s) => `${s.step}. **${s.action}**\n   Command: \`${s.command}\`\n   Expected: ${s.expectedOutcome}`).join('\n')}`
      : '',
    incident.runbook.length > 0
      ? `\n## Runbook\n${incident.runbook.map((r) => `- **${r.action}** ${r.automated ? '(automated)' : '(manual)'}: ${r.description}`).join('\n')}`
      : '',
  ].join('\n');

  const result = await createJiraIssue(env, {
    projectKey,
    issueType: 'Bug',
    summary: ticket.summary,
    description,
    priority: jiraPriority,
    labels: [...(ticket.labels || []), 'incident', `datadog-${event.priority.toLowerCase()}`],
  });

  if (result.success) {
    logger.info({ issueKey: result.data.key }, 'Jira incident Bug created via MCP');
  } else {
    logger.warn({ error: result.error }, 'Failed to create Jira incident Bug via MCP');
  }

  return {
    issueCreated: result.success,
    issueKey: result.success ? result.data.key : null,
    issueError: result.success ? null : result.error,
  };
}
