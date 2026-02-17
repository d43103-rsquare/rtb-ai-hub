-- Migration: Add debate_sessions table for turn-based debate engine
-- Part of RTB AI Hub v2 architecture refactoring

CREATE TABLE IF NOT EXISTS debate_sessions (
  id VARCHAR(255) PRIMARY KEY,
  workflow_execution_id VARCHAR(255) NOT NULL REFERENCES workflow_executions(id),
  config JSONB NOT NULL,
  turns JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome JSONB,
  total_tokens_input INTEGER DEFAULT 0,
  total_tokens_output INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_debate_sessions_workflow_exec ON debate_sessions(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_debate_sessions_created_at ON debate_sessions(created_at);
