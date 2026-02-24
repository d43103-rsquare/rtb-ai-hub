/**
 * Figma → Jira Workflow — v2 (Debate Engine)
 *
 * 흐름:
 * 1. Workflow Execution 저장
 * 2. Figma 디자인 데이터 로드 (MCP)
 * 3. DEBATE: 설계 분석 토론 (PM, UX Designer, UI Developer)
 * 4. AI 분석 결과로 Jira Story → Task → Subtask 생성
 * 5. 생성된 Task를 auto-dev 큐에 전송
 */

import {
  createLogger,
  generateId,
  WorkflowStatus,
  WorkflowType,
  DEFAULT_ENVIRONMENT,
  AgentPersona,
} from '@rtb-ai-hub/shared';
import type {
  FigmaWebhookEvent,
  WorkflowExecution,
  Environment,
  JiraWebhookEvent,
  DebateConfig,
} from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { ClaudeAdapter } from '../clients/adapters/claude-adapter';
import { OpenAIAdapter } from '../clients/adapters/openai-adapter';
import { GeminiAdapter } from '../clients/adapters/gemini-adapter';
import { createProviderRouter } from '../clients/provider-router';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';
import {
  createJiraStory,
  createJiraTask,
  createJiraSubtask,
  getJiraProjectKey,
  type McpCallResult,
  type JiraIssueResult,
} from '../clients/mcp-helper';
import {
  fetchFigmaDesignData,
  serializeFigmaContext,
  type FigmaContext,
} from '../utils/figma-context';
import { loadComponentMapping, formatMappedComponents } from '../utils/component-mapping';
import { sendToJiraQueue } from '../queue/queues';
import { createDebateEngine } from '../debate/engine';
import { createDebateStore } from '../debate/debate-store';

const logger = createLogger('figma-to-jira-workflow');

type SubtaskDefinition = {
  name: string;
  description: string;
  type: 'implementation' | 'test' | 'verification';
};

type TaskDefinition = {
  name: string;
  description: string;
  storyPoints: number;
  componentType: string;
  subtasks: SubtaskDefinition[];
};

type FigmaAnalysis = {
  story: { summary: string; description: string };
  tasks: TaskDefinition[];
};

type McpResults = {
  story?: McpCallResult<JiraIssueResult>;
  tasks: Array<{
    name: string;
    result: McpCallResult<JiraIssueResult>;
    subtasks: Array<{ name: string; result: McpCallResult<JiraIssueResult> }>;
  }>;
};

export async function processFigmaToJira(
  event: FigmaWebhookEvent,
  userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId, env }, 'Starting figma-to-jira workflow');

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.FIGMA_TO_JIRA,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    env,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    // ─── Step 2: Fetch Figma Design Data ────────────────────────────────────

    let figmaContext: FigmaContext | null = null;
    try {
      figmaContext = await fetchFigmaDesignData(env, event);
      if (figmaContext) {
        logger.info(
          {
            executionId,
            components: figmaContext.components.length,
            styles: figmaContext.styles.length,
            nodeIds: figmaContext.nodeIds.length,
          },
          'Figma design data fetched via MCP'
        );
      } else {
        logger.warn(
          { executionId },
          'Figma MCP returned no data — proceeding with limited context'
        );
      }
    } catch (figmaErr) {
      logger.warn(
        { executionId, error: figmaErr instanceof Error ? figmaErr.message : String(figmaErr) },
        'Figma MCP unavailable — proceeding without design data'
      );
    }

    // ─── Step 3: Design Debate (PM, UX Designer, UI Developer) ──────────────

    const { section: figmaDataSection, mappingSection } = await buildFigmaDataSection(figmaContext);

    const debateConfig: DebateConfig = {
      topic: [
        `Figma 디자인 분석 및 Jira 태스크 분해`,
        ``,
        `Figma File: ${event.fileName} (${event.fileKey})`,
        `URL: ${event.fileUrl}`,
        `Event Type: ${event.type}`,
        ``,
        figmaDataSection,
        ``,
        `위 Figma 디자인을 분석하여 다음을 결정하세요:`,
        `1. Story: 전체 기능의 요약과 설명`,
        `2. Tasks: 각 컴포넌트별 구현 태스크 (이름, 설명, 스토리 포인트, 컴포넌트 유형)`,
        `3. Subtasks: 각 태스크의 하위 작업 (구현, 테스트, 검증)`,
        ``,
        `최종 결정을 JSON 아티팩트로 제출하세요:`,
        `<artifact>`,
        `{`,
        `  "story": { "summary": "...", "description": "..." },`,
        `  "tasks": [{ "name": "...", "description": "...", "storyPoints": 3, "componentType": "...", "subtasks": [...] }]`,
        `}`,
        `</artifact>`,
      ].join('\n'),
      participants: [
        AgentPersona.PM,
        AgentPersona.UX_DESIGNER,
        AgentPersona.UI_DEVELOPER,
      ],
      moderator: AgentPersona.PM,
      maxTurns: parseInt(process.env.DEBATE_MAX_TURNS || '8', 10),
      consensusRequired: true,
      context: {
        jiraKey: '',
        summary: `Figma: ${event.fileName}`,
        description: figmaDataSection,
        env,
        figmaContext: figmaContext ? serializeFigmaContext(figmaContext) : undefined,
        additionalContext: mappingSection
          ? { 'Team Component Mapping': mappingSection }
          : undefined,
      },
      budgetUsd: parseFloat(process.env.DEBATE_COST_LIMIT_USD || '3'),
    };

    const adapters: ProviderAdapter[] = [new ClaudeAdapter()];
    if (process.env.OPENAI_API_KEY) adapters.push(new OpenAIAdapter());
    if (process.env.GEMINI_API_KEY) adapters.push(new GeminiAdapter());
    const router = createProviderRouter(adapters);
    await router.loadConfig(env);
    const debateStore = createDebateStore(database);
    const debateEngine = createDebateEngine({ router, store: debateStore });

    let debateSession;
    let analysis: FigmaAnalysis;

    try {
      debateSession = await debateEngine.run(debateConfig, executionId);
      logger.info(
        {
          sessionId: debateSession.id,
          outcome: debateSession.outcome?.status,
          turns: debateSession.turns.length,
          cost: debateSession.totalCostUsd.toFixed(4),
        },
        'Figma analysis debate completed'
      );

      // Extract analysis from debate artifacts or outcome
      analysis = extractAnalysisFromDebate(debateSession);
    } catch (debateError) {
      logger.warn(
        { error: debateError instanceof Error ? debateError.message : String(debateError) },
        'Debate failed — falling back to single AI call'
      );

      // Fallback: single AI call (backward compatibility)
      const fallbackResult = await singleAiAnalysis(new ClaudeAdapter(), event, figmaDataSection, executionId);
      analysis = fallbackResult.analysis;
    }

    // ─── Step 4: Create Jira Issues ─────────────────────────────────────────

    const mcpResults = await executeJiraMcpCalls(env, analysis, figmaContext);

    // ─── Step 5: Enqueue for auto-development ───────────────────────────────

    for (const taskResult of mcpResults.tasks) {
      if (taskResult.result.success && taskResult.result.data?.key) {
        const syntheticEvent: JiraWebhookEvent = {
          source: 'jira',
          type: 'issue_updated',
          issueKey: taskResult.result.data.key,
          issueType: 'Task',
          status: 'In Progress',
          summary: taskResult.name,
          description: '',
          projectKey: getJiraProjectKey(env),
          labels: ['RTB-AI-HUB', 'auto-generated'],
          timestamp: new Date().toISOString(),
          payload: {},
        };

        await sendToJiraQueue(
          { event: syntheticEvent, userId, env },
          { jobId: `jira_${generateId('job')}` }
        );

        logger.info(
          { taskKey: taskResult.result.data.key, env },
          'Enqueued task for auto-development'
        );
      }
    }

    // ─── Complete ───────────────────────────────────────────────────────────

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();
    const totalCost = debateSession?.totalCostUsd || 0;

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.FIGMA_TO_JIRA,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: {
        analysis,
        mcpResults: summarizeMcpResults(mcpResults),
        debateSessionId: debateSession?.id,
      },
      userId,
      env,
      costUsd: totalCost,
      startedAt,
      completedAt,
      duration,
    };

    await database.saveWorkflowExecution(finalExecution);

    logger.info(
      {
        executionId,
        storySummary: analysis.story.summary,
        taskCount: analysis.tasks.length,
        storyCreated: mcpResults.story?.success ?? false,
        tasksCreated: mcpResults.tasks.filter((t) => t.result.success).length,
        cost: totalCost,
      },
      'figma-to-jira workflow completed'
    );

    return {
      success: true,
      executionId,
      analysis,
      mcpResults: summarizeMcpResults(mcpResults),
      cost: totalCost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'figma-to-jira workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.FIGMA_TO_JIRA,
      status: WorkflowStatus.FAILED,
      input: event,
      userId,
      env,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      completedAt,
      duration,
    });

    throw error;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildFigmaDataSection(figmaContext: FigmaContext | null): Promise<{ section: string; mappingSection: string | null }> {
  if (!figmaContext) {
    return {
      section: '(No actual Figma design data available — analyze based on file name and event type only)',
      mappingSection: null,
    };
  }

  const sections = [
    `## Actual Figma Design Data (from Figma API)`,
    ``,
    `### Components Found (${figmaContext.components.length}):`,
    figmaContext.components.map((c) => `- **${c.name}** (${c.type}): ${c.description}`).join('\n'),
    ``,
    `### Styles Found (${figmaContext.styles.length}):`,
    figmaContext.styles.map((s) => `- **${s.name}** (${s.styleType}): ${s.description}`).join('\n'),
    ``,
    `### Design Tokens:`,
    `- Colors: ${figmaContext.designTokens.colors.join(', ') || 'Not extracted'}`,
    `- Font Families: ${figmaContext.designTokens.fontFamilies.join(', ') || 'Not extracted'}`,
    `- Spacing: ${figmaContext.designTokens.spacingPattern}`,
    ``,
    `### Node Tree Structure:`,
    '```',
    figmaContext.nodeTreeSummary || 'Not available',
    '```',
  ];

  // Append team component mapping if available
  let mappingSectionText: string | null = null;
  const mapping = await loadComponentMapping();
  if (mapping && mapping.mappings.length > 0) {
    mappingSectionText = formatMappedComponents(figmaContext.components, mapping.mappings);
    if (mappingSectionText) {
      sections.push('', mappingSectionText);
    }
  }

  return { section: sections.join('\n'), mappingSection: mappingSectionText };
}

function extractAnalysisFromDebate(debateSession: { turns?: Array<{ artifacts?: Array<{ content?: string }> }>; outcome?: { decision?: string } }): FigmaAnalysis {
  if (!debateSession?.turns) {
    return {
      story: { summary: 'Figma Design Update', description: 'No debate data available' },
      tasks: [],
    };
  }

  // Try to extract from debate artifacts first
  const allArtifacts = debateSession.turns
    .flatMap((t) => t.artifacts || [])
    .filter((a) => a.content);

  // Check outcome decision for JSON
  const sources = [
    ...allArtifacts.map((a) => a.content as string),
    debateSession.outcome?.decision || '',
  ];

  for (const source of sources) {
    try {
      const jsonMatch = source.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.story && parsed.tasks) {
          return parsed as FigmaAnalysis;
        }
      }
    } catch {
      // continue to next source
    }
  }

  // Fallback: construct from debate outcome
  return {
    story: {
      summary: 'Figma Design Update',
      description: debateSession.outcome?.decision || 'Design analysis via debate',
    },
    tasks: [],
  };
}

async function singleAiAnalysis(
  adapter: ClaudeAdapter,
  event: FigmaWebhookEvent,
  figmaDataSection: string,
  executionId: string
): Promise<{ analysis: FigmaAnalysis }> {
  const prompt = `
Analyze this Figma design update and generate a Jira Story with Tasks and Sub-tasks.

Figma File: ${event.fileName} (${event.fileKey})
URL: ${event.fileUrl}
Event Type: ${event.type}

${figmaDataSection}

Based on the design data above, provide:
1. Story Summary (one line, reflecting the overall feature from the design)
2. Story Description (detailed overview of the feature)
3. List of Tasks for EACH component that needs to be implemented as React
4. Subtasks for each Task (implementation, test, verification)

Format your response as JSON:
{
  "story": { "summary": "...", "description": "..." },
  "tasks": [{ "name": "...", "description": "...", "storyPoints": 3, "componentType": "...", "subtasks": [...] }]
}
`;

  const aiResponse = await adapter.complete(prompt, {
    systemPrompt: 'You are an expert at analyzing UI designs and creating development tasks.',
    maxTokens: 3000,
    temperature: 0.3,
  });

  const cost = adapter.calculateCost(
    aiResponse.tokensUsed.input,
    aiResponse.tokensUsed.output,
    aiResponse.model
  );

  await database.saveAICost({
    id: generateId('cost'),
    workflowExecutionId: executionId,
    model: aiResponse.model,
    tokensInput: aiResponse.tokensUsed.input,
    tokensOutput: aiResponse.tokensUsed.output,
    costUsd: cost,
  });

  let analysis: FigmaAnalysis;
  try {
    const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      analysis = {
        story: { summary: 'Figma Design Update', description: aiResponse.text },
        tasks: [],
      };
    }
  } catch {
    analysis = {
      story: { summary: 'Figma Design Update', description: aiResponse.text },
      tasks: [],
    };
  }

  return { analysis };
}

async function executeJiraMcpCalls(
  env: Environment,
  analysis: FigmaAnalysis,
  figmaContext: FigmaContext | null
): Promise<McpResults> {
  const projectKey = getJiraProjectKey(env);
  const mcpResults: McpResults = { tasks: [] };

  const storyDescription = figmaContext
    ? `${analysis.story.description}\n\n---\n\n${serializeFigmaContext(figmaContext)}`
    : analysis.story.description;

  const storyResult = await createJiraStory(env, {
    projectKey,
    summary: analysis.story.summary,
    description: storyDescription,
  });

  mcpResults.story = storyResult;

  if (!storyResult.success) {
    logger.warn(
      { error: storyResult.error, env },
      'Failed to create Jira Story via MCP — tasks will be skipped'
    );
    return mcpResults;
  }

  const storyKey = storyResult.data.key;
  logger.info({ storyKey, env }, 'Jira Story created via MCP');

  for (const task of analysis.tasks) {
    const taskResult = await createJiraTask(env, {
      projectKey,
      parentKey: storyKey,
      summary: task.name,
      description: `${task.description}\n\nComponent Type: ${task.componentType}\nStory Points: ${task.storyPoints}`,
    });

    const taskMcpResult: McpResults['tasks'][0] = {
      name: task.name,
      result: taskResult,
      subtasks: [],
    };

    if (taskResult.success) {
      const taskKey = taskResult.data.key;
      logger.info({ taskKey, storyKey, env }, 'Jira Task created via MCP');

      for (const subtask of task.subtasks) {
        const subtaskResult = await createJiraSubtask(env, {
          parentKey: taskKey,
          summary: subtask.name,
          description: `${subtask.description}\n\nType: ${subtask.type}`,
        });

        taskMcpResult.subtasks.push({ name: subtask.name, result: subtaskResult });

        if (subtaskResult.success) {
          logger.info(
            { subtaskKey: subtaskResult.data.key, taskKey, env },
            'Jira Subtask created via MCP'
          );
        } else {
          logger.warn(
            { subtaskName: subtask.name, error: subtaskResult.error },
            'Failed to create Jira Subtask via MCP'
          );
        }
      }
    } else {
      logger.warn(
        { taskName: task.name, error: taskResult.error },
        'Failed to create Jira Task via MCP — subtasks will be skipped'
      );
    }

    mcpResults.tasks.push(taskMcpResult);
  }

  return mcpResults;
}

function summarizeMcpResults(mcpResults: McpResults) {
  return {
    storyCreated: mcpResults.story?.success ?? false,
    storyKey: mcpResults.story?.success ? mcpResults.story.data.key : null,
    storyError: mcpResults.story && !mcpResults.story.success ? mcpResults.story.error : null,
    tasks: mcpResults.tasks.map((t) => ({
      name: t.name,
      created: t.result.success,
      key: t.result.success ? t.result.data.key : null,
      error: !t.result.success ? t.result.error : null,
      subtasks: t.subtasks.map((s) => ({
        name: s.name,
        created: s.result.success,
        key: s.result.success ? s.result.data.key : null,
        error: !s.result.success ? s.result.error : null,
      })),
      subtasksCreated: t.subtasks.filter((s) => s.result.success).length,
      subtasksFailed: t.subtasks.filter((s) => !s.result.success).length,
    })),
    tasksCreated: mcpResults.tasks.filter((t) => t.result.success).length,
    tasksFailed: mcpResults.tasks.filter((t) => t.result.success === false).length,
  };
}
