import { z } from 'zod';

// Figma webhook payload
export const figmaWebhookSchema = z.object({
  event_type: z
    .enum(['FILE_UPDATE', 'FILE_VERSION_UPDATE', 'FILE_COMMENT'])
    .optional()
    .default('FILE_UPDATE'),
  file_key: z.string().min(1, 'file_key is required'),
  file_name: z.string().min(1, 'file_name is required'),
  file_url: z.string().url().optional(),
});

// Jira webhook payload
export const jiraWebhookSchema = z
  .object({
    webhookEvent: z.string().optional().default('issue_updated'),
    issue: z
      .object({
        key: z.string().min(1),
        fields: z
          .object({
            issuetype: z.object({ name: z.string() }).optional(),
            status: z.object({ name: z.string() }).optional(),
            summary: z.string().optional(),
            description: z.string().nullable().optional(),
          })
          .passthrough()
          .optional(),
      })
      .optional(),
    changelog: z.unknown().optional(),
  })
  .passthrough();

// GitHub webhook payload
export const githubWebhookSchema = z
  .object({
    repository: z
      .object({
        full_name: z.string(),
      })
      .optional(),
    pull_request: z
      .object({
        number: z.number(),
        title: z.string(),
        head: z
          .object({
            ref: z.string(),
            sha: z.string(),
          })
          .optional(),
      })
      .optional(),
    deployment: z
      .object({
        ref: z.string().optional(),
        sha: z.string().optional(),
      })
      .optional(),
    action: z.string().optional(),
  })
  .passthrough();

// Datadog webhook payload
export const datadogWebhookSchema = z
  .object({
    event_type: z.string().optional().default('alert'),
    id: z.string().optional(),
    alert_id: z.string().optional(),
    title: z.string().min(1, 'title is required'),
    body: z.string().optional(),
    message: z.string().optional(),
    priority: z.enum(['P1', 'P2', 'P3']).optional().default('P2'),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

// Auth-service: API key input
export const apiKeyInputSchema = z.object({
  service: z.enum(['anthropic', 'openai']),
  apiKey: z.string().min(1, 'apiKey is required'),
});

// Auth-service: OAuth service param
export const oauthServiceSchema = z.enum(['jira', 'github', 'figma', 'datadog']);

// Auth-service: credential service param
export const credentialServiceSchema = z.enum([
  'anthropic',
  'openai',
  'jira',
  'github',
  'figma',
  'datadog',
]);
