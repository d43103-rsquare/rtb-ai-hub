import {
  pgTable,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  numeric,
  decimal,
  timestamp,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── workflow_executions ────────────────────────────────────────────────────────

export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    type: varchar('type', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    error: text('error'),
    aiModel: varchar('ai_model', { length: 100 }),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    duration: integer('duration'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    userId: varchar('user_id', { length: 255 }),
    env: varchar('env', { length: 10 }).notNull().default('int'),
    timeline: jsonb('timeline').default([]),
    artifacts: jsonb('artifacts').default({}),
    gateDecisions: jsonb('gate_decisions').default({}),
    progress: integer('progress').default(0),
    assignee: varchar('assignee', { length: 50 }),
    jiraKey: varchar('jira_key', { length: 50 }),
    summary: varchar('summary', { length: 500 }),
    e2eTestResult: jsonb('e2e_test_result'),
  },
  (table) => [
    index('idx_workflow_executions_type').on(table.type),
    index('idx_workflow_executions_status').on(table.status),
    index('idx_workflow_executions_started_at').on(table.startedAt),
    index('idx_workflow_executions_user_id').on(table.userId),
    index('idx_workflow_executions_env').on(table.env),
    index('idx_workflow_executions_jira_key').on(table.jiraKey),
    index('idx_workflow_executions_progress').on(table.progress),
  ]
);

// ─── webhook_events ─────────────────────────────────────────────────────────────

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    source: varchar('source', { length: 50 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').notNull().default(false),
    workflowExecutionId: varchar('workflow_execution_id', { length: 255 }),
    env: varchar('env', { length: 10 }).notNull().default('int'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_events_source').on(table.source),
    index('idx_webhook_events_processed').on(table.processed),
    index('idx_webhook_events_created_at').on(table.createdAt),
    index('idx_webhook_events_env').on(table.env),
  ]
);

// ─── metrics ────────────────────────────────────────────────────────────────────

export const metrics = pgTable(
  'metrics',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    metricType: varchar('metric_type', { length: 100 }).notNull(),
    value: numeric('value').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_metrics_type').on(table.metricType),
    index('idx_metrics_created_at').on(table.createdAt),
  ]
);

// ─── ai_costs ───────────────────────────────────────────────────────────────────

export const aiCosts = pgTable(
  'ai_costs',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    workflowExecutionId: varchar('workflow_execution_id', { length: 255 }),
    model: varchar('model', { length: 100 }).notNull(),
    tokensInput: integer('tokens_input').notNull(),
    tokensOutput: integer('tokens_output').notNull(),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_costs_workflow_id').on(table.workflowExecutionId),
    index('idx_ai_costs_model').on(table.model),
    index('idx_ai_costs_created_at').on(table.createdAt),
  ]
);

// ─── users ──────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    googleId: varchar('google_id', { length: 255 }).unique().notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    name: varchar('name', { length: 255 }),
    picture: text('picture'),
    workspaceDomain: varchar('workspace_domain', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLogin: timestamp('last_login', { withTimezone: true }),
  },
  (table) => [
    index('idx_users_google_id').on(table.googleId),
    index('idx_users_email').on(table.email),
    index('idx_users_workspace_domain').on(table.workspaceDomain),
  ]
);

// ─── agent_sessions ──────────────────────────────────────────────────────────

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    workflowExecutionId: varchar('workflow_execution_id', { length: 255 }).notNull(),
    workflowType: varchar('workflow_type', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    context: jsonb('context').notNull(),
    totalCostUsd: decimal('total_cost_usd', { precision: 10, scale: 6 }).default('0'),
    totalTokensInput: integer('total_tokens_input').default(0),
    totalTokensOutput: integer('total_tokens_output').default(0),
    failureCount: integer('failure_count').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_agent_sessions_workflow_exec').on(table.workflowExecutionId),
    index('idx_agent_sessions_status').on(table.status),
    index('idx_agent_sessions_workflow_type').on(table.workflowType),
  ]
);

// ─── agent_steps ─────────────────────────────────────────────────────────────

export const agentSteps = pgTable(
  'agent_steps',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    sessionId: varchar('session_id', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    attempt: integer('attempt').notNull().default(1),
    input: jsonb('input'),
    output: jsonb('output'),
    rawText: text('raw_text'),
    error: text('error'),
    model: varchar('model', { length: 100 }),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
  },
  (table) => [
    index('idx_agent_steps_session').on(table.sessionId),
    index('idx_agent_steps_role').on(table.role),
    index('idx_agent_steps_status').on(table.status),
  ]
);

// ─── context_links (맥락 연결) ──────────────────────────────────────────

export const contextLinks = pgTable(
  'context_links',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    jiraKey: varchar('jira_key', { length: 50 }).notNull(),
    jiraUrl: varchar('jira_url', { length: 500 }),
    figmaFileKey: varchar('figma_file_key', { length: 200 }),
    figmaNodeIds: jsonb('figma_node_ids'),
    figmaUrl: varchar('figma_url', { length: 500 }),
    githubRepo: varchar('github_repo', { length: 200 }),
    githubBranch: varchar('github_branch', { length: 200 }),
    githubPrNumbers: jsonb('github_pr_numbers'),
    githubPrUrls: jsonb('github_pr_urls'),
    previewId: varchar('preview_id', { length: 255 }),
    previewWebUrl: varchar('preview_web_url', { length: 500 }),
    previewApiUrl: varchar('preview_api_url', { length: 500 }),
    deployments: jsonb('deployments'),
    slackThreadTs: varchar('slack_thread_ts', { length: 100 }),
    slackChannelId: varchar('slack_channel_id', { length: 100 }),
    datadogIncidentIds: jsonb('datadog_incident_ids'),
    teamMembers: jsonb('team_members'),
    env: varchar('env', { length: 10 }).notNull().default('int'),
    summary: varchar('summary', { length: 500 }),
    status: varchar('status', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_context_links_jira_key').on(table.jiraKey),
    index('idx_context_links_github_branch').on(table.githubBranch),
    index('idx_context_links_figma_file').on(table.figmaFileKey),
    index('idx_context_links_preview_id').on(table.previewId),
    index('idx_context_links_env').on(table.env),
  ]
);

// ─── decision_journal (의사결정 기록) ──────────────────────────────────────

export const decisionJournal = pgTable(
  'decision_journal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 500 }).notNull(),
    decision: text('decision').notNull(),
    rationale: text('rationale'),
    sourceType: varchar('source_type', { length: 20 }).notNull(),
    sourceId: varchar('source_id', { length: 200 }).notNull(),
    sourceUrl: varchar('source_url', { length: 500 }),
    participants: text('participants').array().default([]),
    relatedJiraKeys: text('related_jira_keys').array().default([]),
    tags: text('tags').array().default([]),
    status: varchar('status', { length: 20 }).default('active'),
    supersededBy: uuid('superseded_by'),
    env: varchar('env', { length: 10 }).default('int'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_decision_journal_source').on(table.sourceType, table.sourceId),
    index('idx_decision_journal_created').on(table.createdAt),
  ]
);

// ─── debate_sessions ────────────────────────────────────────────────────────────

export const debateSessions = pgTable(
  'debate_sessions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    workflowExecutionId: varchar('workflow_execution_id', { length: 255 }).notNull(),
    config: jsonb('config').notNull(),
    turns: jsonb('turns').notNull().default([]),
    outcome: jsonb('outcome'),
    totalTokensInput: integer('total_tokens_input').default(0),
    totalTokensOutput: integer('total_tokens_output').default(0),
    totalCostUsd: decimal('total_cost_usd', { precision: 10, scale: 6 }).default('0'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_debate_sessions_workflow_exec').on(table.workflowExecutionId),
    index('idx_debate_sessions_created_at').on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────────

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  user: one(users, {
    fields: [workflowExecutions.userId],
    references: [users.id],
  }),
  aiCosts: many(aiCosts),
  webhookEvents: many(webhookEvents),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  workflowExecution: one(workflowExecutions, {
    fields: [webhookEvents.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
}));

export const aiCostsRelations = relations(aiCosts, ({ one }) => ({
  workflowExecution: one(workflowExecutions, {
    fields: [aiCosts.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  workflowExecutions: many(workflowExecutions),
}));

export const agentSessionsRelations = relations(agentSessions, ({ one, many }) => ({
  workflowExecution: one(workflowExecutions, {
    fields: [agentSessions.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
  steps: many(agentSteps),
}));

export const agentStepsRelations = relations(agentSteps, ({ one }) => ({
  session: one(agentSessions, {
    fields: [agentSteps.sessionId],
    references: [agentSessions.id],
  }),
}));

export const debateSessionsRelations = relations(debateSessions, ({ one }) => ({
  workflowExecution: one(workflowExecutions, {
    fields: [debateSessions.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
}));
