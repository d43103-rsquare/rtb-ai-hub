/**
 * Auto-Review Workflow — v2 (Debate Engine)
 *
 * 흐름:
 * 1. Workflow Execution 저장
 * 2. DEBATE: 코드 리뷰 토론 (Backend Developer, QA, DevOps)
 * 3. 리뷰 결과로 GitHub PR 리뷰 게시
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
  GitHubWebhookEvent,
  WorkflowExecution,
  Environment,
  DebateConfig,
} from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { ClaudeAdapter } from '../clients/adapters/claude-adapter';
import { OpenAIAdapter } from '../clients/adapters/openai-adapter';
import { GeminiAdapter } from '../clients/adapters/gemini-adapter';
import { createProviderRouter } from '../clients/provider-router';
import type { ProviderAdapter } from '@rtb-ai-hub/shared';
import {
  createGitHubReview,
  createGitHubReviewComment,
  getGitHubRepo,
} from '../clients/mcp-helper';
import { createDebateEngine } from '../debate/engine';
import { createDebateStore } from '../debate/debate-store';

const logger = createLogger('auto-review-workflow');

type ReviewAnalysis = {
  summary: string;
  approved: boolean;
  comments: Array<{
    file: string;
    line: number;
    comment: string;
    severity: 'critical' | 'warning' | 'suggestion';
  }>;
  suggestions: string[];
};

export async function processAutoReview(
  event: GitHubWebhookEvent,
  userId: string | null,
  env: Environment = DEFAULT_ENVIRONMENT
): Promise<any> {
  const executionId = generateId('exec');
  const startedAt = new Date();

  logger.info({ event, executionId, userId, env }, 'Starting auto-review workflow');

  const execution: Partial<WorkflowExecution> = {
    id: executionId,
    type: WorkflowType.AUTO_REVIEW,
    status: WorkflowStatus.IN_PROGRESS,
    input: event,
    userId,
    env,
    startedAt,
  };

  try {
    await database.saveWorkflowExecution(execution);

    // ─── Step 2: Review Debate (Backend Dev, QA, DevOps) ────────────────────

    const debateConfig: DebateConfig = {
      topic: [
        `GitHub PR 코드 리뷰`,
        ``,
        `Repository: ${event.repository}`,
        `PR #${event.prNumber}: ${event.prTitle}`,
        `Branch: ${event.branch}`,
        `Commit SHA: ${event.sha}`,
        ``,
        `PR Payload:`,
        JSON.stringify(event.payload, null, 2).slice(0, 5000),
        ``,
        `다음 관점에서 코드를 리뷰하세요:`,
        `1. 코드 품질 및 유지보수성`,
        `2. 보안 취약점`,
        `3. 성능 이슈`,
        `4. 베스트 프랙티스 및 디자인 패턴`,
        `5. 잠재적 버그 또는 엣지 케이스`,
        ``,
        `최종 리뷰 결과를 JSON 아티팩트로 제출하세요:`,
        `<artifact>`,
        `{`,
        `  "summary": "전체 리뷰 요약",`,
        `  "approved": true/false,`,
        `  "comments": [{ "file": "path/to/file", "line": 42, "comment": "...", "severity": "critical|warning|suggestion" }],`,
        `  "suggestions": ["..."]`,
        `}`,
        `</artifact>`,
      ].join('\n'),
      participants: [
        AgentPersona.BACKEND_DEVELOPER,
        AgentPersona.QA,
        AgentPersona.DEVOPS,
      ],
      moderator: AgentPersona.BACKEND_DEVELOPER,
      maxTurns: parseInt(process.env.DEBATE_MAX_TURNS || '8', 10),
      consensusRequired: true,
      context: {
        jiraKey: '',
        summary: `PR Review: ${event.prTitle || event.repository}`,
        description: `Repository: ${event.repository}, PR #${event.prNumber}`,
        env,
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
    let review: ReviewAnalysis;

    try {
      debateSession = await debateEngine.run(debateConfig, executionId);
      logger.info(
        {
          sessionId: debateSession.id,
          outcome: debateSession.outcome?.status,
          turns: debateSession.turns.length,
          cost: debateSession.totalCostUsd.toFixed(4),
        },
        'Code review debate completed'
      );

      review = extractReviewFromDebate(debateSession);
    } catch (debateError) {
      logger.warn(
        { error: debateError instanceof Error ? debateError.message : String(debateError) },
        'Debate failed — falling back to single AI call'
      );

      const fallbackResult = await singleAiReview(new ClaudeAdapter(), event, executionId);
      review = fallbackResult.review;
    }

    // ─── Step 3: Post GitHub Review ─────────────────────────────────────────

    const mcpResults = await executeGitHubReviewMcpCalls(env, event, review);

    // ─── Complete ───────────────────────────────────────────────────────────

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();
    const totalCost = debateSession?.totalCostUsd || 0;

    const finalExecution: Partial<WorkflowExecution> = {
      id: executionId,
      type: WorkflowType.AUTO_REVIEW,
      status: WorkflowStatus.COMPLETED,
      input: event,
      output: {
        review,
        mcpResults,
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
        approved: review.approved,
        commentCount: review.comments.length,
        reviewPosted: mcpResults.reviewPosted,
        cost: totalCost,
      },
      'auto-review workflow completed'
    );

    return {
      success: true,
      executionId,
      review,
      mcpResults,
      cost: totalCost,
      duration,
    };
  } catch (error) {
    logger.error({ error, executionId }, 'auto-review workflow failed');

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    await database.saveWorkflowExecution({
      id: executionId,
      type: WorkflowType.AUTO_REVIEW,
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

function extractReviewFromDebate(debateSession: any): ReviewAnalysis {
  const allArtifacts = debateSession.turns
    .flatMap((t: any) => t.artifacts || [])
    .filter((a: any) => a.content);

  const sources = [
    ...allArtifacts.map((a: any) => a.content),
    debateSession.outcome?.decision || '',
  ];

  for (const source of sources) {
    try {
      const jsonMatch = source.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if ('summary' in parsed && 'approved' in parsed) {
          return {
            summary: parsed.summary || '',
            approved: !!parsed.approved,
            comments: Array.isArray(parsed.comments) ? parsed.comments : [],
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          };
        }
      }
    } catch {
      // continue
    }
  }

  // Fallback: construct from debate outcome text
  const decision = debateSession.outcome?.decision || '';
  const isApproved = decision.toLowerCase().includes('approve') &&
    !decision.toLowerCase().includes('request changes');

  return {
    summary: decision.slice(0, 2000) || 'Review completed via debate',
    approved: isApproved,
    comments: [],
    suggestions: [],
  };
}

async function singleAiReview(
  adapter: ClaudeAdapter,
  event: GitHubWebhookEvent,
  executionId: string
): Promise<{ review: ReviewAnalysis }> {
  const prompt = `
Analyze this GitHub Pull Request and provide a thorough code review.

Repository: ${event.repository}
PR #${event.prNumber}: ${event.prTitle}
Branch: ${event.branch}
Commit SHA: ${event.sha}

PR Payload:
${JSON.stringify(event.payload, null, 2)}

Please review the code changes for:
1. Code quality and maintainability
2. Security vulnerabilities
3. Performance issues
4. Best practices and design patterns
5. Potential bugs or edge cases

Format your response as JSON:
{
  "summary": "Overall review summary",
  "approved": true/false,
  "comments": [
    { "file": "path/to/file", "line": 42, "comment": "...", "severity": "critical|warning|suggestion" }
  ],
  "suggestions": ["..."]
}
`;

  const aiResponse = await adapter.complete(prompt, {
    systemPrompt:
      'You are an expert code reviewer focused on code quality, security vulnerabilities, performance issues, and best practices.',
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

  let review: ReviewAnalysis;
  try {
    const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      review = JSON.parse(jsonMatch[0]);
    } else {
      review = { summary: aiResponse.text, approved: false, comments: [], suggestions: [] };
    }
  } catch {
    review = { summary: aiResponse.text, approved: false, comments: [], suggestions: [] };
  }

  return { review };
}

async function executeGitHubReviewMcpCalls(
  env: Environment,
  event: GitHubWebhookEvent,
  review: ReviewAnalysis
) {
  const { owner, repo } = getGitHubRepo(env);
  const prNumber = event.prNumber;

  if (!owner || !repo || !prNumber) {
    logger.warn(
      { owner, repo, prNumber, env },
      'GitHub repo or PR number not available — skipping MCP review calls'
    );
    return { reviewPosted: false, commentsPosted: 0, error: 'Missing repo or PR info' };
  }

  let commentsPosted = 0;

  for (const comment of review.comments) {
    const result = await createGitHubReviewComment(env, {
      owner,
      repo,
      pullNumber: prNumber,
      body: `[${comment.severity.toUpperCase()}] ${comment.comment}`,
      path: comment.file,
      line: comment.line,
    });

    if (result.success) {
      commentsPosted++;
    } else {
      logger.warn(
        { file: comment.file, line: comment.line, error: result.error },
        'Failed to post inline review comment via MCP'
      );
    }
  }

  const reviewEvent = review.approved ? 'APPROVE' : 'REQUEST_CHANGES';
  const reviewBody = [
    `## AI Code Review\n\n${review.summary}`,
    review.suggestions.length > 0
      ? `\n### Suggestions\n${review.suggestions.map((s) => `- ${s}`).join('\n')}`
      : '',
  ].join('');

  const reviewResult = await createGitHubReview(env, {
    owner,
    repo,
    pullNumber: prNumber,
    event: reviewEvent as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: reviewBody,
  });

  return {
    reviewPosted: reviewResult.success,
    reviewError: reviewResult.success ? null : reviewResult.error,
    commentsPosted,
    commentsFailed: review.comments.length - commentsPosted,
  };
}
