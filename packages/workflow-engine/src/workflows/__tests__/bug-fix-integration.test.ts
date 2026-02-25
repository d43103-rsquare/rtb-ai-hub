// packages/workflow-engine/src/workflows/__tests__/bug-fix-integration.test.ts
import { describe, it, expect } from 'vitest';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';
import { classifyTicket, TicketCategory } from '../../classifier/ticket-classifier';
import { buildBugFixClaudeMd } from '../../claude-code/bug-context-builder';

function makeBugEvent(): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_created',
    issueKey: 'PROJ-456',
    issueType: 'Bug',
    status: 'To Do',
    summary: 'API returns 500 on empty payload',
    description: `## Steps to reproduce
1. Send POST /api/data with empty body
2. Observe 500 Internal Server Error

## Expected
400 Bad Request with validation error

## Actual
500 with stack trace:
\`\`\`
TypeError: Cannot destructure property 'name' of undefined
  at processData (src/handlers/data.ts:42)
\`\`\``,
    labels: ['bug', 'api'],
    timestamp: new Date().toISOString(),
    payload: {},
  };
}

describe('Bug Fix Integration', () => {
  it('classifies bug ticket correctly', () => {
    const event = makeBugEvent();
    expect(classifyTicket(event)).toBe(TicketCategory.BUG);
  });

  it('generates CLAUDE.md with bug context', () => {
    const event = makeBugEvent();
    const md = buildBugFixClaudeMd({
      issueKey: event.issueKey!,
      summary: event.summary!,
      description: event.description,
      env: 'int',
      stackTrace: 'TypeError: Cannot destructure property',
    });

    expect(md).toContain('PROJ-456');
    expect(md).toContain('Bug Fix Guide');
    expect(md).toContain('Root Cause Analysis');
    expect(md).toContain('regression test');
    expect(md).toContain('TypeError');
  });

  it('extracts stack trace from description code blocks', () => {
    const event = makeBugEvent();
    const description = event.description || '';
    const codeBlockMatch = description.match(/```[\s\S]*?```/);
    expect(codeBlockMatch).toBeTruthy();
    expect(codeBlockMatch![0]).toContain('TypeError');
  });

  it('full flow: classify → context → validate', () => {
    const event = makeBugEvent();

    // Step 1: Classify
    const category = classifyTicket(event);
    expect(category).toBe(TicketCategory.BUG);

    // Step 2: Build context
    const md = buildBugFixClaudeMd({
      issueKey: event.issueKey!,
      summary: event.summary!,
      description: event.description,
      env: 'int',
    });

    // Step 3: Validate content
    expect(md).toContain('Bug Fix Process');
    expect(md).toContain('Quality Gates');
    expect(md).not.toContain('Design Debate');
  });
});
