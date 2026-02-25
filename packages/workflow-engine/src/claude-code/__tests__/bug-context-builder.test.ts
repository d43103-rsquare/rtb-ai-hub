import { describe, it, expect } from 'vitest';
import { buildBugFixClaudeMd, BugFixContextInput } from '../bug-context-builder';

function makeInput(overrides: Partial<BugFixContextInput> = {}): BugFixContextInput {
  return {
    issueKey: 'BUG-123',
    summary: 'Login button not working on Safari',
    description: 'Steps to reproduce:\n1. Open Safari\n2. Click login\n3. Nothing happens',
    env: 'int',
    ...overrides,
  };
}

describe('buildBugFixClaudeMd', () => {
  it('includes issue key and summary in title', () => {
    const md = buildBugFixClaudeMd(makeInput());
    expect(md).toContain('# BUG-123 — Bug Fix Guide');
    expect(md).toContain('Login button not working on Safari');
  });

  it('includes reproduction steps from description', () => {
    const md = buildBugFixClaudeMd(makeInput());
    expect(md).toContain('## Bug Report');
    expect(md).toContain('Steps to reproduce');
  });

  it('includes bug fix instructions', () => {
    const md = buildBugFixClaudeMd(makeInput());
    expect(md).toContain('## Bug Fix Process');
    expect(md).toContain('Root Cause Analysis');
    expect(md).toContain('regression test');
  });

  it('includes error logs when provided', () => {
    const md = buildBugFixClaudeMd(makeInput({
      errorLogs: 'TypeError: Cannot read property "click" of null at login.ts:42',
    }));
    expect(md).toContain('## Error Logs');
    expect(md).toContain('TypeError');
  });

  it('includes environment-specific rules', () => {
    const md = buildBugFixClaudeMd(makeInput({ env: 'prd' }));
    expect(md).toContain('Production');
  });

  it('includes related files when provided', () => {
    const md = buildBugFixClaudeMd(makeInput({
      relatedFiles: ['src/auth/login.ts', 'src/components/LoginButton.tsx'],
    }));
    expect(md).toContain('## Related Files');
    expect(md).toContain('login.ts');
  });

  it('includes monitoring data when provided', () => {
    const md = buildBugFixClaudeMd(makeInput({
      monitoringData: 'Error rate: 5.2% in last 1h, affected users: 342',
    }));
    expect(md).toContain('## Monitoring Data');
    expect(md).toContain('Error rate');
  });
});
