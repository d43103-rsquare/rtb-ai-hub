import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment } from '../utils/test-helpers';
import { mockScenario3 } from '../utils/mock-data';

describe('Scenario 3: New Hire Onboarding', () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;
  let onboardingId: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  it('should create onboarding plan with PM agent', async () => {
    const newHire = {
      name: '김신입',
      email: 'newhire@company.com',
      role: 'Backend Developer',
      startDate: '2026-02-01',
      team: 'Platform Team',
    };

    const response = await fetch(`${env.gatewayUrl}/agents/pm-agent/onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.hooksToken}`,
      },
      body: JSON.stringify(newHire),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('onboardingId');
    expect(data).toHaveProperty('plan');
    onboardingId = data.onboardingId;

    expect(data.plan.phases).toBeInstanceOf(Array);
    expect(data.plan.phases.length).toBeGreaterThanOrEqual(3);
  });

  it('should explain system architecture with system planner', async () => {
    const response = await fetch(
      `${env.gatewayUrl}/agents/system-planner-agent/onboarding/${onboardingId}/architecture`,
      {
        headers: {
          Authorization: `Bearer ${env.hooksToken}`,
        },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('overview');
    expect(data).toHaveProperty('components');
    expect(data).toHaveProperty('dataFlow');
    expect(data.materials).toBeInstanceOf(Array);
    expect(data.materials.length).toBeGreaterThan(0);
  });

  it('should setup development environment with ops agent', async () => {
    const response = await fetch(
      `${env.gatewayUrl}/agents/ops-agent/onboarding/${onboardingId}/environment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
        body: JSON.stringify({
          os: 'macOS',
          ide: 'VSCode',
          tools: ['Docker', 'Node.js', 'pnpm'],
        }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('setupScript');
    expect(data).toHaveProperty('environmentVariables');
    expect(data).toHaveProperty('repositoryAccess');
    expect(data.status).toBe('ready');
  });

  it('should explain design system with UX designer', async () => {
    const response = await fetch(
      `${env.gatewayUrl}/agents/ux-designer-agent/onboarding/${onboardingId}/design-system`,
      {
        headers: {
          Authorization: `Bearer ${env.hooksToken}`,
        },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('designTokens');
    expect(data).toHaveProperty('componentLibrary');
    expect(data).toHaveProperty('figmaLinks');
    expect(data.figmaLinks.length).toBeGreaterThan(0);
  });

  it('should assign first task through PM agent', async () => {
    const response = await fetch(
      `${env.gatewayUrl}/agents/pm-agent/onboarding/${onboardingId}/first-task`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.hooksToken}`,
        },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('jiraKey');
    expect(data).toHaveProperty('task');
    expect(data.task).toHaveProperty('summary');
    expect(data.task).toHaveProperty('description');
    expect(data.task).toHaveProperty('estimatedHours');
    expect(data.mentor).toBeDefined();
    expect(data.mentor.agentId).toBe('backend-dev-agent');
  });

  it('should track onboarding progress', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/onboarding/${onboardingId}/progress`, {
      headers: {
        Authorization: `Bearer ${env.hooksToken}`,
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('completedSteps');
    expect(data).toHaveProperty('totalSteps');
    expect(data).toHaveProperty('progress');
    expect(data.progress).toBeGreaterThanOrEqual(50);

    expect(data.completedSteps).toContain('plan_created');
    expect(data.completedSteps).toContain('architecture_explained');
    expect(data.completedSteps).toContain('environment_setup');
  });

  it('should send progress notifications to Slack', async () => {
    const response = await fetch(`${env.rtbHubUrl}/api/onboarding/${onboardingId}/notifications`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.notifications).toBeInstanceOf(Array);
    expect(data.notifications.length).toBeGreaterThanOrEqual(2);

    const progressNotification = data.notifications.find(
      (n: any) => n.type === 'onboarding-progress'
    );
    expect(progressNotification).toBeDefined();
    expect(progressNotification).toHaveProperty('slackMessageTs');
  });
});
