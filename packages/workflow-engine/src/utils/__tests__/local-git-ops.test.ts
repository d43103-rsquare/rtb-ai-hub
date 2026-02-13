import { describe, it, expect, vi, beforeEach } from 'vitest';
import { determineBranchType, generateBranchName, generateCommitMessage } from '../local-git-ops';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    source: 'jira' as const,
    type: 'issue_updated' as const,
    issueKey: 'PROJ-123',
    issueType: 'Story',
    status: 'In Progress',
    summary: 'Implement login page',
    description: 'Build a login page with OAuth',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('determineBranchType', () => {
  it('returns hotfix for prd environment', () => {
    expect(determineBranchType('Story', 'prd')).toBe('hotfix');
  });

  it('returns bugfix for stg environment', () => {
    expect(determineBranchType('Story', 'stg')).toBe('bugfix');
  });

  it('returns bugfix for Bug issue type in int environment', () => {
    expect(determineBranchType('Bug', 'int')).toBe('bugfix');
  });

  it('returns feature for Story issue type in int environment', () => {
    expect(determineBranchType('Story', 'int')).toBe('feature');
  });

  it('returns feature for Task issue type in int environment', () => {
    expect(determineBranchType('Task', 'int')).toBe('feature');
  });
});

describe('generateBranchName', () => {
  it('generates feature branch with sanitized summary', () => {
    const event = makeEvent({ summary: 'Implement Login Page' });
    const name = generateBranchName(event, 'int');
    expect(name).toBe('feature/PROJ-123-implement-login-page');
  });

  it('generates bugfix branch for stg environment', () => {
    const event = makeEvent({ summary: 'Fix null pointer error' });
    const name = generateBranchName(event, 'stg');
    expect(name).toBe('bugfix/PROJ-123-fix-null-pointer-error');
  });

  it('generates hotfix branch for prd environment', () => {
    const event = makeEvent({ summary: 'Critical Auth Fix!' });
    const name = generateBranchName(event, 'prd');
    expect(name).toBe('hotfix/PROJ-123-critical-auth-fix');
  });

  it('truncates long summaries to 40 chars', () => {
    const event = makeEvent({
      summary: 'This is a very long summary that should be truncated for branch naming',
    });
    const name = generateBranchName(event, 'int');
    const descPart = name.replace('feature/PROJ-123-', '');
    expect(descPart.length).toBeLessThanOrEqual(40);
  });

  it('handles special characters in summary', () => {
    const event = makeEvent({ summary: 'Fix: user@email.com [AUTH] #123' });
    const name = generateBranchName(event, 'int');
    expect(name).toMatch(/^feature\/PROJ-123-fix-user-email-com-auth-123$/);
  });

  it('uppercases issue key', () => {
    const event = makeEvent({ issueKey: 'proj-456' });
    const name = generateBranchName(event, 'int');
    expect(name).toContain('PROJ-456');
  });

  it('respects explicit branch type override', () => {
    const event = makeEvent();
    const name = generateBranchName(event, 'int', 'hotfix');
    expect(name).toMatch(/^hotfix\//);
  });
});

describe('generateCommitMessage', () => {
  it('generates commit message with issue key and summary', () => {
    const event = makeEvent();
    const msg = generateCommitMessage(event);
    expect(msg).toBe('[PROJ-123] Implement login page');
  });

  it('uses custom summary when provided', () => {
    const event = makeEvent();
    const msg = generateCommitMessage(event, 'Custom description');
    expect(msg).toBe('[PROJ-123] Custom description');
  });
});
