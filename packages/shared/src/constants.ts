/**
 * Shared Constants for RTB AI Hub
 */

import { WorkflowType } from './types';

// Queue Names
export const QUEUE_NAMES = {
  FIGMA: 'figma-queue',
  JIRA: 'jira-queue',
  GITHUB: 'github-queue',
  DATADOG: 'datadog-queue',
} as const;

// Workflow to Queue Mapping
export const WORKFLOW_QUEUE_MAP: Record<WorkflowType, string> = {
  [WorkflowType.FIGMA_TO_JIRA]: QUEUE_NAMES.FIGMA,
  [WorkflowType.JIRA_AUTO_DEV]: QUEUE_NAMES.JIRA,
  [WorkflowType.AUTO_REVIEW]: QUEUE_NAMES.GITHUB,
  [WorkflowType.DEPLOY_MONITOR]: QUEUE_NAMES.GITHUB,
  [WorkflowType.INCIDENT_TO_JIRA]: QUEUE_NAMES.DATADOG,
};

// Job Options
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 50,
};

// Database Tables
export const DB_TABLES = {
  WORKFLOW_EXECUTIONS: 'workflow_executions',
  WEBHOOK_EVENTS: 'webhook_events',
  METRICS: 'metrics',
  AI_COSTS: 'ai_costs',
} as const;

// AI Model Costs (per 1M tokens, USD)
export const AI_MODEL_COSTS = {
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-turbo-preview': { input: 10.0, output: 30.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-5-sonnet-20240620': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-20250414': { input: 0.8, output: 4.0 },
} as const;

// MCP Server Endpoints (internal Docker network)
export const MCP_ENDPOINTS = {
  JIRA: 'http://mcp-jira:3000',
  FIGMA: 'http://mcp-figma:3000',
  GITHUB: 'http://mcp-github:3000',
  DATADOG: 'http://mcp-datadog:3000',
} as const;

// Timeouts (milliseconds)
export const TIMEOUTS = {
  AI_REQUEST: 120000, // 2 minutes
  MCP_TOOL_CALL: 30000, // 30 seconds
  WEBHOOK_PROCESSING: 300000, // 5 minutes
  DATABASE_QUERY: 5000, // 5 seconds
} as const;
