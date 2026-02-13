-- Add e2e_test_result column to workflow_executions table
ALTER TABLE "workflow_executions" ADD COLUMN "e2e_test_result" jsonb;
