import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment, waitFor } from '../utils/test-helpers';

/**
 * OpenClaw Gateway basic connection tests
 */
describe('OpenClaw Gateway Connection Tests', () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  describe('Health Check', () => {
    it('should return ok status', async () => {
      const response = await fetch(`${env.gatewayUrl}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('openclaw-gateway');
    });

    it('should return gateway info', async () => {
      const response = await fetch(`${env.gatewayUrl}/info`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('mode');
      expect(data).toHaveProperty('agents');
    });
  });

  describe('Configuration', () => {
    it('should load gateway configuration', async () => {
      const response = await fetch(`${env.gatewayUrl}/config`, {
        headers: {
          Authorization: `Bearer ${env.hooksToken}`,
        },
      });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config).toHaveProperty('gateway');
      expect(config).toHaveProperty('hooks');
      expect(config).toHaveProperty('agents');
      expect(config).toHaveProperty('channels');

      expect(config.gateway.mode).toBe('http');
      expect(config.agents.enabled).toBe(true);
      expect(config.agents.mode).toBe('multi');
      expect(config.agents.coordinator).toBe('pm-agent');
    });

    it('should reject invalid auth token', async () => {
      const response = await fetch(`${env.gatewayUrl}/config`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Agent Manifest', () => {
    it('should list all 7 agents', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.agents).toBeInstanceOf(Array);
      expect(data.agents).toHaveLength(7);

      const agentIds = data.agents.map((a: any) => a.id);
      expect(agentIds).toContain('pm-agent');
      expect(agentIds).toContain('system-planner-agent');
      expect(agentIds).toContain('ux-designer-agent');
      expect(agentIds).toContain('ui-dev-agent');
      expect(agentIds).toContain('backend-dev-agent');
      expect(agentIds).toContain('qa-agent');
      expect(agentIds).toContain('ops-agent');
    });

    it('should return agent details', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/pm-agent`);
      expect(response.status).toBe(200);

      const agent = await response.json();
      expect(agent).toHaveProperty('id', 'pm-agent');
      expect(agent).toHaveProperty('name', 'VisionKeeper');
      expect(agent).toHaveProperty('role', 'PM Agent');
      expect(agent).toHaveProperty('status');
      expect(agent).toHaveProperty('capabilities');
    });

    it('should return 404 for unknown agent', async () => {
      const response = await fetch(`${env.gatewayUrl}/agents/unknown-agent`);
      expect(response.status).toBe(404);
    });
  });
});
