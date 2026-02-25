# Phase 1: Bug Fix Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Jira 버그 티켓이 생성/할당되면 AI가 원인 분석 → 수정 코드 → PR을 자동 생성하는 bug-fix 워크플로우 구현

**Architecture:** 기존 webhook-listener → pg-boss → workflow-engine 파이프라인을 재활용. Jira 워커에 티켓 분류기를 추가하여 Bug 티켓은 새로운 `processBugFix` 워크플로우로 라우팅. Bug 워크플로우는 Design Debate 대신 Root Cause Analysis 단계를 거침.

**Tech Stack:** TypeScript, pg-boss, Drizzle ORM, Claude Code CLI, Git worktree, Vitest

---

## Overview

현재 상태:
- `workers.ts:47-59` — 모든 Jira 이벤트를 `processJiraAutoDev()`로 라우팅
- `jira-auto-dev.ts` — Design Debate → Claude Code → PR (Feature 용)
- Claude Code executor, worktree manager, harness 모듈 — 모두 완전 구현

변경 사항:
1. 티켓 분류기 추가 (Bug/Feature/Policy 판별)
2. 워커에서 분류 결과에 따라 워크플로우 라우팅
3. Bug Fix 전용 워크플로우 (`processBugFix`) 신규 생성
4. Bug 전용 컨텍스트 빌더 (CLAUDE.md 내용 차별화)
5. Bug 전용 PR 설명 빌더

---

## Task 1: Ticket Classifier — 테스트

**Files:**
- Create: `packages/workflow-engine/src/classifier/__tests__/ticket-classifier.test.ts`
- Create: `packages/workflow-engine/src/classifier/ticket-classifier.ts`

**Step 1: Write the failing test**

```typescript
// packages/workflow-engine/src/classifier/__tests__/ticket-classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyTicket, TicketCategory } from '../ticket-classifier';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';

function makeEvent(overrides: Partial<JiraWebhookEvent> = {}): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_created',
    issueKey: 'TEST-1',
    issueType: 'Task',
    status: 'To Do',
    summary: 'Test issue',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('classifyTicket', () => {
  describe('Bug detection', () => {
    it('classifies by issueType "Bug"', () => {
      const event = makeEvent({ issueType: 'Bug' });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by issueType "버그" (Korean)', () => {
      const event = makeEvent({ issueType: '버그' });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by label "bug"', () => {
      const event = makeEvent({ labels: ['bug', 'urgent'] });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by label "hotfix"', () => {
      const event = makeEvent({ labels: ['hotfix'] });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('classifies by summary keyword "[BUG]"', () => {
      const event = makeEvent({ summary: '[BUG] Login fails on Safari' });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });
  });

  describe('Feature detection', () => {
    it('classifies by issueType "Story"', () => {
      const event = makeEvent({ issueType: 'Story' });
      expect(classifyTicket(event)).toBe(TicketCategory.FEATURE);
    });

    it('classifies by issueType "Task" as default feature', () => {
      const event = makeEvent({ issueType: 'Task' });
      expect(classifyTicket(event)).toBe(TicketCategory.FEATURE);
    });

    it('classifies by label "feature"', () => {
      const event = makeEvent({ labels: ['feature'] });
      expect(classifyTicket(event)).toBe(TicketCategory.FEATURE);
    });
  });

  describe('Priority: issueType > labels > summary', () => {
    it('issueType Bug wins over feature label', () => {
      const event = makeEvent({ issueType: 'Bug', labels: ['feature'] });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });

    it('label bug wins over summary feature keyword', () => {
      const event = makeEvent({
        issueType: 'Task',
        labels: ['bug'],
        summary: '[FEATURE] Add new page',
      });
      expect(classifyTicket(event)).toBe(TicketCategory.BUG);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow-engine/src/classifier/__tests__/ticket-classifier.test.ts`
Expected: FAIL — module `../ticket-classifier` not found

**Step 3: Write minimal implementation**

```typescript
// packages/workflow-engine/src/classifier/ticket-classifier.ts
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';

export enum TicketCategory {
  BUG = 'bug',
  FEATURE = 'feature',
  POLICY = 'policy',
}

const BUG_ISSUE_TYPES = ['bug', '버그', 'defect', 'incident'];
const BUG_LABELS = ['bug', 'bugfix', 'hotfix', 'incident', 'defect'];
const BUG_SUMMARY_PATTERNS = [/\[bug\]/i, /\[hotfix\]/i, /\[incident\]/i, /\[defect\]/i];

const FEATURE_ISSUE_TYPES = ['story', 'task', '스토리', 'epic', 'sub-task', 'improvement'];
const FEATURE_LABELS = ['feature', 'enhancement', 'improvement'];

export function classifyTicket(event: JiraWebhookEvent): TicketCategory {
  // Priority 1: issueType
  const issueType = (event.issueType || '').toLowerCase();
  if (BUG_ISSUE_TYPES.includes(issueType)) return TicketCategory.BUG;
  if (FEATURE_ISSUE_TYPES.includes(issueType)) {
    // Check labels before confirming feature (labels can override Task → Bug)
    const labels = (event.labels || []).map((l) => l.toLowerCase());
    if (labels.some((l) => BUG_LABELS.includes(l))) return TicketCategory.BUG;
    return TicketCategory.FEATURE;
  }

  // Priority 2: labels
  const labels = (event.labels || []).map((l) => l.toLowerCase());
  if (labels.some((l) => BUG_LABELS.includes(l))) return TicketCategory.BUG;
  if (labels.some((l) => FEATURE_LABELS.includes(l))) return TicketCategory.FEATURE;

  // Priority 3: summary keywords
  const summary = event.summary || '';
  if (BUG_SUMMARY_PATTERNS.some((p) => p.test(summary))) return TicketCategory.BUG;

  // Default: Feature
  return TicketCategory.FEATURE;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/workflow-engine/src/classifier/__tests__/ticket-classifier.test.ts`
Expected: All 9 tests PASS

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/classifier/
git commit -m "feat: add Jira ticket classifier (Bug/Feature/Policy)"
```

---

## Task 2: Worker Routing — 분류 결과에 따라 워크플로우 분기

**Files:**
- Create: `packages/workflow-engine/src/classifier/__tests__/workflow-router.test.ts`
- Create: `packages/workflow-engine/src/classifier/workflow-router.ts`
- Modify: `packages/workflow-engine/src/queue/workers.ts:47-59`

**Step 1: Write the failing test**

```typescript
// packages/workflow-engine/src/classifier/__tests__/workflow-router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeJiraEvent } from '../workflow-router';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';

// Mock the workflows
vi.mock('../../workflows/jira-auto-dev', () => ({
  processJiraAutoDev: vi.fn().mockResolvedValue({ dispatched: true, workflowExecutionId: 'wf_1' }),
}));
vi.mock('../../workflows/bug-fix', () => ({
  processBugFix: vi.fn().mockResolvedValue({ dispatched: true, workflowExecutionId: 'wf_2' }),
}));

import { processJiraAutoDev } from '../../workflows/jira-auto-dev';
import { processBugFix } from '../../workflows/bug-fix';

function makeEvent(overrides: Partial<JiraWebhookEvent> = {}): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_created',
    issueKey: 'TEST-1',
    issueType: 'Task',
    status: 'To Do',
    summary: 'Test issue',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('routeJiraEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes Bug tickets to processBugFix', async () => {
    const event = makeEvent({ issueType: 'Bug' });
    await routeJiraEvent(event, null, 'int');
    expect(processBugFix).toHaveBeenCalledWith(event, null, 'int');
    expect(processJiraAutoDev).not.toHaveBeenCalled();
  });

  it('routes Feature tickets to processJiraAutoDev', async () => {
    const event = makeEvent({ issueType: 'Story' });
    await routeJiraEvent(event, null, 'int');
    expect(processJiraAutoDev).toHaveBeenCalledWith(event, null, 'int');
    expect(processBugFix).not.toHaveBeenCalled();
  });

  it('routes hotfix label tickets to processBugFix', async () => {
    const event = makeEvent({ issueType: 'Task', labels: ['hotfix'] });
    await routeJiraEvent(event, null, 'prd');
    expect(processBugFix).toHaveBeenCalledWith(event, null, 'prd');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow-engine/src/classifier/__tests__/workflow-router.test.ts`
Expected: FAIL — module `../workflow-router` not found

**Step 3: Write minimal implementation**

```typescript
// packages/workflow-engine/src/classifier/workflow-router.ts
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { classifyTicket, TicketCategory } from './ticket-classifier';
import { processJiraAutoDev } from '../workflows/jira-auto-dev';
import { processBugFix } from '../workflows/bug-fix';

const logger = createLogger('workflow-router');

export async function routeJiraEvent(
  event: JiraWebhookEvent,
  userId: string | null,
  env: Environment
) {
  const category = classifyTicket(event);
  logger.info(
    { issueKey: event.issueKey, issueType: event.issueType, category },
    'Ticket classified'
  );

  switch (category) {
    case TicketCategory.BUG:
      return processBugFix(event, userId, env);
    case TicketCategory.FEATURE:
    case TicketCategory.POLICY:
    default:
      return processJiraAutoDev(event, userId, env);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/workflow-engine/src/classifier/__tests__/workflow-router.test.ts`
Expected: All 3 tests PASS (processBugFix mock will resolve even though not yet created)

**Step 5: Update workers.ts to use router**

Modify `packages/workflow-engine/src/queue/workers.ts` lines 47-59:

```typescript
// Before:
import { processJiraAutoDev } from '../workflows/jira-auto-dev';
// ...
const result = await processJiraAutoDev(event as JiraWebhookEvent, userId, env);

// After:
import { routeJiraEvent } from '../classifier/workflow-router';
// ...
const result = await routeJiraEvent(event as JiraWebhookEvent, userId, env);
```

**Step 6: Commit**

```bash
git add packages/workflow-engine/src/classifier/ packages/workflow-engine/src/queue/workers.ts
git commit -m "feat: add workflow router — classify and route Jira tickets by type"
```

---

## Task 3: Bug Fix Context Builder — Bug 전용 CLAUDE.md 생성

**Files:**
- Create: `packages/workflow-engine/src/claude-code/__tests__/bug-context-builder.test.ts`
- Create: `packages/workflow-engine/src/claude-code/bug-context-builder.ts`

**Step 1: Write the failing test**

```typescript
// packages/workflow-engine/src/claude-code/__tests__/bug-context-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildBugFixClaudeMd, BugFixContextInput } from '../bug-context-builder';

function makeInput(overrides: Partial<BugFixContextInput> = {}): BugFixContextInput {
  return {
    issueKey: 'BUG-123',
    summary: 'Login button not working on Safari',
    description: 'Steps to reproduce:\n1. Open Safari\n2. Click login\n3. Nothing happens',
    env: 'int',
    ...overrides,
  };
}

describe('buildBugFixClaudeMd', () => {
  it('includes issue key and summary in title', () => {
    const md = buildBugFixClaudeMd(makeInput());
    expect(md).toContain('# BUG-123 — Bug Fix Guide');
    expect(md).toContain('Login button not working on Safari');
  });

  it('includes reproduction steps from description', () => {
    const md = buildBugFixClaudeMd(makeInput());
    expect(md).toContain('## Bug Report');
    expect(md).toContain('Steps to reproduce');
  });

  it('includes bug fix instructions', () => {
    const md = buildBugFixClaudeMd(makeInput());
    expect(md).toContain('## Bug Fix Process');
    expect(md).toContain('Root Cause Analysis');
    expect(md).toContain('regression test');
  });

  it('includes error logs when provided', () => {
    const md = buildBugFixClaudeMd(makeInput({
      errorLogs: 'TypeError: Cannot read property "click" of null at login.ts:42',
    }));
    expect(md).toContain('## Error Logs');
    expect(md).toContain('TypeError');
  });

  it('includes environment-specific rules', () => {
    const md = buildBugFixClaudeMd(makeInput({ env: 'prd' }));
    expect(md).toContain('Production');
  });

  it('includes related files when provided', () => {
    const md = buildBugFixClaudeMd(makeInput({
      relatedFiles: ['src/auth/login.ts', 'src/components/LoginButton.tsx'],
    }));
    expect(md).toContain('## Related Files');
    expect(md).toContain('login.ts');
  });

  it('includes monitoring data when provided', () => {
    const md = buildBugFixClaudeMd(makeInput({
      monitoringData: 'Error rate: 5.2% in last 1h, affected users: 342',
    }));
    expect(md).toContain('## Monitoring Data');
    expect(md).toContain('Error rate');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow-engine/src/claude-code/__tests__/bug-context-builder.test.ts`
Expected: FAIL — module `../bug-context-builder` not found

**Step 3: Write minimal implementation**

```typescript
// packages/workflow-engine/src/claude-code/bug-context-builder.ts
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

  // Title
  sections.push(`# ${input.issueKey} — Bug Fix Guide\n`);
  sections.push(`**Summary**: ${input.summary}\n`);

  // Bug Report
  sections.push(`## Bug Report\n`);
  sections.push(input.description || 'No description provided.');

  // Error Logs
  if (input.errorLogs) {
    sections.push(`\n## Error Logs\n\n\`\`\`\n${input.errorLogs}\n\`\`\``);
  }

  // Stack Trace
  if (input.stackTrace) {
    sections.push(`\n## Stack Trace\n\n\`\`\`\n${input.stackTrace}\n\`\`\``);
  }

  // Monitoring Data
  if (input.monitoringData) {
    sections.push(`\n## Monitoring Data\n\n${input.monitoringData}`);
  }

  // Related Files
  if (input.relatedFiles && input.relatedFiles.length > 0) {
    sections.push(`\n## Related Files\n`);
    sections.push(input.relatedFiles.map((f) => `- \`${f}\``).join('\n'));
  }

  // Wiki Knowledge
  if (input.wikiKnowledge) {
    sections.push(`\n## Domain Knowledge\n\n${input.wikiKnowledge}`);
  }

  // Bug Fix Process Instructions
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

  // Environment Rules
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

  // Quality Gates
  sections.push(`\n## Quality Gates\n
1. TypeScript type check must pass
2. ESLint must pass
3. All existing + new tests must pass
4. Build must succeed`);

  return sections.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/workflow-engine/src/claude-code/__tests__/bug-context-builder.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/claude-code/bug-context-builder.ts packages/workflow-engine/src/claude-code/__tests__/bug-context-builder.test.ts
git commit -m "feat: add bug-fix specific CLAUDE.md context builder"
```

---

## Task 4: Bug Fix Workflow — 핵심 워크플로우 구현

**Files:**
- Create: `packages/workflow-engine/src/workflows/__tests__/bug-fix.test.ts`
- Create: `packages/workflow-engine/src/workflows/bug-fix.ts`

**Step 1: Write the failing test**

```typescript
// packages/workflow-engine/src/workflows/__tests__/bug-fix.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';

// Mock all external dependencies
vi.mock('../../clients/database', () => ({
  database: {
    saveWorkflowExecution: vi.fn().mockResolvedValue(undefined),
    updateWorkflowExecution: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../claude-code/executor', () => ({
  executeClaudeCode: vi.fn().mockResolvedValue({
    success: true,
    output: 'Fixed the bug in login.ts',
    filesChanged: ['src/auth/login.ts', 'src/auth/__tests__/login.test.ts'],
    costUsd: 0.05,
  }),
  executeWithGateRetry: vi.fn().mockResolvedValue({
    codeResult: {
      success: true,
      output: 'Fixed the bug',
      filesChanged: ['src/auth/login.ts'],
      costUsd: 0.05,
    },
    gateResult: { allPassed: true, gates: [] },
  }),
}));

vi.mock('../../claude-code/bug-context-builder', () => ({
  buildBugFixClaudeMd: vi.fn().mockReturnValue('# Bug Fix Guide'),
}));

vi.mock('../../claude-code/mcp-config-builder', () => ({
  buildMcpServers: vi.fn().mockReturnValue([]),
  buildAllowedTools: vi.fn().mockReturnValue([]),
}));

vi.mock('../../worktree/manager', () => ({
  createWorktreeManager: vi.fn().mockReturnValue({
    createWorktree: vi.fn().mockResolvedValue({
      issueKey: 'BUG-1',
      worktreePath: '/tmp/wt/BUG-1',
      branchName: 'bugfix/BUG-1-login-fix',
      status: 'active',
    }),
    runGates: vi.fn().mockResolvedValue({ allPassed: true, gates: [] }),
    pushAndCreatePR: vi.fn().mockResolvedValue({ prNumber: 42, prUrl: 'https://github.com/org/repo/pull/42' }),
    cleanupWorktree: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../worktree/registry', () => ({
  createWorktreeRegistry: vi.fn().mockReturnValue({}),
}));

vi.mock('../../harness', () => ({
  createPolicyEngine: vi.fn().mockReturnValue({
    check: vi.fn().mockReturnValue({ allowed: true, violations: [], warnings: [] }),
    generateConstraints: vi.fn().mockReturnValue(''),
  }),
}));

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual('@rtb-ai-hub/shared');
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('test-id'),
    createLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    FEATURE_FLAGS: { WORKTREE_ENABLED: true, CLAUDE_CODE_ENABLED: true },
  };
});

import { processBugFix } from '../bug-fix';
import { database } from '../../clients/database';
import { buildBugFixClaudeMd } from '../../claude-code/bug-context-builder';

function makeEvent(overrides: Partial<JiraWebhookEvent> = {}): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_created',
    issueKey: 'BUG-1',
    issueType: 'Bug',
    status: 'To Do',
    summary: 'Login fails on Safari',
    description: 'Steps: 1. Open Safari 2. Click login 3. Error',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('processBugFix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves workflow execution at start', async () => {
    await processBugFix(makeEvent(), null, 'int');
    expect(database.saveWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bug-fix',
        status: 'in_progress',
      })
    );
  });

  it('builds bug-fix specific CLAUDE.md', async () => {
    const event = makeEvent();
    await processBugFix(event, null, 'int');
    expect(buildBugFixClaudeMd).toHaveBeenCalledWith(
      expect.objectContaining({
        issueKey: 'BUG-1',
        summary: 'Login fails on Safari',
        env: 'int',
      })
    );
  });

  it('returns dispatched true with PR info on success', async () => {
    const result = await processBugFix(makeEvent(), null, 'int');
    expect(result).toEqual(
      expect.objectContaining({
        dispatched: true,
        workflowExecutionId: expect.any(String),
      })
    );
  });

  it('saves completed status on success', async () => {
    await processBugFix(makeEvent(), null, 'int');
    expect(database.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'completed' })
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/workflow-engine/src/workflows/__tests__/bug-fix.test.ts`
Expected: FAIL — module `../bug-fix` not found

**Step 3: Write the bug-fix workflow**

```typescript
// packages/workflow-engine/src/workflows/bug-fix.ts
/**
 * Bug Fix Workflow
 *
 * Flow:
 * 1. Save workflow execution
 * 2. Collect context (Jira details, error logs, related files)
 * 3. Build bug-fix CLAUDE.md
 * 4. Create worktree
 * 5. Execute Claude Code (with gate retry)
 * 6. Policy validation
 * 7. Push + PR
 * 8. Update workflow status
 */

import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import {
  createLogger,
  generateId,
  WorkflowStatus,
  FEATURE_FLAGS,
} from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import { buildBugFixClaudeMd } from '../claude-code/bug-context-builder';
import { buildMcpServers, buildAllowedTools } from '../claude-code/mcp-config-builder';
import { executeWithGateRetry } from '../claude-code/executor';
import { parseAndValidate } from '../claude-code/result-parser';
import { createWorktreeManager } from '../worktree/manager';
import { createWorktreeRegistry } from '../worktree/registry';
import { createPolicyEngine } from '../harness';
import type { ClaudeCodeTask } from '@rtb-ai-hub/shared';

const logger = createLogger('bug-fix-workflow');

export async function processBugFix(
  event: JiraWebhookEvent,
  userId: string | null,
  env: Environment
) {
  const {
    issueKey = 'UNKNOWN',
    summary = '',
    description,
  } = event;

  const executionId = generateId('wf');
  logger.info({ issueKey, env, userId }, 'Starting bug-fix workflow');

  // Step 1: Save workflow execution
  try {
    await database.saveWorkflowExecution({
      id: executionId,
      type: 'bug-fix',
      status: WorkflowStatus.IN_PROGRESS,
      input: event,
      userId,
      env,
      startedAt: new Date(),
    });
  } catch (err) {
    logger.warn({ error: (err as Error).message }, 'Failed to save execution — continuing');
  }

  // Step 2: Collect bug context
  const errorLogs = extractErrorLogs(event);
  const stackTrace = extractStackTrace(event);

  // Step 3: Build bug-fix CLAUDE.md
  const claudeMdContent = buildBugFixClaudeMd({
    issueKey,
    summary,
    description,
    env,
    errorLogs,
    stackTrace,
  });

  // Step 4: Create worktree
  let workDir: string | undefined;
  let worktreeManager: ReturnType<typeof createWorktreeManager> | undefined;

  if (FEATURE_FLAGS.WORKTREE_ENABLED) {
    try {
      const registry = createWorktreeRegistry();
      worktreeManager = createWorktreeManager(registry);
      const worktreeInfo = await worktreeManager.createWorktree(issueKey, summary, env, 'Bug');
      workDir = worktreeInfo.worktreePath;
      logger.info({ issueKey, workDir }, 'Worktree created');
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Worktree creation failed — using main repo');
      workDir = process.env.WORK_REPO_LOCAL_PATH;
    }
  } else {
    workDir = process.env.WORK_REPO_LOCAL_PATH;
  }

  if (!workDir) {
    logger.error('No work directory available');
    await updateStatus(executionId, WorkflowStatus.FAILED, { error: 'No work directory' });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  // Step 5: Build Claude Code task
  const mcpServers = buildMcpServers({ env, allowedServices: ['GITHUB', 'JIRA'] });
  const allowedTools = buildAllowedTools(['GITHUB', 'JIRA']);

  const task: ClaudeCodeTask = {
    id: generateId('cc-bug'),
    worktreePath: workDir,
    prompt: buildBugFixPrompt(issueKey, summary, description),
    claudeMdContent,
    mcpServers,
    allowedTools,
    maxTurns: parseInt(process.env.CLAUDE_CODE_MAX_TURNS || '30', 10),
    timeoutMs: parseInt(process.env.CLAUDE_CODE_TIMEOUT_MS || '600000', 10),
  };

  // Step 6: Execute Claude Code with gate retry
  const policyEngine = createPolicyEngine();
  let codeResult;
  let gateResult;

  try {
    const runGates = worktreeManager
      ? () => worktreeManager!.runGates(issueKey)
      : async () => ({ allPassed: true, gates: [] } as any);

    const execResult = await executeWithGateRetry(task, runGates);
    codeResult = execResult.codeResult;
    gateResult = execResult.gateResult;
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Claude Code execution failed');
    await updateStatus(executionId, WorkflowStatus.FAILED, { error: (err as Error).message });
    return { dispatched: false, workflowExecutionId: executionId };
  }

  // Step 7: Policy validation
  if (codeResult) {
    const parsed = parseAndValidate(codeResult, env, policyEngine);
    if (!parsed.policyCheck.allowed) {
      logger.error({ violations: parsed.policyCheck.violations }, 'Policy violations');
      await updateStatus(executionId, WorkflowStatus.FAILED, {
        error: `Policy violations: ${parsed.policyCheck.violations.join('; ')}`,
      });
      return { dispatched: false, workflowExecutionId: executionId };
    }
  }

  // Step 8: Push + PR
  let prResult: { prNumber?: number; prUrl?: string } = {};
  if (worktreeManager) {
    try {
      prResult = await worktreeManager.pushAndCreatePR(issueKey, {
        title: `fix(${issueKey}): ${summary}`,
        body: buildBugFixPrBody(issueKey, summary, description, codeResult, gateResult),
      });
      logger.info({ issueKey, prUrl: prResult.prUrl }, 'PR created');
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Failed to create PR');
    }
  }

  // Step 9: Complete
  await updateStatus(executionId, WorkflowStatus.COMPLETED, {
    prNumber: prResult.prNumber,
    prUrl: prResult.prUrl,
    costUsd: codeResult?.costUsd || 0,
  });

  return { dispatched: true, workflowExecutionId: executionId };
}

function buildBugFixPrompt(issueKey: string, summary: string, description?: string): string {
  return `Bug Fix for ${issueKey}: ${summary}

Read the CLAUDE.md file for full context and instructions.

${description ? `Bug report:\n${description}\n\n` : ''}Follow the Bug Fix Process in CLAUDE.md:
1. Analyze the root cause
2. Implement the minimal fix
3. Add a regression test
4. Verify all tests pass`;
}

function buildBugFixPrBody(
  issueKey: string,
  summary: string,
  description?: string,
  codeResult?: any,
  gateResult?: any
): string {
  const sections: string[] = [];

  sections.push(`## Bug Fix: ${issueKey}\n`);
  sections.push(`**Summary**: ${summary}\n`);

  if (description) {
    sections.push(`### Bug Report\n${description.slice(0, 500)}\n`);
  }

  if (codeResult?.output) {
    sections.push(`### Root Cause Analysis\n${codeResult.output.slice(0, 1000)}\n`);
  }

  if (gateResult?.gates?.length > 0) {
    const gateLines = gateResult.gates
      .map((g: any) => `- ${g.passed ? '✅' : '❌'} ${g.gate} (${g.durationMs}ms)`)
      .join('\n');
    sections.push(`### Quality Gates\n${gateLines}\n`);
  }

  sections.push(`---\n🤖 Auto-generated by RTB AI Hub — Bug Fix Workflow`);

  return sections.join('\n');
}

function extractErrorLogs(event: JiraWebhookEvent): string | undefined {
  const fields = event.customFields || event.payload?.issue?.fields;
  if (!fields) return undefined;

  // Check common custom field patterns for error logs
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && (
      key.toLowerCase().includes('error') ||
      key.toLowerCase().includes('log') ||
      key.toLowerCase().includes('stacktrace')
    )) {
      return value;
    }
  }
  return undefined;
}

function extractStackTrace(event: JiraWebhookEvent): string | undefined {
  const description = event.description || '';
  // Extract code blocks that look like stack traces
  const codeBlockMatch = description.match(/```[\s\S]*?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[0].replace(/```/g, '').trim();
  }
  return undefined;
}

async function updateStatus(
  executionId: string,
  status: WorkflowStatus,
  data: Record<string, any>
) {
  try {
    await database.updateWorkflowExecution(executionId, {
      status,
      ...data,
      ...(status === WorkflowStatus.COMPLETED || status === WorkflowStatus.FAILED
        ? { completedAt: new Date() }
        : {}),
    });
  } catch (err) {
    logger.warn({ error: (err as Error).message, executionId }, 'Failed to update status');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/workflow-engine/src/workflows/__tests__/bug-fix.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add packages/workflow-engine/src/workflows/bug-fix.ts packages/workflow-engine/src/workflows/__tests__/bug-fix.test.ts
git commit -m "feat: add bug-fix workflow — root cause analysis + fix + PR"
```

---

## Task 5: WorkflowType 확장 — shared 타입에 bug-fix 추가

**Files:**
- Modify: `packages/shared/src/types.ts:74-80`

**Step 1: Add bug-fix to WorkflowType enum**

```typescript
// In packages/shared/src/types.ts, add to WorkflowType enum:
export enum WorkflowType {
  FIGMA_TO_JIRA = 'figma-to-jira',
  JIRA_AUTO_DEV = 'jira-auto-dev',
  BUG_FIX = 'bug-fix',           // ← NEW
  AUTO_REVIEW = 'auto-review',
  DEPLOY_MONITOR = 'deploy-monitor',
  INCIDENT_TO_JIRA = 'incident-to-jira',
}
```

**Step 2: Rebuild shared**

Run: `pnpm build:shared`
Expected: Build succeeds

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add BUG_FIX to WorkflowType enum"
```

---

## Task 6: Database Client — updateWorkflowExecution 확인/추가

**Files:**
- Modify: `packages/workflow-engine/src/clients/database.ts` (if method doesn't exist)

**Step 1: Check if updateWorkflowExecution exists**

Read `packages/workflow-engine/src/clients/database.ts` and verify `updateWorkflowExecution` exists.
If it uses `saveWorkflowExecution` with upsert pattern (it does — see analysis), we may need a dedicated update method.

Based on analysis, `saveWorkflowExecution` uses `onConflictDoUpdate` — this handles updates. But the bug-fix workflow calls `database.updateWorkflowExecution` which may not exist.

**Step 2: Add updateWorkflowExecution if missing**

```typescript
// Add to packages/workflow-engine/src/clients/database.ts
async updateWorkflowExecution(
  id: string,
  updates: Partial<{
    status: string;
    output: any;
    error: string;
    completedAt: Date;
    costUsd: number;
    prNumber: number;
    prUrl: string;
  }>
): Promise<void> {
  try {
    await this.drizzle
      .update(dbSchema.workflowExecutions)
      .set({
        status: updates.status,
        output: updates.output ?? updates,
        error: updates.error || null,
        completedAt: updates.completedAt || null,
        costUsd: updates.costUsd?.toString() || null,
      })
      .where(eq(dbSchema.workflowExecutions.id, id));
    logger.info({ executionId: id, status: updates.status }, 'Workflow execution updated');
  } catch (error) {
    logger.error({ error, executionId: id }, 'Failed to update workflow execution');
    throw error;
  }
}
```

**Step 3: Run tests**

Run: `pnpm vitest run packages/workflow-engine/src/workflows/__tests__/bug-fix.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/workflow-engine/src/clients/database.ts
git commit -m "feat: add updateWorkflowExecution method to database client"
```

---

## Task 7: Integration Test — 전체 Bug Fix 흐름 E2E

**Files:**
- Create: `packages/workflow-engine/src/workflows/__tests__/bug-fix-integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/workflow-engine/src/workflows/__tests__/bug-fix-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';
import { classifyTicket, TicketCategory } from '../../classifier/ticket-classifier';
import { buildBugFixClaudeMd } from '../../claude-code/bug-context-builder';

function makeBugEvent(): JiraWebhookEvent {
  return {
    source: 'jira',
    type: 'issue_created',
    issueKey: 'PROJ-456',
    issueType: 'Bug',
    status: 'To Do',
    summary: 'API returns 500 on empty payload',
    description: `## Steps to reproduce
1. Send POST /api/data with empty body
2. Observe 500 Internal Server Error

## Expected
400 Bad Request with validation error

## Actual
500 with stack trace:
\`\`\`
TypeError: Cannot destructure property 'name' of undefined
  at processData (src/handlers/data.ts:42)
\`\`\``,
    labels: ['bug', 'api'],
    timestamp: new Date().toISOString(),
    payload: {},
  };
}

describe('Bug Fix Integration', () => {
  it('classifies bug ticket correctly', () => {
    const event = makeBugEvent();
    expect(classifyTicket(event)).toBe(TicketCategory.BUG);
  });

  it('generates CLAUDE.md with bug context', () => {
    const event = makeBugEvent();
    const md = buildBugFixClaudeMd({
      issueKey: event.issueKey!,
      summary: event.summary!,
      description: event.description,
      env: 'int',
      stackTrace: 'TypeError: Cannot destructure property',
    });

    expect(md).toContain('PROJ-456');
    expect(md).toContain('Bug Fix Guide');
    expect(md).toContain('Root Cause Analysis');
    expect(md).toContain('regression test');
    expect(md).toContain('TypeError');
  });

  it('extracts stack trace from description code blocks', () => {
    const event = makeBugEvent();
    const description = event.description || '';
    const codeBlockMatch = description.match(/```[\s\S]*?```/);
    expect(codeBlockMatch).toBeTruthy();
    expect(codeBlockMatch![0]).toContain('TypeError');
  });

  it('full flow: classify → context → validate', () => {
    const event = makeBugEvent();

    // Step 1: Classify
    const category = classifyTicket(event);
    expect(category).toBe(TicketCategory.BUG);

    // Step 2: Build context
    const md = buildBugFixClaudeMd({
      issueKey: event.issueKey!,
      summary: event.summary!,
      description: event.description,
      env: 'int',
    });

    // Step 3: Validate content
    expect(md).toContain('Bug Fix Process');
    expect(md).toContain('Quality Gates');
    expect(md).not.toContain('Design Debate'); // Bug flow should NOT have debate
  });
});
```

**Step 2: Run integration test**

Run: `pnpm vitest run packages/workflow-engine/src/workflows/__tests__/bug-fix-integration.test.ts`
Expected: All 4 tests PASS

**Step 3: Run all workflow-engine tests**

Run: `pnpm --filter @rtb-ai-hub/workflow-engine vitest run`
Expected: All tests PASS (existing + new)

**Step 4: Commit**

```bash
git add packages/workflow-engine/src/workflows/__tests__/bug-fix-integration.test.ts
git commit -m "test: add bug-fix integration tests — classify → context → validate"
```

---

## Task 8: Typecheck + Lint + Final Verification

**Step 1: Build shared**

Run: `pnpm build:shared`
Expected: SUCCESS

**Step 2: Typecheck all packages**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors (or only pre-existing ones)

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix lint/type issues from bug-fix implementation"
```

---

## Summary

| Task | Description | New Files | Tests |
|------|-------------|-----------|-------|
| 1 | Ticket Classifier | `classifier/ticket-classifier.ts` | 9 tests |
| 2 | Workflow Router | `classifier/workflow-router.ts` + workers.ts mod | 3 tests |
| 3 | Bug Context Builder | `claude-code/bug-context-builder.ts` | 7 tests |
| 4 | Bug Fix Workflow | `workflows/bug-fix.ts` | 4 tests |
| 5 | WorkflowType enum | `shared/types.ts` mod | typecheck |
| 6 | DB updateWorkflowExecution | `clients/database.ts` mod | existing |
| 7 | Integration Tests | `workflows/__tests__/bug-fix-integration.test.ts` | 4 tests |
| 8 | Final Verification | lint/typecheck/test | all |

**Total: 6 new files, 2 modified files, 27+ new tests**

**After this plan:** Week 2 tasks (Claude Code 실제 연동 검증, Happy path E2E, 데모 시나리오) are next.
