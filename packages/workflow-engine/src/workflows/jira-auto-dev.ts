import {
  createLogger,
  DEFAULT_ENVIRONMENT,
  WorkflowType,
  WorkflowStatus,
  generateId,
} from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { updateContext } from '../utils/context-engine';

const logger = createLogger('jira-auto-dev-workflow');

export async function processJiraAutoDev(
  event: JiraWebhookEvent,
  _userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<{ dispatched: boolean; workflowExecutionId?: string }> {
  const issueKey = event.issueKey || event.payload?.issue?.key || 'UNKNOWN';
  const summary = event.payload?.issue?.fields?.summary || event.payload?.summary || 'No summary';
  const labels: string[] = event.payload?.issue?.fields?.labels || [];
  const components: Array<{ name: string }> = event.payload?.issue?.fields?.components || [];

  logger.info(
    { issueKey, summary, env, labels, components: components.map((c) => c.name) },
    'Processing Jira auto-dev workflow — dispatching to OpenClaw agents'
  );

  let executionId: string | undefined;
  try {
    executionId = generateId('wf');
    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.JIRA_AUTO_DEV,
      status: WorkflowStatus.IN_PROGRESS,
      input: event,
      env,
      startedAt: new Date(),
    });
  } catch (dbError) {
    logger.warn(
      { error: dbError instanceof Error ? dbError.message : String(dbError) },
      'Failed to save workflow execution — continuing'
    );
  }

  try {
    await updateContext({
      jiraKey: issueKey,
      summary,
      env,
    });
  } catch (ctxError) {
    logger.warn(
      { error: ctxError instanceof Error ? ctxError.message : String(ctxError) },
      'Failed to update context — continuing'
    );
  }

  const dispatched = await dispatchToOpenClaw({
    issueKey,
    summary,
    env,
    labels,
    components: components.map((c) => c.name),
    executionId,
  });

  if (!dispatched) {
    logger.warn(
      { issueKey },
      'Failed to dispatch to OpenClaw — workflow will not proceed automatically'
    );

    logger.error({ issueKey, summary }, 'OpenClaw dispatch failed — manual intervention required');
  }

  return { dispatched, workflowExecutionId: executionId };
}

async function dispatchToOpenClaw(params: {
  issueKey: string;
  summary: string;
  env: Environment;
  labels: string[];
  components: string[];
  executionId?: string;
}): Promise<boolean> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const hooksToken = process.env.OPENCLAW_HOOKS_TOKEN;

  if (!gatewayUrl) {
    logger.warn('OPENCLAW_GATEWAY_URL not configured — cannot dispatch to agents');
    return false;
  }

  try {
    const payload = {
      type: 'workflow:trigger',
      agent: 'pm-agent',
      data: {
        action: 'start-jira-workflow',
        issueKey: params.issueKey,
        summary: params.summary,
        env: params.env,
        labels: params.labels,
        components: params.components,
        executionId: params.executionId,
        callbackUrl: `${process.env.RTB_API_URL || 'http://localhost:4000'}/webhooks/openclaw`,
        opencodeServerUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:3333',
      },
      metadata: {
        source: 'rtb-ai-hub',
        timestamp: new Date().toISOString(),
        correlationId: params.executionId || `jira-${params.issueKey}-${Date.now()}`,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (hooksToken) {
      headers['Authorization'] = `Bearer ${hooksToken}`;
    }

    const response = await fetch(`${gatewayUrl}/hooks/agent-task`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, issueKey: params.issueKey },
        'OpenClaw Gateway returned non-OK status'
      );
      return false;
    }

    logger.info(
      { issueKey: params.issueKey, env: params.env },
      'Successfully dispatched to OpenClaw PM Agent'
    );
    return true;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        issueKey: params.issueKey,
      },
      'Failed to dispatch to OpenClaw Gateway'
    );
    return false;
  }
}
