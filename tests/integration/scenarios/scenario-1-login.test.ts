import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  waitForWorkflow,
} from '../utils/test-helpers';
import { mockScenario1, mockJiraIssue } from '../utils/mock-data';

describe('Scenario 1: Login Feature Development', () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
  let workflowId: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it('should complete full login feature development workflow', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/workflows/jira-auto-dev`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.hooksToken}`,
      },
      body: JSON.stringify({
        jiraKey: mockJiraIssue.key,
        summary: mockJiraIssue.summary,
        description: mockJiraIssue.description,
        triggerAgent: 'pm-agent',
      }),
    });

    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data).toHaveProperty('workflowId');
    workflowId = data.workflowId;

    const result = await waitForWorkflow(workflowId, env.rtbHubUrl, 120000);
    expect(result.status).toBe('completed');
  }, 120000);

  it('should route work through all 7 agents', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/workflows/${workflowId}/agents`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.agents).toBeInstanceOf(Array);

    const agentIds = data.agents.map((a: any) => a.agentId);
    expect(agentIds).toContain('pm-agent');
    expect(agentIds).toContain('system-planner-agent');
    expect(agentIds).toContain('ux-designer-agent');
    expect(agentIds).toContain('ui-dev-agent');
    expect(agentIds).toContain('backend-dev-agent');
    expect(agentIds).toContain('qa-agent');
    expect(agentIds).toContain('ops-agent');
  });

  it('should create Jira subtasks for each role', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/context/${mockJiraIssue.key}`);
    expect(response.status).toBe(200);

    const context = await response.json();
    expect(context.subtasks).toBeInstanceOf(Array);
    expect(context.subtasks.length).toBeGreaterThanOrEqual(3);

    const assignees = context.subtasks.map((s: any) => s.assignee);
    expect(assignees).toContain('ux-designer-agent');
    expect(assignees).toContain('ui-dev-agent');
    expect(assignees).toContain('backend-dev-agent');
  });

  it('should generate PR with proper context', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/context/${mockJiraIssue.key}/prs`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.prs).toBeInstanceOf(Array);
    expect(data.prs.length).toBeGreaterThanOrEqual(1);

    const pr = data.prs[0];
    expect(pr.description).toContain(mockJiraIssue.key);
    expect(pr.description).toContain('Architecture');
    expect(pr.description).toContain('UX Design');
  });

  it('should send Slack notifications at each handoff', async () => {
    const response = await fetch(`${env.gatewayUrl}/webhooks/rtb-hub/history`, {
      headers: {
        Authorization: `Bearer ${env.hooksToken}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    const handoffEvents = data.events.filter((e: any) => e.eventType === 'rtb-pattern-completed');

    expect(handoffEvents.length).toBeGreaterThanOrEqual(3);
  });
});
