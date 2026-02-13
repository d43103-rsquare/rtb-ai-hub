CREATE TABLE decision_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT,
  source_type VARCHAR(20) NOT NULL,
  source_id VARCHAR(200) NOT NULL,
  source_url VARCHAR(500),
  participants TEXT[] DEFAULT '{}',
  related_jira_keys TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  superseded_by UUID,
  env VARCHAR(10) DEFAULT 'int',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decision_journal_source ON decision_journal(source_type, source_id);
CREATE INDEX idx_decision_journal_created ON decision_journal(created_at DESC);
CREATE INDEX idx_decision_journal_jira ON decision_journal USING gin(related_jira_keys);
CREATE INDEX idx_decision_journal_tags ON decision_journal USING gin(tags);
