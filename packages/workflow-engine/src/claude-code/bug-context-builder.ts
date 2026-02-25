import type { Environment } from '@rtb-ai-hub/shared';

export type BugFixContextInput = {
  issueKey: string;
  summary: string;
  description?: string;
  env: Environment;
  errorLogs?: string;
  relatedFiles?: string[];
  monitoringData?: string;
  stackTrace?: string;
  wikiKnowledge?: string;
};

export function buildBugFixClaudeMd(input: BugFixContextInput): string {
  const sections: string[] = [];

  sections.push(`# ${input.issueKey} — Bug Fix Guide\n`);
  sections.push(`**Summary**: ${input.summary}\n`);

  sections.push(`## Bug Report\n`);
  sections.push(input.description || 'No description provided.');

  if (input.errorLogs) {
    sections.push(`\n## Error Logs\n\n\`\`\`\n${input.errorLogs}\n\`\`\``);
  }

  if (input.stackTrace) {
    sections.push(`\n## Stack Trace\n\n\`\`\`\n${input.stackTrace}\n\`\`\``);
  }

  if (input.monitoringData) {
    sections.push(`\n## Monitoring Data\n\n${input.monitoringData}`);
  }

  if (input.relatedFiles && input.relatedFiles.length > 0) {
    sections.push(`\n## Related Files\n`);
    sections.push(input.relatedFiles.map((f) => `- \`${f}\``).join('\n'));
  }

  if (input.wikiKnowledge) {
    sections.push(`\n## Domain Knowledge\n\n${input.wikiKnowledge}`);
  }

  sections.push(`\n## Bug Fix Process\n`);
  sections.push(`Follow this process strictly:

### 1. Root Cause Analysis
- Read the bug report and error logs carefully
- Trace the error through the codebase
- Identify the root cause (not just the symptom)
- Document your analysis as a code comment at the fix location

### 2. Fix Implementation
- Make the minimal change needed to fix the root cause
- Do NOT refactor surrounding code
- Do NOT add unrelated improvements

### 3. Regression Test
- Write a regression test that would have caught this bug
- The test should fail without the fix and pass with it
- Place tests in the appropriate \`__tests__/\` directory

### 4. Verification
- Run existing tests to ensure no regressions
- Verify the fix addresses the reported symptoms`);

  sections.push(`\n## Environment: ${input.env}\n`);
  if (input.env === 'prd') {
    sections.push(`**Production rules:**
- No DB schema changes
- No \`console.log\` or \`debugger\`
- Minimal, surgical fix only
- Security-sensitive changes require extra review`);
  } else if (input.env === 'stg') {
    sections.push(`**Staging rules:**
- No force push
- Match production quality standards`);
  } else {
    sections.push(`**Integration rules:**
- Test coverage must be maintained
- Experimental approaches allowed if well-tested`);
  }

  sections.push(`\n## Quality Gates\n
1. TypeScript type check must pass
2. ESLint must pass
3. All existing + new tests must pass
4. Build must succeed`);

  return sections.join('\n');
}
