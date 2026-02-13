import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment, waitFor } from '../utils/test-helpers';

/**
 * Bidirectional communication tests between RTB Hub and OpenClaw Gateway
 */
describe('Bidirectional Communication Tests', () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  describe('Slack -> OpenClaw -> RTB Hub', () => {
    it('should route Slack message to RTB Hub', async () => {
      const slackEvent = {
        type: 'app_mention',
        user: 'U123456',
        text: '@RTB AI Assistant PROJ-123 status',
        channel: 'C123456',
        ts: '1234567890.123456',
      };

      const response = await fetch(`${env.gatewayUrl}/webhooks/slack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': env.hooksToken,
        },
        body: JSON.stringify(slackEvent),
      });

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data).toHaveProperty('received', true);
      expect(data).toHaveProperty('workflowId');
    });

    it('should route slash command to RTB Hub', async () => {
      const slashCommand = {
        command: '/rtb-ai',
        text: 'start PROJ-123',
        user_id: 'U123456',
        channel_id: 'C123456',
        response_url: 'https://hooks.slack.com/test',
      };

      const response = await fetch(`${env.gatewayUrl}/webhooks/slack/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': env.hooksToken,
        },
        body: JSON.stringify(slashCommand),
      });

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data).toHaveProperty('received', true);
    });
  });

  describe('RTB Hub -> OpenClaw -> Slack', () => {
    it('should send notification to Slack', async () => {
      const notification = {
        eventType: 'rtb-pattern-completed',
        timestamp: new Date().toISOString(),
        source: 'rtb-hub',
        data: {
          pattern: 'jira-to-dev',
          status: 'completed',
          jiraKey: 'PROJ-123',
          userId: 'U123456',
          message: 'Login feature development completed',
        },
      };

      const response = await fetch(`${env.gatewayUrl}/webhooks/rtb-hub`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': env.hooksToken,
        },
        body: JSON.stringify(notification),
      });

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data).toHaveProperty('received', true);
      expect(data).toHaveProperty('slackMessageTs');
    });

    it('should send context update to Slack', async () => {
      const contextUpdate = {
        eventType: 'rtb-translation-ready',
        timestamp: new Date().toISOString(),
        source: 'rtb-hub',
        data: {
          jiraKey: 'PROJ-123',
          translations: [
            { term: 'user', translation: '사용자' },
            { term: 'authentication', translation: '인증' },
          ],
          userId: 'U123456',
        },
      };

      const response = await fetch(`${env.gatewayUrl}/webhooks/rtb-hub`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': env.hooksToken,
        },
        body: JSON.stringify(contextUpdate),
      });

      expect(response.status).toBe(202);
    });
  });

  describe('Context Passing', () => {
    it('should maintain context across agents', async () => {
      const contextId = 'test-context-123';

      // Step 1: PM Agent creates context
      const pmResponse = await fetch(`${env.gatewayUrl}/agents/pm-agent/context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          contextId,
          data: {
            jiraKey: 'PROJ-123',
            summary: 'Login feature',
            requirements: ['OAuth', 'Session management'],
          },
        }),
      });

      expect(pmResponse.status).toBe(200);

      // Step 2: Developer Agent retrieves context
      const devResponse = await fetch(
        `${env.gatewayUrl}/agents/backend-dev-agent/context/${contextId}`,
        {
          headers: {
            Authorization: `Bearer ${env.hooksToken}`,
          },
        }
      );

      expect(devResponse.status).toBe(200);
      const context = await devResponse.json();
      expect(context.data.jiraKey).toBe('PROJ-123');
      expect(context.data.requirements).toContain('OAuth');
    });
  });

  describe('Event Callbacks', () => {
    it('should handle agent completion callback', async () => {
      const callback = {
        eventType: 'agent:completed',
        timestamp: new Date().toISOString(),
        source: 'openclaw',
        data: {
          agentId: 'pm-agent',
          taskId: 'task-123',
          result: {
            status: 'success',
            output: 'Jira ticket PROJ-123 updated',
          },
        },
      };

      const response = await fetch(`${env.rtbHubUrl}/webhooks/openclaw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': env.hooksToken,
        },
        body: JSON.stringify(callback),
      });

      expect(response.status).toBe(200);
    });
  });
});
