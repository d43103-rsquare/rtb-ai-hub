ALTER TABLE workflow_executions ADD COLUMN timeline JSONB DEFAULT '[]';
ALTER TABLE workflow_executions ADD COLUMN artifacts JSONB DEFAULT '{}';
ALTER TABLE workflow_executions ADD COLUMN gate_decisions JSONB DEFAULT '{}';
ALTER TABLE workflow_executions ADD COLUMN progress INTEGER DEFAULT 0;
ALTER TABLE workflow_executions ADD COLUMN assignee VARCHAR(50);
ALTER TABLE workflow_executions ADD COLUMN jira_key VARCHAR(50);
ALTER TABLE workflow_executions ADD COLUMN summary VARCHAR(500);

CREATE INDEX idx_workflow_executions_jira_key ON workflow_executions(jira_key);
CREATE INDEX idx_workflow_executions_progress ON workflow_executions(progress);
