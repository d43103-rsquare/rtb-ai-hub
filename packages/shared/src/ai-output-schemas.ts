/**
 * AI Output Schemas — Zod validation for structured AI responses
 *
 * Each schema defines the expected shape of AI-generated JSON output
 * from different workflows. Schemas use .passthrough() and coercion
 * for resilient parsing of AI-generated content.
 */

import { z } from 'zod';

// ─── Figma Analysis ──────────────────────────────────────────────────────────

export const subtaskDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['implementation', 'test', 'verification']).catch('implementation'),
});

export const taskDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  storyPoints: z.coerce.number().int().min(1).max(21).catch(3),
  componentType: z.string().catch('unknown'),
  subtasks: z.array(subtaskDefinitionSchema).catch([]),
});

export const figmaAnalysisSchema = z.object({
  story: z.object({
    summary: z.string(),
    description: z.string(),
  }),
  tasks: z.array(taskDefinitionSchema).catch([]),
});

export type FigmaAnalysisOutput = z.infer<typeof figmaAnalysisSchema>;

// ─── Review Analysis ─────────────────────────────────────────────────────────

export const reviewCommentSchema = z.object({
  file: z.string(),
  line: z.coerce.number().int().catch(1),
  comment: z.string(),
  severity: z.enum(['critical', 'warning', 'suggestion']).catch('suggestion'),
});

export const reviewAnalysisSchema = z.object({
  summary: z.string(),
  approved: z.coerce.boolean().catch(false),
  comments: z.array(reviewCommentSchema).catch([]),
  suggestions: z.array(z.string()).catch([]),
});

export type ReviewAnalysisOutput = z.infer<typeof reviewAnalysisSchema>;

// ─── Monitoring Analysis ─────────────────────────────────────────────────────

export const monitoringAnalysisSchema = z.object({
  analysis: z.object({
    summary: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']).catch('medium'),
    affectedServices: z.array(z.string()).catch([]),
  }),
  risks: z.array(z.object({
    description: z.string(),
    severity: z.string(),
    mitigation: z.string(),
  })).catch([]),
  monitoringChecklist: z.array(z.object({
    metric: z.string(),
    threshold: z.string(),
    duration: z.string(),
    action: z.string(),
  })).catch([]),
  rollbackCriteria: z.array(z.object({
    condition: z.string(),
    threshold: z.string(),
    autoRollback: z.coerce.boolean().catch(false),
  })).catch([]),
});

export type MonitoringAnalysisOutput = z.infer<typeof monitoringAnalysisSchema>;

// ─── Incident Analysis ───────────────────────────────────────────────────────

export const incidentAnalysisSchema = z.object({
  rootCause: z.object({
    summary: z.string(),
    analysis: z.string(),
    confidence: z.enum(['low', 'medium', 'high']).catch('low'),
  }),
  jiraTicket: z.object({
    summary: z.string(),
    description: z.string(),
    priority: z.string().catch('P3'),
    component: z.string().catch('Unknown'),
    labels: z.array(z.string()).catch([]),
  }),
  investigation: z.array(z.object({
    step: z.coerce.number().int(),
    action: z.string(),
    command: z.string(),
    expectedOutcome: z.string(),
  })).catch([]),
  runbook: z.array(z.object({
    action: z.string(),
    description: z.string(),
    automated: z.coerce.boolean().catch(false),
  })).catch([]),
});

export type IncidentAnalysisOutput = z.infer<typeof incidentAnalysisSchema>;

// ─── Debate Artifact ─────────────────────────────────────────────────────────

export const debateArtifactContentSchema = z.record(z.string(), z.unknown());
