ALTER TABLE "workflow_executions" ADD COLUMN "env" varchar(10) NOT NULL DEFAULT 'int';
ALTER TABLE "webhook_events" ADD COLUMN "env" varchar(10) NOT NULL DEFAULT 'int';

CREATE INDEX IF NOT EXISTS "idx_workflow_executions_env" ON "workflow_executions" ("env");
CREATE INDEX IF NOT EXISTS "idx_webhook_events_env" ON "webhook_events" ("env");
