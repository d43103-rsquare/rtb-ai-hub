import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment, waitFor } from '../utils/test-helpers';

/**
 * Agent routing and response tests
 */
describe('Agent Routing Tests', () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  describe('PM Agent', () => {
    it('should respond to project queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/pm-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'What is the current sprint status?',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('pm-agent');
    });
  });

  describe('System Planner Agent', () => {
    it('should respond to architecture queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/system-planner-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'Design a login system architecture',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('system-planner-agent');
    });
  });

  describe('UX Designer Agent', () => {
    it('should respond to UX queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/ux-designer-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'Design user flow for login',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('ux-designer-agent');
    });
  });

  describe('UI Developer Agent', () => {
    it('should respond to UI queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/ui-dev-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'Create login form component',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('ui-dev-agent');
    });
  });

  describe('Backend Developer Agent', () => {
    it('should respond to backend queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/backend-dev-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'Create login API endpoint',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('backend-dev-agent');
    });
  });

  describe('QA Agent', () => {
    it('should respond to testing queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/qa-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'Write test cases for login',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('qa-agent');
    });
  });

  describe('Ops Agent', () => {
    it('should respond to infrastructure queries', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/ops-agent/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          message: 'Check deployment status',
          context: { channel: 'test' },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data.agent).toBe('ops-agent');
    });
  });
});
