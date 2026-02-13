import { createLogger, AITier } from '@rtb-ai-hub/shared';
import type { Environment } from '@rtb-ai-hub/shared';
import { anthropicClient } from '../clients/anthropic';
import { createJiraStory, createJiraTask, type JiraIssueResult } from '../clients/mcp-helper';

const logger = createLogger('story-decomposer');

export type TaskBreakdown = {
  summary: string;
  description: string;
  labels: string[];
  estimatedHours?: number;
};

export type StoryDecompositionResult = {
  storyKey: string;
  tasks: Array<{
    key: string;
    summary: string;
    description: string;
  }>;
};

export async function decomposeStoryIntoTasks(
  projectKey: string,
  storySummary: string,
  storyDescription: string,
  env: Environment,
  figmaContext?: {
    fileUrl: string;
    components?: Array<{ name: string; description?: string }>;
  }
): Promise<StoryDecompositionResult> {
  logger.info({ projectKey, storySummary, env }, 'Decomposing story into tasks');

  const storyResult = await createJiraStory(env, {
    projectKey,
    summary: storySummary,
    description: storyDescription,
    labels: ['RTB-AI-HUB', 'auto-generated'],
  });

  if (!storyResult.success) {
    throw new Error(`Failed to create story: ${storyResult.error}`);
  }

  if (!storyResult.data?.key) {
    throw new Error('Story created but no key returned');
  }

  const storyKey = storyResult.data.key;
  logger.info({ storyKey }, 'Story created successfully');

  const tasks = await generateTaskBreakdown(storySummary, storyDescription, figmaContext);

  const createdTasks: StoryDecompositionResult['tasks'] = [];

  for (const task of tasks) {
    const taskResult = await createJiraTask(env, {
      projectKey,
      summary: task.summary,
      description: task.description,
      parentKey: storyKey,
      labels: task.labels,
    });

    if (taskResult.success && taskResult.data?.key) {
      createdTasks.push({
        key: taskResult.data.key,
        summary: task.summary,
        description: task.description,
      });
      logger.info({ taskKey: taskResult.data.key, storyKey }, 'Task created successfully');
    } else {
      const errorMsg = taskResult.success ? 'No key returned' : taskResult.error;
      logger.warn({ task, error: errorMsg }, 'Failed to create task');
    }
  }

  return {
    storyKey,
    tasks: createdTasks,
  };
}

async function generateTaskBreakdown(
  storySummary: string,
  storyDescription: string,
  figmaContext?: {
    fileUrl: string;
    components?: Array<{ name: string; description?: string }>;
  }
): Promise<TaskBreakdown[]> {
  const prompt = buildTaskBreakdownPrompt(storySummary, storyDescription, figmaContext);

  const response = await anthropicClient.generateText(prompt, {
    tier: AITier.MEDIUM,
    maxTokens: 2000,
    temperature: 0.3,
    systemPrompt:
      'You are an expert technical project manager. Break down user stories into concrete, actionable development tasks. Output valid JSON only.',
  });

  try {
    const parsed = JSON.parse(response.text);
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch (error) {
    logger.error({ error, rawText: response.text }, 'Failed to parse AI response');
    return [];
  }
}

function buildTaskBreakdownPrompt(
  storySummary: string,
  storyDescription: string,
  figmaContext?: {
    fileUrl: string;
    components?: Array<{ name: string; description?: string }>;
  }
): string {
  const figmaSection = figmaContext
    ? `\n\nFigma Design:\n- URL: ${figmaContext.fileUrl}\n- Components: ${figmaContext.components?.map((c) => c.name).join(', ') || 'N/A'}`
    : '';

  return `Break down this user story into concrete development tasks.

Story Summary: ${storySummary}
Story Description: ${storyDescription}${figmaSection}

Return JSON in this exact format:
{
  "tasks": [
    {
      "summary": "Task title (concise, actionable)",
      "description": "Detailed task description with acceptance criteria",
      "labels": ["frontend" | "backend" | "test" | "devops"],
      "estimatedHours": 4
    }
  ]
}

Guidelines:
1. Create 3-5 tasks per story
2. Each task should be completable in 1-2 days
3. Include at least one test task
4. Tasks should follow this pattern:
   - UI/Component development tasks
   - Backend/API development tasks
   - Integration tasks
   - Testing tasks
5. Use Korean for summaries and descriptions
6. Be specific about what needs to be built

Output ONLY valid JSON, no markdown or explanations.`;
}
