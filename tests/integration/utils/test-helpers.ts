export interface TestEnvironment {
  gatewayUrl: string;
  rtbHubUrl: string;
  hooksToken: string;
  slackBotToken: string;
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  const env: TestEnvironment = {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3000',
    rtbHubUrl: process.env.RTB_HUB_URL || 'http://localhost:4000',
    hooksToken: process.env.OPENCLAW_HOOKS_TOKEN || 'test-token',
    slackBotToken: process.env.SLACK_BOT_TOKEN || 'xoxb-test-token',
  };

  const maxRetries = 30;
  const retryDelay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${env.gatewayUrl}/health`);
      if (response.status === 200) {
        return env;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Gateway health check failed after ${maxRetries} attempts`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  throw new Error('Failed to connect to OpenClaw Gateway');
}

export async function teardownTestEnvironment(env: TestEnvironment): Promise<void> {}

export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

export async function waitForWorkflow(
  workflowId: string,
  rtbHubUrl: string,
  timeoutMs: number = 60000
): Promise<{ status: string; result?: any }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${rtbHubUrl}/api/workflows/${workflowId}`);
      if (response.status === 200) {
        const data = await response.json();
        if (data.status === 'completed' || data.status === 'failed') {
          return { status: data.status, result: data.result };
        }
      }
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Workflow ${workflowId} did not complete within ${timeoutMs}ms`);
}
