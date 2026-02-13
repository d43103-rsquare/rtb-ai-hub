import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('opencode-client');

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:3333';

export type OpenCodeTaskRequest = {
  subagent_type?: string;
  description: string;
  prompt: string;
  run_in_background?: boolean;
};

export type OpenCodeTaskResponse = {
  task_id?: string;
  session_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
};

export type OpenCodeHealthResponse = {
  status: string;
  server: string;
  opencode_cli_url: string;
  opencode_connected: boolean;
};

export async function checkOpenCodeHealth(): Promise<OpenCodeHealthResponse | null> {
  try {
    const response = await fetch(`${OPENCODE_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'OpenCode Server health check failed');
      return null;
    }

    return (await response.json()) as OpenCodeHealthResponse;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'OpenCode Server unreachable'
    );
    return null;
  }
}

export async function executeOpenCodeTask(
  request: OpenCodeTaskRequest
): Promise<OpenCodeTaskResponse> {
  logger.info(
    {
      description: request.description,
      agent: request.subagent_type || 'sisyphus',
      background: request.run_in_background || false,
    },
    'Sending task to OpenCode Server'
  );

  try {
    const response = await fetch(`${OPENCODE_SERVER_URL}/api/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(request.run_in_background ? 10000 : 300000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      logger.error({ status: response.status, error: errorText }, 'OpenCode Server returned error');
      return {
        session_id: '',
        status: 'failed',
        error: `OpenCode Server HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = (await response.json()) as OpenCodeTaskResponse;
    logger.info(
      { session_id: result.session_id, status: result.status },
      'OpenCode task response received'
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to execute OpenCode task');
    return {
      session_id: '',
      status: 'failed',
      error: message,
    };
  }
}

export async function getOpenCodeTaskStatus(taskId: string): Promise<OpenCodeTaskResponse | null> {
  try {
    const response = await fetch(`${OPENCODE_SERVER_URL}/api/task/${taskId}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn({ taskId, status: response.status }, 'Failed to get OpenCode task status');
      return null;
    }

    return (await response.json()) as OpenCodeTaskResponse;
  } catch (error) {
    logger.warn(
      { taskId, error: error instanceof Error ? error.message : String(error) },
      'Failed to reach OpenCode Server for task status'
    );
    return null;
  }
}

export async function isOpenCodeAvailable(): Promise<boolean> {
  const health = await checkOpenCodeHealth();
  return health !== null && health.opencode_connected === true;
}
