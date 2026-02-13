-- Agent Sessions: tracks multi-agent orchestration execution
CREATE TABLE IF NOT EXISTS "agent_sessions" (
  "id" varchar(255) PRIMARY KEY,
  "workflow_execution_id" varchar(255) NOT NULL REFERENCES "workflow_executions"("id"),
  "workflow_type" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL,
  "context" jsonb NOT NULL,
  "total_cost_usd" numeric(10, 6) DEFAULT '0',
  "total_tokens_input" integer DEFAULT 0,
  "total_tokens_output" integer DEFAULT 0,
  "failure_count" integer DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "completed_at" timestamp with time zone
);

-- Agent Steps: individual agent execution records within a session
CREATE TABLE IF NOT EXISTS "agent_steps" (
  "id" varchar(255) PRIMARY KEY,
  "session_id" varchar(255) NOT NULL REFERENCES "agent_sessions"("id"),
  "role" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL,
  "attempt" integer NOT NULL DEFAULT 1,
  "input" jsonb,
  "output" jsonb,
  "raw_text" text,
  "error" text,
  "model" varchar(100),
  "tokens_input" integer,
  "tokens_output" integer,
  "cost_usd" numeric(10, 6),
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_workflow_exec ON agent_sessions(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_workflow_type ON agent_sessions(workflow_type);
CREATE INDEX IF NOT EXISTS idx_agent_steps_session ON agent_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_steps_role ON agent_steps(role);
CREATE INDEX IF NOT EXISTS idx_agent_steps_status ON agent_steps(status);
