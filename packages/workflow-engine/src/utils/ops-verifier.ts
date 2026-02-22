/**
 * Ops Verifier — DB/AWS 상태 검증 프롬프트 생성
 *
 * Claude Code executor를 통해 mcp__rtb-connections__ 도구를 사용하여
 * 배포 전 운영 환경 상태를 검증한다.
 */
import { createLogger } from '@rtb-ai-hub/shared';
import type { Environment } from '@rtb-ai-hub/shared';

const logger = createLogger('ops-verifier');

export type OpsVerificationResult = {
  passed: boolean;
  checks: OpsCheck[];
  summary: string;
};

export type OpsCheck = {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
};

/**
 * Build the prompt for Claude Code to run Ops verification
 * using mcp__rtb-connections__ tools
 */
export function buildOpsVerificationPrompt(issueKey: string, env: Environment): string {
  return `# Ops Verification: ${issueKey} (${env})

You are the DevOps/Ops verification agent. Before this PR can be deployed to ${env}, verify the environment is ready.

## Required Checks

### 1. DB Migration Check
Use \`mcp__rtb-connections__query_db\` to verify:
- No pending migrations that would conflict with this change
- Check current migration state:
  \`\`\`sql
  SELECT version, name, applied_at FROM drizzle_migrations ORDER BY applied_at DESC LIMIT 5;
  \`\`\`
- Verify table schemas are consistent

### 2. AWS Resource Check
Use \`mcp__rtb-connections__run_aws_cli\` to verify:
- ECS services are healthy: \`aws ecs describe-services --cluster rtb-ai-hub-${env}\`
- No CloudWatch alarms in ALARM state: \`aws cloudwatch describe-alarms --state-value ALARM\`
- Redis (ElastiCache) is accessible

### 3. Environment Connectivity
Use \`mcp__rtb-connections__check_db_connection\` to verify DB is reachable.
Use \`mcp__rtb-connections__check_aws_connection\` to verify AWS credentials are valid.

## Output Format

After all checks, output a JSON block:
\`\`\`json
{
  "passed": true|false,
  "checks": [
    { "name": "db-migrations", "status": "pass|fail|skip", "detail": "..." },
    { "name": "ecs-health", "status": "pass|fail|skip", "detail": "..." },
    { "name": "cloudwatch-alarms", "status": "pass|fail|skip", "detail": "..." },
    { "name": "db-connectivity", "status": "pass|fail|skip", "detail": "..." }
  ],
  "summary": "Brief summary of verification results"
}
\`\`\`

If any check FAILS, set "passed": false and explain why in the detail field.
For ${env === 'prd' ? 'PRODUCTION' : env.toUpperCase()} environment, ALL checks must pass before deployment.
`;
}

/**
 * Parse ops verification result from Claude Code output
 */
export function parseOpsVerificationResult(output: string): OpsVerificationResult {
  try {
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (typeof parsed.passed === 'boolean' && Array.isArray(parsed.checks)) {
        return parsed as OpsVerificationResult;
      }
    }
  } catch {
    // parse failed
  }

  logger.warn('Failed to parse ops verification JSON output — treating as failed');
  return {
    passed: false,
    checks: [{ name: 'parse-error', status: 'fail', detail: 'Could not parse verification output' }],
    summary: 'Ops verification output could not be parsed',
  };
}
