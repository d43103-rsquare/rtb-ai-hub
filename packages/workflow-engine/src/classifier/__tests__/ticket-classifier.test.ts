import { describe, it, expect } from 'vitest';
import { classifyTicket, TicketCategory } from '../ticket-classifier';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';

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

describe('classifyTicket', () => {
  describe('Bug detection', () => {
    it('classifies by issueType "Bug"', () => {
      const event = makeEvent({ issueType: 'Bug' });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by issueType "버그" (Korean)', () => {
      const event = makeEvent({ issueType: '버그' });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by label "bug"', () => {
      const event = makeEvent({ labels: ['bug', 'urgent'] });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by label "hotfix"', () => {
      const event = makeEvent({ labels: ['hotfix'] });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by summary keyword "[BUG]"', () => {
      const event = makeEvent({ summary: '[BUG] Login fails on Safari' });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });
  });

  describe('Feature detection', () => {
    it('classifies by issueType "Story"', () => {
      const event = makeEvent({ issueType: 'Story' });
      expect(classifyTicket(event)).toBe(TicketCategory.FEATURE);
    });

    it('classifies by issueType "Task" as default feature', () => {
      const event = makeEvent({ issueType: 'Task' });
      expect(classifyTicket(event)).toBe(TicketCategory.FEATURE);
    });

    it('classifies by label "feature"', () => {
      const event = makeEvent({ labels: ['feature'] });
      expect(classifyTicket(event)).toBe(TicketCategory.FEATURE);
    });
  });

  describe('Priority: issueType > labels > summary', () => {
    it('issueType Bug wins over feature label', () => {
      const event = makeEvent({ issueType: 'Bug', labels: ['feature'] });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('label bug wins over summary feature keyword', () => {
      const event = makeEvent({
        issueType: 'Task',
        labels: ['bug'],
        summary: '[FEATURE] Add new page',
      });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });
  });
});
