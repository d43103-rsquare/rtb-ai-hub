import {
  createLogger,
  generateId,
  WorkflowStatus,
  WorkflowType,
  AITier,
  DEFAULT_ENVIRONMENT,
} from '@rtb-ai-hub/shared';
import type { FigmaWebhookEvent, WorkflowExecution, Environment } from '@rtb-ai-hub/shared';
import { anthropicClient } from '../clients/anthropic';
import { database } from '../clients/database';
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

  const aiClient = anthropicClient;

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

    // Fetch actual Figma design data via MCP
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

    const figmaDataSection = figmaContext
      ? `
## Actual Figma Design Data (from Figma API)

### Components Found (${figmaContext.components.length}):
${figmaContext.components.map((c) => `- **${c.name}** (${c.type}): ${c.description}`).join('\n')}

### Styles Found (${figmaContext.styles.length}):
${figmaContext.styles.map((s) => `- **${s.name}** (${s.styleType}): ${s.description}`).join('\n')}

### Design Tokens:
- Colors: ${figmaContext.designTokens.colors.join(', ') || 'Not extracted'}
- Font Families: ${figmaContext.designTokens.fontFamilies.join(', ') || 'Not extracted'}
- Spacing: ${figmaContext.designTokens.spacingPattern}

### Node Tree Structure:
\`\`\`
${figmaContext.nodeTreeSummary || 'Not available'}
\`\`\`
`
      : '\n(No actual Figma design data available — analyze based on file name and event type only)\n';

    const prompt = `
Analyze this Figma design update and generate a Jira Story with Tasks and Sub-tasks.

Figma File: ${event.fileName} (${event.fileKey})
URL: ${event.fileUrl}
Event Type: ${event.type}

${figmaDataSection}

Based on the design data above, provide:
1. Story Summary (one line, reflecting the overall feature from the design)
2. Story Description (detailed overview of the feature)
3. List of Tasks for EACH component that needs to be implemented as React:
   - Task name (matching the actual Figma component name where possible)
   - Description (including specific style/layout details from the design)
   - Estimated story points (1-8)
   - Component type (Button, Form, Layout, Card, Modal, etc.)
   - Subtasks for each Task (implementation, test, verification):
     * Implementation: Actual code implementation
     * Test: Unit tests and component tests
     * Verification: QA and design verification

Format your response as JSON:
{
  "story": {
    "summary": "...",
    "description": "..."
  },
  "tasks": [
    {
      "name": "...",
      "description": "...",
      "storyPoints": 3,
      "componentType": "...",
      "subtasks": [
        {
          "name": "Implement ...",
          "description": "...",
          "type": "implementation"
        },
        {
          "name": "Test ...",
          "description": "...",
          "type": "test"
        },
        {
          "name": "Verify ...",
          "description": "...",
          "type": "verification"
        }
      ]
    }
  ]
}
`;

    const aiResponse = await aiClient.generateText(prompt, {
      tier: AITier.HEAVY,
      maxTokens: 3000,
      systemPrompt: 'You are an expert at analyzing UI designs and creating development tasks.',
    });

    logger.info({ executionId, tokensUsed: aiResponse.tokensUsed }, 'AI analysis complete');

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
    } catch (parseError) {
      logger.warn({ parseError }, 'Failed to parse AI response as JSON, using raw text');
      analysis = {
        story: { summary: 'Figma Design Update', description: aiResponse.text },
        tasks: [],
      };
    }

    const cost = aiClient.calculateCost(
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

    const mcpResults = await executeJiraMcpCalls(env, analysis, figmaContext);

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.FIGMA_TO_JIRA,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: { analysis, mcpResults: summarizeMcpResults(mcpResults) },
      userId,
      env,
      aiModel: aiResponse.model,
      tokensUsed: aiResponse.tokensUsed,
      costUsd: cost,
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
        cost,
      },
      'figma-to-jira workflow completed'
    );

    return {
      success: true,
      executionId,
      analysis,
      mcpResults: summarizeMcpResults(mcpResults),
      cost,
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
