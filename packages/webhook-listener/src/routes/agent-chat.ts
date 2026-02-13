import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';
import { optionalAuth, type AuthRequest } from '../middleware/auth';

const logger = createLogger('agent-chat-api');
const execFileAsync = promisify(execFile);

const OPENCLAW_CONTAINER = getEnv('OPENCLAW_CONTAINER_NAME', 'rtb-openclaw-gateway');
const DASHBOARD_URL = getEnv('DASHBOARD_URL', 'http://localhost:3000');
const AGENT_TIMEOUT_SEC = getEnv('AGENT_CHAT_TIMEOUT', '300');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AgentRunOpts {
  agentId: string;
  message: string;
  sessionId?: string;
  timeoutSec?: number;
}

interface AgentRunResult {
  text: string;
  meta?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

interface ParsedAgentResponse {
  payloads: { text?: string }[];
  meta?: Record<string, unknown>;
}

/**
 * Parse Gateway JSON stdout into structured payloads + meta.
 * Handles both `{ result: { payloads, meta } }` and flat `{ payloads }` shapes.
 */
function parseAgentResponse(stdout: string): ParsedAgentResponse {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { payloads: [{ text: stdout }] };
  }

  const result = (parsed.result as Record<string, unknown>) || parsed;
  const payloads = ((result.payloads || parsed.payloads) as { text?: string }[]) || [];
  const meta = (result.meta || parsed.meta) as Record<string, unknown> | undefined;

  return { payloads, meta };
}

/**
 * Run a single agent via `docker exec openclaw agent` and return parsed result.
 */
async function runAgent(opts: AgentRunOpts): Promise<AgentRunResult> {
  const { agentId, message, sessionId, timeoutSec = parseInt(AGENT_TIMEOUT_SEC) } = opts;

  const args = [
    'exec',
    OPENCLAW_CONTAINER,
    'openclaw',
    'agent',
    '--agent',
    agentId,
    ...(sessionId ? ['--session-id', sessionId] : []),
    '--message',
    message,
    '--json',
    '--timeout',
    String(timeoutSec),
  ];

  const { stdout, stderr } = await execFileAsync('docker', args, {
    timeout: (timeoutSec + 30) * 1000,
    maxBuffer: 1024 * 1024 * 10,
  });

  if (stderr) {
    logger.debug({ stderr: stderr.slice(0, 500), agentId }, 'Agent stderr');
  }

  const { payloads, meta } = parseAgentResponse(stdout);
  const allTexts = payloads.map((p) => p.text || '').filter(Boolean);
  const text = allTexts.join('\n') || 'No response from agent';

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(stdout);
  } catch {
    raw = { payloads: [{ text: stdout }] };
  }

  return { text, meta, raw };
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

/**
 * Report a timeline event to the Hub API (best-effort, never throws).
 */
async function reportTimeline(
  workflowId: string,
  agent: string,
  action: string,
  detail: string,
  progress: number
): Promise<void> {
  // reportTimeline runs INSIDE webhook-listener (host process, port 4000).
  // It calls its OWN /api/workflows/:id/timeline endpoint → must use localhost.
  // RTB_API_URL is for Docker→Host (host.docker.internal) — NOT for self-calls.
  const selfUrl = `http://localhost:${getEnv('PORT', '4000')}`;
  const rtbApiToken = getEnv(
    'OPENCLAW_HOOKS_TOKEN',
    getEnv('RTB_INTERNAL_API_TOKEN', 'rtb-ai-hub-openclaw-hooks-token-2026')
  );

  try {
    const response = await fetch(`${selfUrl}/api/workflows/${workflowId}/timeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rtbApiToken}`,
      },
      body: JSON.stringify({ agent, action, detail, progress }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, workflowId }, 'Timeline report failed');
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Timeline report error'
    );
  }
}

// ---------------------------------------------------------------------------
// Background orchestration: Hub calls each agent directly
// ---------------------------------------------------------------------------

interface OrchestrationOpts {
  jiraKey: string;
  workflowId: string;
  requirement: string;
  pmResult: string;
  dashboardUrl: string;
}

function buildDeveloperPrompt(opts: OrchestrationOpts): string {
  return [
    `## 개발 요청: ${opts.jiraKey}`,
    '',
    `**요구사항:** ${opts.requirement}`,
    '',
    'PM 분석 결과:',
    opts.pmResult.slice(0, 3000),
    '',
    '위 요구사항에 맞는 코드를 개발해주세요.',
    '완료 후 브랜치명, PR URL, CI 결과를 텍스트에 포함하세요.',
  ].join('\n');
}

function buildTeamLeadPrompt(opts: OrchestrationOpts & { developerResult: string }): string {
  return [
    `## 코드 리뷰 요청: ${opts.jiraKey}`,
    '',
    `**요구사항:** ${opts.requirement}`,
    '',
    'Developer 결과:',
    opts.developerResult.slice(0, 5000),
    '',
    '위 개발 결과를 리뷰해주세요.',
    '승인/반려 판정과 사유를 텍스트에 포함하세요.',
  ].join('\n');
}

function buildOpsPrompt(opts: OrchestrationOpts & { teamleadResult: string }): string {
  return [
    `## 배포 검증 요청: ${opts.jiraKey}`,
    '',
    `**요구사항:** ${opts.requirement}`,
    '',
    'TeamLead 리뷰 결과:',
    opts.teamleadResult.slice(0, 5000),
    '',
    '위 리뷰 결과를 바탕으로 배포/검증을 수행하세요.',
    '검증 결과를 텍스트에 포함하세요.',
  ].join('\n');
}

/**
 * Hub-driven orchestration: calls each agent directly via `--agent <id>`.
 * No sessions_spawn, no announce, no Timeline polling needed.
 * Hub reports Timeline itself after each agent returns.
 */
async function runOrchestrationLoop(opts: OrchestrationOpts): Promise<void> {
  const { jiraKey, workflowId } = opts;
  const chainLogger = createLogger('agent-chain');
  chainLogger.info({ jiraKey, workflowId }, 'Hub-driven orchestration started');

  await reportTimeline(
    workflowId,
    'hub',
    'orchestration-start',
    'Developer → TeamLead → Ops 파이프라인 시작',
    25
  );

  // --- Developer ---
  let developerResult: string;
  try {
    chainLogger.info({ jiraKey, workflowId }, 'Calling developer-agent directly');
    await reportTimeline(
      workflowId,
      'developer',
      '개발 시작',
      'Developer Agent가 코드 생성을 시작합니다',
      30
    );

    const devResult = await runAgent({
      agentId: 'developer-agent',
      message: buildDeveloperPrompt(opts),
      timeoutSec: 600,
    });

    developerResult = devResult.text;
    chainLogger.info({ jiraKey, workflowId, len: developerResult.length }, 'Developer completed');
    await reportTimeline(workflowId, 'developer', '개발 완료', developerResult.slice(0, 500), 55);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    chainLogger.error({ error: msg, jiraKey, workflowId }, 'Developer agent failed');
    await reportTimeline(
      workflowId,
      'developer',
      '개발 실패',
      `Developer 에러: ${msg.slice(0, 300)}`,
      35
    );
    return;
  }

  // --- TeamLead ---
  let teamleadResult: string;
  try {
    chainLogger.info({ jiraKey, workflowId }, 'Calling teamlead-agent directly');
    await reportTimeline(
      workflowId,
      'teamlead',
      '리뷰 시작',
      'TeamLead가 코드 리뷰를 시작합니다',
      60
    );

    const tlResult = await runAgent({
      agentId: 'teamlead-agent',
      message: buildTeamLeadPrompt({ ...opts, developerResult }),
      timeoutSec: 300,
    });

    teamleadResult = tlResult.text;
    chainLogger.info({ jiraKey, workflowId, len: teamleadResult.length }, 'TeamLead completed');
    await reportTimeline(workflowId, 'teamlead', '리뷰 완료', teamleadResult.slice(0, 500), 75);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    chainLogger.error({ error: msg, jiraKey, workflowId }, 'TeamLead agent failed');
    await reportTimeline(
      workflowId,
      'teamlead',
      '리뷰 실패',
      `TeamLead 에러: ${msg.slice(0, 300)}`,
      65
    );
    return;
  }

  // --- Ops ---
  try {
    chainLogger.info({ jiraKey, workflowId }, 'Calling ops-agent directly');
    await reportTimeline(workflowId, 'ops', '배포 시작', 'Ops가 배포 검증을 시작합니다', 80);

    const opsResult = await runAgent({
      agentId: 'ops-agent',
      message: buildOpsPrompt({ ...opts, teamleadResult }),
      timeoutSec: 300,
    });

    chainLogger.info({ jiraKey, workflowId, len: opsResult.text.length }, 'Ops completed');
    await reportTimeline(workflowId, 'ops', '배포 완료', opsResult.text.slice(0, 500), 95);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    chainLogger.error({ error: msg, jiraKey, workflowId }, 'Ops agent failed');
    await reportTimeline(workflowId, 'ops', '배포 실패', `Ops 에러: ${msg.slice(0, 300)}`, 85);
    return;
  }

  await reportTimeline(
    workflowId,
    'hub',
    'orchestration-complete',
    'Developer → TeamLead → Ops 파이프라인 완료',
    100
  );
  chainLogger.info({ jiraKey, workflowId }, 'Hub-driven orchestration completed successfully');
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createAgentChatRouter(): Router {
  const router = Router();

  router.post('/api/agent/chat', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message string is required' });
        return;
      }

      logger.info({ messageLength: message.length }, 'Agent chat request received');

      // URL for PM agent (runs inside Docker container) to call Hub APIs
      // Must use host.docker.internal to reach host's webhook-listener from Docker
      const dockerToHostUrl = `http://host.docker.internal:${getEnv('PORT', '4000')}`;

      // Turn 1: Call PM agent DIRECTLY (not through Main).
      //
      // sessions_spawn is non-blocking, so routing through Main would mean:
      //   Main calls sessions_spawn(pm-agent) → returns immediately → "PM 실행했습니다"
      //   → Hub gets NO jiraKey/workflowId → orchestration loop can't start!
      //
      // Instead: Turn 1 calls pm-agent directly for synchronous results.
      // Hub drives Developer → TeamLead → Ops directly in background.
      const agentPrompt = [
        '## 사용자 요구사항',
        '',
        message,
        '',
        '---',
        '⚠️ 아래 프로토콜을 반드시 순서대로 수행하세요:',
        '',
        '1단계: Knowledge API로 도메인 지식 조회',
        `   curl -s -X POST "${dockerToHostUrl}/api/knowledge/search" -H "Content-Type: application/json" -H "Authorization: Bearer \${RTB_API_TOKEN}" -d '{"query": "<관련 키워드>", "maxDocs": 4}'`,
        '',
        '2단계: Jira 이슈 생성 (labels: ["RTB-AI-HUB", "rtb-v2-mvp"] 필수)',
        '',
        '3단계: Hub Workflow API로 모니터링 레코드 생성',
        `   RESPONSE=$(curl -s -X POST "${dockerToHostUrl}/api/workflows" -H "Content-Type: application/json" -H "Authorization: Bearer \${RTB_API_TOKEN}" -d '{"jiraKey": "<이슈키>", "summary": "<요약>", "type": "JIRA_AUTO_DEV", "env": "int"}')`,
        `   WORKFLOW_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)`,
        '   ⛔ WORKFLOW_ID는 반드시 API 응답에서 추출! wf- 접두사 형식. 자체 ID 생성 금지!',
        '',
        '4단계: Timeline 보고',
        `   curl -s -X POST "${dockerToHostUrl}/api/workflows/\${WORKFLOW_ID}/timeline" -H "Content-Type: application/json" -H "Authorization: Bearer \${RTB_API_TOKEN}" -d '{"agent": "pm", "action": "<작업>", "detail": "<상세>", "progress": <0-100>}'`,
        '',
        '5단계: 🔄 Hub가 Developer → TeamLead → Ops 에이전트 체인을 자동으로 실행합니다.',
        '   sessions_spawn을 호출하지 마세요. Hub가 자동으로 처리합니다.',
        '',
        '6단계: 텍스트로 결과 요약 + 모니터링 URL 전달',
        `   모니터링 URL: ${DASHBOARD_URL}/\${WORKFLOW_ID}`,
        '',
        '> ⛔ 도구 호출 순서: exec(Knowledge) → exec(Jira) → exec(Workflow) → exec(Timeline) → 텍스트',
        '> ⛔ PM Agent 내에서 sessions_spawn 호출 금지! Hub가 Developer→TeamLead→Ops 체인을 자동 실행합니다.',
        `> Dashboard URL: ${DASHBOARD_URL}`,
      ].join('\n');

      logger.info('Turn 1: Calling PM agent directly');

      const pmResult = await runAgent({
        agentId: 'pm-agent',
        message: agentPrompt,
        timeoutSec: parseInt(AGENT_TIMEOUT_SEC),
      });

      const pmFullText = pmResult.text;
      const jiraKeyMatch = pmFullText.match(/\b([A-Z]{2,10}-\d+)\b/);
      const workflowIdMatch = pmFullText.match(/\b(wf-[a-zA-Z0-9-]+)\b/);

      const jiraKey = jiraKeyMatch?.[1] || null;
      const workflowId = workflowIdMatch?.[1] || null;

      logger.info(
        { jiraKey, workflowId, responseLength: pmFullText.length },
        'Turn 1: PM completed'
      );

      res.json({
        role: 'assistant',
        content: pmFullText,
        meta: {
          jiraKey,
          workflowId,
          dashboardUrl: DASHBOARD_URL,
        },
      });

      // Fire background orchestration loop (Turns 2-4) via Main agent
      if (jiraKey && workflowId) {
        logger.info({ jiraKey, workflowId }, 'Firing background orchestration loop');
        runOrchestrationLoop({
          jiraKey,
          workflowId,
          requirement: message,
          pmResult: pmFullText,
          dashboardUrl: DASHBOARD_URL,
        }).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error({ error: msg, jiraKey, workflowId }, 'Background orchestration loop failed');
        });
      } else {
        logger.warn(
          { jiraKey, workflowId },
          'Skipping orchestration loop: missing jiraKey or workflowId'
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'Agent chat failed');

      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        res.status(504).json({ error: 'Agent response timed out. Please try again.' });
        return;
      }

      res.status(500).json({ error: `Agent chat failed: ${msg}` });
    }
  });

  return router;
}
