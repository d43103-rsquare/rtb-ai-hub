import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForWorkflow,
} from '../utils/test-helpers';
import { mockScenario2 } from '../utils/mock-data';

describe('Scenario 2: Payment API Incident Response', () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
  let incidentId: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it('should detect incident and alert ops agent', async () => {
    const alert = {
      title: 'Payment API Error Rate Spike',
      priority: 'P1',
      service: 'payment-api',
      metric: 'error_rate',
      threshold: 5,
      currentValue: 15.3,
      duration: '5m',
    };

    const response = await fetch(`${env.rtbHubUrl}/webhooks/datadog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Token': env.hooksToken,
      },
      body: JSON.stringify(alert),
    });

    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data).toHaveProperty('incidentId');
    incidentId = data.incidentId;
  });

  it('should create Jira incident ticket', async () => {
    const result = await waitForWorkflow(incidentId, env.rtbHubUrl, 30000);
    expect(result.status).toBe('completed');

    const response = await fetch(`${env.rtbHubUrl}/api/incidents/${incidentId}`);
    expect(response.status).toBe(200);

    const incident = await response.json();
    expect(incident.jiraKey).toMatch(/INCIDENT-/);
    expect(incident.priority).toBe('P1');
  });

  it('should notify PM agent of incident', async () => {
    const response = await fetch(`${env.gatewayUrl}/agents/pm-agent/notifications`, {
      headers: {
        Authorization: `Bearer ${env.hooksToken}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    const incidentNotification = data.notifications.find((n: any) => n.incidentId === incidentId);

    expect(incidentNotification).toBeDefined();
    expect(incidentNotification.priority).toBe('P1');
  });

  it('should analyze logs with backend agent', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/incidents/${incidentId}/analysis`);
    expect(response.status).toBe(200);

    const analysis = await response.json();
    expect(analysis).toHaveProperty('rootCause');
    expect(analysis).toHaveProperty('affectedServices');
    expect(analysis.analyzedBy).toBe('backend-dev-agent');
  });

  it('should execute rollback via ops agent', async () => {
    const rollbackResponse = await fetch(`${env.rtbHubUrl}/api/incidents/${incidentId}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.hooksToken}`,
      },
    });

    expect(rollbackResponse.status).toBe(200);

    const result = await waitForWorkflow(incidentId, env.rtbHubUrl, 60000);
    expect(result.status).toBe('completed');
    expect(result.result.rollbackStatus).toBe('success');
  });

  it('should verify fix with QA agent', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/incidents/${incidentId}/verification`);
    expect(response.status).toBe(200);

    const verification = await response.json();
    expect(verification.status).toBe('verified');
    expect(verification.verifiedBy).toBe('qa-agent');
    expect(verification.testsPassed).toBe(true);
  });
});
