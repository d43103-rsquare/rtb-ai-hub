import { describe, it, expect, vi } from 'vitest';
import { buildClaudeMd } from '../context-builder';
import type { DebateSession, DebateContext } from '@rtb-ai-hub/shared';

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<typeof import('@rtb-ai-hub/shared')>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

function makeDebateSession(overrides: Partial<DebateSession> = {}): DebateSession {
  return {
    id: 'debate-123',
    workflowExecutionId: 'wf-123',
    config: {} as any,
    turns: [
      {
        turnNumber: 1,
        agent: 'pm' as any,
        content: 'I propose we build a REST API.',
        type: 'proposal',
        artifacts: [
          {
            title: 'API Schema',
            type: 'code',
            format: 'typescript',
            content: 'export interface User { id: string; name: string; }',
          },
        ],
        tokensUsed: { input: 100, output: 200 },
        model: 'test-model',
        durationMs: 1000,
        timestamp: new Date().toISOString(),
      },
    ],
    outcome: {
      status: 'consensus',
      decision: 'Build REST API with TypeScript and PostgreSQL.',
      artifacts: [],
    },
    totalTokens: { input: 100, output: 200 },
    totalCostUsd: 0.01,
    durationMs: 5000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<DebateContext> = {}): DebateContext {
  return {
    jiraKey: 'PROJ-123',
    summary: 'Implement user authentication',
    description: 'Build OAuth2 login flow',
    env: 'int',
    ...overrides,
  };
}

describe('buildClaudeMd', () => {
  it('generates CLAUDE.md with all sections', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('# PROJ-123');
    expect(result).toContain('Implementation Guide');
    expect(result).toContain('Environment: int');
  });

  it('includes debate decision section', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('## Debate Decision');
    expect(result).toContain('consensus');
    expect(result).toContain('Build REST API with TypeScript and PostgreSQL');
  });

  it('includes implementation artifacts', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('## Implementation Artifacts');
    expect(result).toContain('API Schema');
    expect(result).toContain('export interface User');
  });

  it('includes Jira context', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('## Jira Issue Context');
    expect(result).toContain('PROJ-123');
    expect(result).toContain('Implement user authentication');
  });

  it('includes wiki knowledge when provided', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext({ wikiKnowledge: 'RTB uses PostgreSQL for all data.' }),
      env: 'int',
    });

    expect(result).toContain('## Domain Knowledge (Wiki)');
    expect(result).toContain('RTB uses PostgreSQL');
  });

  it('excludes wiki section when not provided', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });

    expect(result).not.toContain('## Domain Knowledge (Wiki)');
  });

  it('includes figma context when provided', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext({ figmaContext: 'Login form with 3 fields' }),
      env: 'int',
    });

    expect(result).toContain('## Design Context (Figma)');
    expect(result).toContain('Login form with 3 fields');
  });

  it('includes policy constraints when provided', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'prd',
      policyConstraints: '## Constraints\n- No DB schema changes',
    });

    expect(result).toContain('No DB schema changes');
  });

  it('includes environment-specific rules', () => {
    const prdResult = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'prd',
    });
    expect(prdResult).toContain('DB 스키마 변경 금지');
    expect(prdResult).toContain('console.log/debugger 코드 금지');

    const intResult = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });
    expect(intResult).toContain('실험적 변경 허용');
  });

  it('includes quality gates section', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession(),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('## Implementation Instructions');
    expect(result).toContain('Quality Gates');
    expect(result).toContain('TypeScript 타입 체크');
    expect(result).toContain('ESLint 검사');
  });

  it('handles debate session without outcome', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession({ outcome: undefined }),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('No outcome yet');
  });

  it('includes dissenting views when present', () => {
    const result = buildClaudeMd({
      debateSession: makeDebateSession({
        outcome: {
          status: 'consensus',
          decision: 'Use REST API',
          artifacts: [],
          dissentingViews: [
            { agent: 'qa' as any, view: 'Concerned about testing complexity' },
          ],
        },
      }),
      context: makeContext(),
      env: 'int',
    });

    expect(result).toContain('Dissenting Views');
    expect(result).toContain('Concerned about testing');
  });
});
