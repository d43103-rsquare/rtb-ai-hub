import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeJiraEvent } from '../workflow-router';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';

vi.mock('../../workflows/jira-auto-dev', () => ({
  processJiraAutoDev: vi.fn().mockResolvedValue({ dispatched: true, workflowExecutionId: 'wf_1' }),
}));
vi.mock('../../workflows/bug-fix', () => ({
  processBugFix: vi.fn().mockResolvedValue({ dispatched: true, workflowExecutionId: 'wf_2' }),
}));

import { processJiraAutoDev } from '../../workflows/jira-auto-dev';
import { processBugFix } from '../../workflows/bug-fix';

function makeEvent(overrides: Partial<JiraWebhookEvent> = {}): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_created',
    issueKey: 'TEST-1',
    issueType: 'Task',
    status: 'To Do',
    summary: 'Test issue',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('routeJiraEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes Bug tickets to processBugFix', async () => {
    const event = makeEvent({ issueType: 'Bug' });
    await routeJiraEvent(event, null, 'int');
    expect(processBugFix).toHaveBeenCalledWith(event, null, 'int');
    expect(processJiraAutoDev).not.toHaveBeenCalled();
  });

  it('routes Feature tickets to processJiraAutoDev', async () => {
    const event = makeEvent({ issueType: 'Story' });
    await routeJiraEvent(event, null, 'int');
    expect(processJiraAutoDev).toHaveBeenCalledWith(event, null, 'int');
    expect(processBugFix).not.toHaveBeenCalled();
  });

  it('routes hotfix label tickets to processBugFix', async () => {
    const event = makeEvent({ issueType: 'Task', labels: ['hotfix'] });
    await routeJiraEvent(event, null, 'prd');
    expect(processBugFix).toHaveBeenCalledWith(event, null, 'prd');
  });
});
