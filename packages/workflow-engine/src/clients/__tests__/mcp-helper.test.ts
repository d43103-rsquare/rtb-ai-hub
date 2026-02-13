import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@rtb-ai-hub/shared');
  return {
    ...actual,
    REPO_ROUTING: {
      repos: { Backend: 'org/backend-repo', Frontend: 'org/frontend-repo' },
      branches: { int: 'develop', stg: 'release/latest', prd: 'main' },
      fallbackRepo: 'org/default-repo',
    },
    LABEL_REPO_ROUTING: {
      mappings: {
        'RTB-NEW': 'dev-rsquare/rtb-v2-mvp',
        'RTB-LEGACY': 'dev-rsquare/rtb-legacy',
      },
    },
    getEnv: (key: string, defaultVal: string) => {
      const envMap: Record<string, string> = {
        GITHUB_REPO: 'org/default-repo',
      };
      return envMap[key] ?? defaultVal;
    },
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

vi.mock('../mcp-client', () => ({
  getMcpClient: vi.fn(),
}));

import { resolveGitHubTarget } from '../mcp-helper';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';

function makeEvent(overrides: Partial<JiraWebhookEvent> = {}): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_updated',
    issueKey: 'PROJ-100',
    issueType: 'Story',
    status: 'In Progress',
    summary: 'Test issue',
    projectKey: 'PROJ',
    components: [],
    labels: [],
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('resolveGitHubTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves repo from label routing (priority 1)', () => {
    const event = makeEvent({ labels: ['RTB-AI-HUB', 'RTB-NEW'] });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('dev-rsquare');
    expect(result.repo).toBe('rtb-v2-mvp');
    expect(result.baseBranch).toBe('develop');
  });

  it('uses first matching label when multiple repo labels exist', () => {
    const event = makeEvent({ labels: ['RTB-NEW', 'RTB-LEGACY'] });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('dev-rsquare');
    expect(result.repo).toBe('rtb-v2-mvp');
  });

  it('falls through to component routing when no label matches', () => {
    const event = makeEvent({
      labels: ['RTB-AI-HUB', 'unrelated-label'],
      components: [{ id: '1', name: 'Backend' }],
    });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('org');
    expect(result.repo).toBe('backend-repo');
  });

  it('falls through to fallback when no label or component matches', () => {
    const event = makeEvent({
      labels: ['RTB-AI-HUB'],
      components: [{ id: '1', name: 'Unknown' }],
    });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('org');
    expect(result.repo).toBe('default-repo');
  });

  it('label routing takes priority over component routing', () => {
    const event = makeEvent({
      labels: ['RTB-LEGACY'],
      components: [{ id: '1', name: 'Backend' }],
    });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('dev-rsquare');
    expect(result.repo).toBe('rtb-legacy');
  });

  it('respects environment-based branch mapping', () => {
    const event = makeEvent({ labels: ['RTB-NEW'] });

    expect(resolveGitHubTarget(event, 'int').baseBranch).toBe('develop');
    expect(resolveGitHubTarget(event, 'prd').baseBranch).toBe('main');
  });

  it('handles empty labels gracefully', () => {
    const event = makeEvent({
      labels: [],
      components: [{ id: '1', name: 'Frontend' }],
    });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('org');
    expect(result.repo).toBe('frontend-repo');
  });

  it('handles undefined labels gracefully', () => {
    const event = makeEvent({ components: [{ id: '1', name: 'Frontend' }] });
    delete (event as Record<string, unknown>).labels;
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('org');
    expect(result.repo).toBe('frontend-repo');
  });

  it('skips labels that are not in the mapping', () => {
    const event = makeEvent({
      labels: ['RTB-AI-HUB', 'some-random-label', 'another-label'],
      components: [],
    });
    const result = resolveGitHubTarget(event, 'int');

    expect(result.owner).toBe('org');
    expect(result.repo).toBe('default-repo');
  });
});
