import { describe, it, expect } from 'vitest';
import {
  figmaWebhookSchema,
  jiraWebhookSchema,
  githubWebhookSchema,
  datadogWebhookSchema,
  apiKeyInputSchema,
  oauthServiceSchema,
  credentialServiceSchema,
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

describe('apiKeyInputSchema', () => {
  it('validates anthropic service', () => {
    const result = apiKeyInputSchema.safeParse({
      service: 'anthropic',
      apiKey: 'sk-ant-api03-xxx',
    });
    expect(result.success).toBe(true);
  });

  it('validates openai service', () => {
    const result = apiKeyInputSchema.safeParse({
      service: 'openai',
      apiKey: 'sk-xxx',
    });
    expect(result.success).toBe(true);
  });

  it('fails on invalid service', () => {
    const result = apiKeyInputSchema.safeParse({
      service: 'invalid',
      apiKey: 'key',
    });
    expect(result.success).toBe(false);
  });

  it('fails when apiKey is empty', () => {
    const result = apiKeyInputSchema.safeParse({
      service: 'anthropic',
      apiKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('fails when apiKey is missing', () => {
    const result = apiKeyInputSchema.safeParse({
      service: 'anthropic',
    });
    expect(result.success).toBe(false);
  });
});

describe('oauthServiceSchema', () => {
  const validServices = ['jira', 'github', 'figma', 'datadog'] as const;

  it.each(validServices)('accepts valid service: %s', (service) => {
    const result = oauthServiceSchema.safeParse(service);
    expect(result.success).toBe(true);
  });

  it('rejects invalid service', () => {
    const result = oauthServiceSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });

  it('rejects api-key-only services', () => {
    const result = oauthServiceSchema.safeParse('anthropic');
    expect(result.success).toBe(false);
  });
});

describe('credentialServiceSchema', () => {
  const allServices = ['anthropic', 'openai', 'jira', 'github', 'figma', 'datadog'] as const;

  it.each(allServices)('accepts valid service: %s', (service) => {
    const result = credentialServiceSchema.safeParse(service);
    expect(result.success).toBe(true);
  });

  it('rejects invalid service', () => {
    const result = credentialServiceSchema.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});
