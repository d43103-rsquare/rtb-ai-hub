import express, { Request, Response } from 'express';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3333;
const OPENCODE_CLI_URL = process.env.OPENCODE_CLI_URL || 'http://localhost:4096';

app.use(express.json());

interface Task {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  session_id: string;
}

const tasks = new Map<string, Task>();

/**
 * POST /api/task
 *
 * OpenCode/Oh-My-OpenCode 에이전트를 사용하여 Task를 실행합니다.
 *
 * Request body:
 * {
 *   category?: string,              // 미사용 (OpenCode는 agent로 구분)
 *   subagent_type?: string,         // Oh-My-OpenCode 에이전트 이름
 *   load_skills?: string[],         // 미사용 (OpenCode가 자동 관리)
 *   description: string,            // Task 설명
 *   prompt: string,                 // 실제 프롬프트
 *   run_in_background?: boolean     // 비동기 실행 여부
 * }
 */
app.post('/api/task', async (req: Request, res: Response) => {
  const { subagent_type, description, prompt, run_in_background } = req.body;

  const taskId = uuidv4();
  const sessionId = uuidv4();

  const task: Task = {
    id: taskId,
    status: 'pending',
    session_id: sessionId,
  };

  tasks.set(taskId, task);

  console.log(`[OpenCode Server] Task ${taskId} created: ${description}`);
  console.log(`[OpenCode Server] Agent: ${subagent_type || 'sisyphus'}`);

  if (run_in_background) {
    res.json({
      task_id: taskId,
      session_id: sessionId,
      status: 'pending',
    });

    executeTask(taskId, sessionId, prompt, subagent_type).catch((error) => {
      console.error(`[OpenCode Server] Task ${taskId} failed:`, error);
      const task = tasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message;
      }
    });
  } else {
    try {
      task.status = 'running';
      const result = await executeTask(taskId, sessionId, prompt, subagent_type);

      res.json({
        session_id: sessionId,
        status: 'completed',
        result,
      });
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;

      res.status(500).json({
        session_id: sessionId,
        status: 'failed',
        error: error.message,
      });
    }
  }
});

/**
 * GET /api/task/:id
 *
 * Task 상태를 확인합니다.
 */
app.get('/api/task/:id', (req: Request, res: Response) => {
  const task = tasks.get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({
    task_id: task.id,
    session_id: task.session_id,
    status: task.status,
    result: task.result,
    error: task.error,
  });
});

/**
 * GET /health
 *
 * 서버 및 OpenCode CLI 연결 상태를 확인합니다.
 */
app.get('/health', async (_req: Request, res: Response) => {
  let opencodeConnected = false;

  try {
    const client = createOpencodeClient({ baseUrl: OPENCODE_CLI_URL });
    const sessionList = await client.session.list();
    opencodeConnected = !sessionList.error;
  } catch (error) {
    console.error('[OpenCode Server] OpenCode CLI connection failed:', error);
  }

  res.json({
    status: 'ok',
    server: 'opencode-sdk',
    opencode_cli_url: OPENCODE_CLI_URL,
    opencode_connected: opencodeConnected,
  });
});

/**
 * OpenCode SDK를 사용하여 실제 Task를 실행합니다.
 *
 * @param taskId - Task ID
 * @param sessionId - Session ID (OpenCode 세션과 매핑)
 * @param prompt - 실제 프롬프트
 * @param agent - Oh-My-OpenCode 에이전트 이름 (librarian, oracle, explore, sisyphus 등)
 */
async function executeTask(
  taskId: string,
  sessionId: string,
  prompt: string,
  agent?: string
): Promise<any> {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');

  task.status = 'running';

  console.log(`[OpenCode Server] Executing task ${taskId} with OpenCode...`);
  console.log(`[OpenCode Server] OpenCode CLI URL: ${OPENCODE_CLI_URL}`);

  try {
    // OpenCode 클라이언트 생성
    const client = createOpencodeClient({ baseUrl: OPENCODE_CLI_URL });

    // OpenCode 세션 생성
    const sessionResponse = await client.session.create({
      body: {
        title: `RTB Task ${taskId}`,
      },
    });

    if (sessionResponse.error) {
      throw new Error(`Failed to create session: ${JSON.stringify(sessionResponse.error)}`);
    }

    const opencodeSessionId = sessionResponse.data.id;
    console.log(`[OpenCode Server] OpenCode session created: ${opencodeSessionId}`);

    const messageResponse = await client.session.prompt({
      path: { id: opencodeSessionId },
      body: {
        agent: agent || 'sisyphus',
        system: `You are helping with RTB AI Hub workflow automation.
Task ID: ${taskId}
Session ID: ${sessionId}

Please provide a clear, actionable response.`,
        parts: [{ type: 'text', text: prompt }],
      },
    });

    if (messageResponse.error) {
      throw new Error(`Failed to send prompt: ${JSON.stringify(messageResponse.error)}`);
    }

    console.log(`[OpenCode Server] Message sent to agent: ${agent || 'sisyphus'}`);

    // 메시지 응답 수집
    const messages = await client.session.messages({
      path: { id: opencodeSessionId },
    });

    if (messages.error) {
      throw new Error(`Failed to get messages: ${JSON.stringify(messages.error)}`);
    }

    const assistantMessages = messages.data.filter((msg: any) => msg.info?.role === 'assistant');
    const lastMessage = assistantMessages[assistantMessages.length - 1];

    const result =
      lastMessage?.parts?.map((part: any) => (part.type === 'text' ? part.text : '')).join('\n') ||
      'No response';

    task.status = 'completed';
    task.result = result;

    console.log(`[OpenCode Server] Task ${taskId} completed`);

    return result;
  } catch (error: any) {
    console.error(`[OpenCode Server] Task execution failed:`, error);
    task.status = 'failed';
    task.error = error.message;
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`OpenCode Server running on http://localhost:${PORT}`);
  console.log(`OpenCode CLI URL: ${OPENCODE_CLI_URL}`);
  console.log(`\nSupported Oh-My-OpenCode agents:`);
  console.log(`  - sisyphus (default): General task execution`);
  console.log(`  - librarian: External documentation search`);
  console.log(`  - oracle: Architectural consultation`);
  console.log(`  - explorer: Internal codebase exploration`);
  console.log(`  - metis: Requirement clarification`);
  console.log(`  - momus: Work plan review`);
});
