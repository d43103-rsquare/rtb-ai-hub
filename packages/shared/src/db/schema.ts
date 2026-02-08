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
  unique,
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
  },
  (table) => [
    index('idx_workflow_executions_type').on(table.type),
    index('idx_workflow_executions_status').on(table.status),
    index('idx_workflow_executions_started_at').on(table.startedAt),
    index('idx_workflow_executions_user_id').on(table.userId),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_events_source').on(table.source),
    index('idx_webhook_events_processed').on(table.processed),
    index('idx_webhook_events_created_at').on(table.createdAt),
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

// ─── user_credentials ───────────────────────────────────────────────────────────

export const userCredentials = pgTable(
  'user_credentials',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    service: varchar('service', { length: 50 }).notNull(),
    authType: varchar('auth_type', { length: 20 }).notNull(),
    apiKeyEncrypted: text('api_key_encrypted'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_credentials_user_id').on(table.userId),
    index('idx_user_credentials_service').on(table.service),
    index('idx_user_credentials_auth_type').on(table.authType),
    unique('user_credentials_user_id_service_unique').on(table.userId, table.service),
  ]
);

// ─── credential_usage_log ───────────────────────────────────────────────────────

export const credentialUsageLog = pgTable(
  'credential_usage_log',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 }),
    service: varchar('service', { length: 50 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    ipAddress: varchar('ip_address', { length: 50 }),
    userAgent: text('user_agent'),
    success: boolean('success').notNull().default(true),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_credential_usage_log_user_id').on(table.userId),
    index('idx_credential_usage_log_service').on(table.service),
    index('idx_credential_usage_log_action').on(table.action),
    index('idx_credential_usage_log_created_at').on(table.createdAt),
  ]
);

// ─── user_sessions ──────────────────────────────────────────────────────────────

export const userSessions = pgTable(
  'user_sessions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    sessionToken: varchar('session_token', { length: 512 }).unique().notNull(),
    refreshToken: varchar('refresh_token', { length: 512 }).unique(),
    ipAddress: varchar('ip_address', { length: 50 }),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivity: timestamp('last_activity', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_sessions_user_id').on(table.userId),
    index('idx_user_sessions_session_token').on(table.sessionToken),
    index('idx_user_sessions_expires_at').on(table.expiresAt),
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
  credentials: many(userCredentials),
  sessions: many(userSessions),
  credentialUsageLogs: many(credentialUsageLog),
  workflowExecutions: many(workflowExecutions),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id],
  }),
}));

export const credentialUsageLogRelations = relations(credentialUsageLog, ({ one }) => ({
  user: one(users, {
    fields: [credentialUsageLog.userId],
    references: [users.id],
  }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));
