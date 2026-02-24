-- Migration: Add agent_model_config table for per-agent provider settings
-- Supports multi-provider AI routing (Claude, OpenAI, Gemini) per agent persona

CREATE TABLE IF NOT EXISTS agent_model_config (
  id VARCHAR(255) PRIMARY KEY,
  persona VARCHAR(50) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  model VARCHAR(100) NOT NULL,
  env VARCHAR(10) NOT NULL DEFAULT 'all',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_model_config_persona ON agent_model_config(persona);
CREATE INDEX IF NOT EXISTS idx_agent_model_config_env ON agent_model_config(env);
