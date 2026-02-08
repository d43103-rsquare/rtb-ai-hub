import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  workflowExecutions,
  webhookEvents,
  metrics,
  aiCosts,
  users,
  workflowExecutionsRelations,
  webhookEventsRelations,
  aiCostsRelations,
  usersRelations,
} from '../db/schema';

describe('DB Schema', () => {
  describe('Table exports and names', () => {
    it('exports workflowExecutions with correct table name', () => {
      expect(workflowExecutions).toBeDefined();
      expect(getTableName(workflowExecutions)).toBe('workflow_executions');
    });

    it('exports webhookEvents with correct table name', () => {
      expect(webhookEvents).toBeDefined();
      expect(getTableName(webhookEvents)).toBe('webhook_events');
    });

    it('exports metrics with correct table name', () => {
      expect(metrics).toBeDefined();
      expect(getTableName(metrics)).toBe('metrics');
    });

    it('exports aiCosts with correct table name', () => {
      expect(aiCosts).toBeDefined();
      expect(getTableName(aiCosts)).toBe('ai_costs');
    });

    it('exports users with correct table name', () => {
      expect(users).toBeDefined();
      expect(getTableName(users)).toBe('users');
    });
  });

  describe('Table column definitions', () => {
    it('workflowExecutions has required columns', () => {
      const columns = workflowExecutions;
      expect(columns.id).toBeDefined();
      expect(columns.type).toBeDefined();
      expect(columns.status).toBeDefined();
      expect(columns.input).toBeDefined();
      expect(columns.output).toBeDefined();
      expect(columns.error).toBeDefined();
      expect(columns.aiModel).toBeDefined();
      expect(columns.tokensInput).toBeDefined();
      expect(columns.tokensOutput).toBeDefined();
      expect(columns.costUsd).toBeDefined();
      expect(columns.startedAt).toBeDefined();
      expect(columns.completedAt).toBeDefined();
      expect(columns.duration).toBeDefined();
      expect(columns.userId).toBeDefined();
    });

    it('webhookEvents has required columns', () => {
      const columns = webhookEvents;
      expect(columns.id).toBeDefined();
      expect(columns.source).toBeDefined();
      expect(columns.eventType).toBeDefined();
      expect(columns.payload).toBeDefined();
      expect(columns.processed).toBeDefined();
      expect(columns.workflowExecutionId).toBeDefined();
    });

    it('users has required columns', () => {
      const columns = users;
      expect(columns.id).toBeDefined();
      expect(columns.googleId).toBeDefined();
      expect(columns.email).toBeDefined();
      expect(columns.name).toBeDefined();
      expect(columns.picture).toBeDefined();
      expect(columns.workspaceDomain).toBeDefined();
      expect(columns.isActive).toBeDefined();
      expect(columns.lastLogin).toBeDefined();
    });

    it('aiCosts has required columns', () => {
      const columns = aiCosts;
      expect(columns.id).toBeDefined();
      expect(columns.workflowExecutionId).toBeDefined();
      expect(columns.model).toBeDefined();
      expect(columns.tokensInput).toBeDefined();
      expect(columns.tokensOutput).toBeDefined();
      expect(columns.costUsd).toBeDefined();
    });

    it('metrics has required columns', () => {
      const columns = metrics;
      expect(columns.id).toBeDefined();
      expect(columns.metricType).toBeDefined();
      expect(columns.value).toBeDefined();
      expect(columns.metadata).toBeDefined();
    });
  });

  describe('Relations', () => {
    it('exports all relation definitions', () => {
      expect(workflowExecutionsRelations).toBeDefined();
      expect(webhookEventsRelations).toBeDefined();
      expect(aiCostsRelations).toBeDefined();
      expect(usersRelations).toBeDefined();
    });
  });
});
