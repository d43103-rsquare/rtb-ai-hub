CREATE TABLE context_links (
  id VARCHAR(255) PRIMARY KEY,
  jira_key VARCHAR(50) NOT NULL,
  jira_url VARCHAR(500),
  figma_file_key VARCHAR(200),
  figma_node_ids JSONB,
  figma_url VARCHAR(500),
  github_repo VARCHAR(200),
  github_branch VARCHAR(200),
  github_pr_numbers JSONB DEFAULT '[]',
  github_pr_urls JSONB DEFAULT '[]',
  preview_id VARCHAR(255),
  preview_web_url VARCHAR(500),
  preview_api_url VARCHAR(500),
  deployments JSONB DEFAULT '[]',
  slack_thread_ts VARCHAR(100),
  slack_channel_id VARCHAR(100),
  datadog_incident_ids JSONB DEFAULT '[]',
  team_members JSONB DEFAULT '{}',
  env VARCHAR(10) NOT NULL DEFAULT 'int',
  summary VARCHAR(500),
  status VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_context_links_jira_key ON context_links(jira_key);
CREATE INDEX idx_context_links_github_branch ON context_links(github_branch);
CREATE INDEX idx_context_links_figma_file ON context_links(figma_file_key);
CREATE INDEX idx_context_links_preview_id ON context_links(preview_id);
CREATE INDEX idx_context_links_env ON context_links(env);
