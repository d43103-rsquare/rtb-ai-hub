/**
 * OpenClaw Gateway Hooks for RTB Hub
 *
 * This module handles bidirectional communication between OpenClaw Gateway and RTB Hub.
 * It processes incoming webhook events from OpenClaw and routes them to appropriate
 * handlers within the RTB Hub system.
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('openclaw-hooks');

/**
 * OpenClaw Event Types
 */
export enum OpenClawEventType {
  AGENT_MESSAGE = 'agent:message',
  AGENT_HANDOFF = 'agent:handoff',
  AGENT_STATUS_CHANGE = 'agent:status_change',
  AGENT_DECISION = 'agent:decision',
  SLACK_MESSAGE = 'slack:message',
  SLACK_COMMAND = 'slack:command',
  WORKFLOW_START = 'workflow:start',
  WORKFLOW_COMPLETE = 'workflow:complete',
  WORKFLOW_ERROR = 'workflow:error',
}

/**
 * OpenClaw Webhook Payload Structure
 */
interface OpenClawWebhookPayload {
  eventType: OpenClawEventType;
  timestamp: string;
  source: string;
  agentId?: string;
  agentRole?: string;
  data: Record<string, unknown>;
  metadata?: {
    jiraKey?: string;
    slackChannel?: string;
    userId?: string;
    correlationId?: string;
  };
}

/**
 * Create OpenClaw webhook router
 */
export function createOpenClawRouter(): Router {
  const router = Router();

  /**
   * Health check endpoint
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'openclaw-hooks' });
  });

  /**
   * Main webhook endpoint for OpenClaw events
   */
  router.post('/webhooks/openclaw', async (req: Request, res: Response) => {
    try {
      const payload = req.body as OpenClawWebhookPayload;

      // Validate payload
      if (!payload.eventType || !payload.timestamp) {
        return res.status(400).json({
          error: 'Invalid payload',
          message: 'Missing required fields: eventType, timestamp',
        });
      }

      logger.info({
        msg: 'Received OpenClaw webhook',
        eventType: payload.eventType,
        agentId: payload.agentId,
        source: payload.source,
      });

      // Route event to appropriate handler
      const result = await handleOpenClawEvent(payload);

      res.status(200).json({
        success: true,
        handled: result,
      });
    } catch (error) {
      logger.error({
        msg: 'Failed to process OpenClaw webhook',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

/**
 * Handle OpenClaw events based on type
 */
async function handleOpenClawEvent(payload: OpenClawWebhookPayload): Promise<boolean> {
  switch (payload.eventType) {
    case OpenClawEventType.AGENT_MESSAGE:
      return handleAgentMessage(payload);

    case OpenClawEventType.AGENT_HANDOFF:
      return handleAgentHandoff(payload);

    case OpenClawEventType.AGENT_STATUS_CHANGE:
      return handleAgentStatusChange(payload);

    case OpenClawEventType.AGENT_DECISION:
      return handleAgentDecision(payload);

    case OpenClawEventType.SLACK_MESSAGE:
      return handleSlackMessage(payload);

    case OpenClawEventType.SLACK_COMMAND:
      return handleSlackCommand(payload);

    case OpenClawEventType.WORKFLOW_START:
      return handleWorkflowStart(payload);

    case OpenClawEventType.WORKFLOW_COMPLETE:
      return handleWorkflowComplete(payload);

    case OpenClawEventType.WORKFLOW_ERROR:
      return handleWorkflowError(payload);

    default:
      logger.warn({
        msg: 'Unknown OpenClaw event type',
        eventType: payload.eventType,
      });
      return false;
  }
}

/**
 * Handle agent message events
 */
async function handleAgentMessage(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing agent message',
    agentId: payload.agentId,
    agentRole: payload.agentRole,
    data: payload.data,
  });

  // TODO: Implement message routing logic
  // - Store message in context engine
  // - Notify relevant team members
  // - Update Jira if applicable

  return true;
}

/**
 * Handle agent handoff events
 */
async function handleAgentHandoff(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing agent handoff',
    fromAgent: payload.agentId,
    toAgent: payload.data.targetAgentId,
    context: payload.data.handoffContext,
  });

  // TODO: Implement handoff logic
  // - Update context_links with new agent assignment
  // - Send handoff notification to Slack
  // - Create handoff briefing for next agent

  return true;
}

/**
 * Handle agent status change events
 */
async function handleAgentStatusChange(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing agent status change',
    agentId: payload.agentId,
    oldStatus: payload.data.oldStatus,
    newStatus: payload.data.newStatus,
  });

  // TODO: Implement status tracking
  // - Update agent state in Redis
  // - Notify team of status changes
  // - Trigger workflow state updates if needed

  return true;
}

/**
 * Handle agent decision events
 */
async function handleAgentDecision(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing agent decision',
    agentId: payload.agentId,
    decisionType: payload.data.decisionType,
    confidence: payload.data.confidence,
  });

  // TODO: Implement decision journal integration
  // - Save decision to decision_journal table
  // - Tag with relevant metadata
  // - Send notification if high-confidence decision

  return true;
}

/**
 * Handle Slack message events from OpenClaw
 */
async function handleSlackMessage(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing Slack message from OpenClaw',
    channel: payload.metadata?.slackChannel,
    userId: payload.metadata?.userId,
  });

  // TODO: Implement Slack message handling
  // - Parse message content
  // - Route to appropriate agent or workflow
  // - Send response back via OpenClaw

  return true;
}

/**
 * Handle Slack command events from OpenClaw
 */
async function handleSlackCommand(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing Slack command',
    command: payload.data.command,
    args: payload.data.args,
  });

  // TODO: Implement command handling
  // - Parse command and arguments
  // - Execute corresponding action
  // - Return command response

  return true;
}

/**
 * Handle workflow start events
 */
async function handleWorkflowStart(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing workflow start',
    workflowId: payload.data.workflowId,
    workflowType: payload.data.workflowType,
  });

  // TODO: Implement workflow tracking
  // - Create workflow execution record
  // - Initialize agent pipeline
  // - Send start notification

  return true;
}

/**
 * Handle workflow complete events
 */
async function handleWorkflowComplete(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.info({
    msg: 'Processing workflow completion',
    workflowId: payload.data.workflowId,
    result: payload.data.result,
  });

  if (payload.agentRole === 'developer' && payload.data.branchName) {
    const branchName = payload.data.branchName as string;
    const workflowId = payload.data.workflowId as string | undefined;

    logger.info({ branchName, workflowId }, 'Triggering E2E test workflow');

    try {
      const workflowEngineUrl = process.env.WORKFLOW_ENGINE_URL || 'http://localhost:3001';

      const response = await fetch(`${workflowEngineUrl}/trigger-e2e`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchName,
          workflowId,
          jiraKey: payload.metadata?.jiraKey,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, branchName },
          'E2E test trigger returned non-OK status'
        );
      } else {
        logger.info({ branchName }, 'E2E tests successfully triggered');
      }
    } catch (triggerError) {
      logger.error(
        {
          error: triggerError instanceof Error ? triggerError.message : String(triggerError),
          branchName,
        },
        'Failed to trigger E2E tests'
      );
    }
  }

  return true;
}

/**
 * Handle workflow error events
 */
async function handleWorkflowError(payload: OpenClawWebhookPayload): Promise<boolean> {
  logger.error({
    msg: 'Processing workflow error',
    workflowId: payload.data.workflowId,
    error: payload.data.error,
    agentId: payload.agentId,
  });

  // TODO: Implement error handling
  // - Log error details
  // - Notify on-call if critical
  // - Trigger recovery workflow if applicable

  return true;
}
