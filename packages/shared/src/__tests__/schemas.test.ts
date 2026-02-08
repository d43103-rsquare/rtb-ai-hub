import { describe, it, expect } from 'vitest';
import {
  figmaWebhookSchema,
  jiraWebhookSchema,
  githubWebhookSchema,
  datadogWebhookSchema,
} from '../schemas';

describe('figmaWebhookSchema', () => {
  it('validates a valid payload', () => {
    const result = figmaWebhookSchema.safeParse({
      event_type: 'FILE_UPDATE',
      file_key: 'abc123',
      file_name: 'My Design',
    });
    expect(result.success).toBe(true);
  });

  it('applies default event_type when omitted', () => {
    const result = figmaWebhookSchema.safeParse({
      file_key: 'abc123',
      file_name: 'My Design',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event_type).toBe('FILE_UPDATE');
    }
  });

  it('fails when file_key is missing', () => {
    const result = figmaWebhookSchema.safeParse({
      event_type: 'FILE_UPDATE',
      file_name: 'My Design',
    });
    expect(result.success).toBe(false);
  });

  it('fails when file_name is missing', () => {
    const result = figmaWebhookSchema.safeParse({
      event_type: 'FILE_UPDATE',
      file_key: 'abc123',
    });
    expect(result.success).toBe(false);
  });

  it('fails when file_key is empty string', () => {
    const result = figmaWebhookSchema.safeParse({
      file_key: '',
      file_name: 'My Design',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional file_url', () => {
    const result = figmaWebhookSchema.safeParse({
      file_key: 'abc123',
      file_name: 'My Design',
      file_url: 'https://www.figma.com/file/abc123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid file_url', () => {
    const result = figmaWebhookSchema.safeParse({
      file_key: 'abc123',
      file_name: 'My Design',
      file_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('jiraWebhookSchema', () => {
  it('validates a valid payload', () => {
    const result = jiraWebhookSchema.safeParse({
      webhookEvent: 'issue_updated',
      issue: {
        key: 'PROJ-123',
        fields: {
          status: { name: 'In Progress' },
          summary: 'Implement login page',
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('allows passthrough of extra fields', () => {
    const result = jiraWebhookSchema.safeParse({
      webhookEvent: 'issue_updated',
      issue: {
        key: 'PROJ-123',
        fields: {
          summary: 'Test',
        },
      },
      extraField: 'should be allowed',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extraField).toBe('should be allowed');
    }
  });

  it('applies default webhookEvent when omitted', () => {
    const result = jiraWebhookSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webhookEvent).toBe('issue_updated');
    }
  });

  it('accepts payload without issue', () => {
    const result = jiraWebhookSchema.safeParse({
      webhookEvent: 'project_created',
    });
    expect(result.success).toBe(true);
  });
});

describe('githubWebhookSchema', () => {
  it('validates a valid pull_request payload', () => {
    const result = githubWebhookSchema.safeParse({
      action: 'opened',
      repository: { full_name: 'org/repo' },
      pull_request: {
        number: 42,
        title: 'Add authentication',
        head: { ref: 'feature/auth', sha: 'abc123' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates a deployment payload', () => {
    const result = githubWebhookSchema.safeParse({
      action: 'created',
      deployment: {
        ref: 'main',
        sha: 'def456',
      },
    });
    expect(result.success).toBe(true);
  });

  it('allows passthrough of extra fields', () => {
    const result = githubWebhookSchema.safeParse({
      action: 'opened',
      sender: { login: 'user' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sender).toEqual({ login: 'user' });
    }
  });

  it('accepts minimal payload', () => {
    const result = githubWebhookSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('datadogWebhookSchema', () => {
  it('validates a valid payload', () => {
    const result = datadogWebhookSchema.safeParse({
      title: 'High error rate detected',
      priority: 'P1',
      event_type: 'alert',
    });
    expect(result.success).toBe(true);
  });

  it('fails when title is missing', () => {
    const result = datadogWebhookSchema.safeParse({
      priority: 'P1',
      event_type: 'alert',
    });
    expect(result.success).toBe(false);
  });

  it('applies default priority and event_type', () => {
    const result = datadogWebhookSchema.safeParse({
      title: 'Alert',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('P2');
      expect(result.data.event_type).toBe('alert');
    }
  });

  it('accepts optional tags array', () => {
    const result = datadogWebhookSchema.safeParse({
      title: 'Alert',
      tags: ['service:api', 'env:prod'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(['service:api', 'env:prod']);
    }
  });

  it('fails on invalid priority', () => {
    const result = datadogWebhookSchema.safeParse({
      title: 'Alert',
      priority: 'P4',
    });
    expect(result.success).toBe(false);
  });
});
