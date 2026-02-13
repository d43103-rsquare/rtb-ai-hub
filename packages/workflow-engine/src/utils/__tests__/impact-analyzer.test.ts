import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeImpact,
  analyzeDiff,
  assessRisks,
  generateSummary,
  extractModuleName,
  determineImpactLevel,
} from '../impact-analyzer';
import type {
  ImpactAnalysisInput,
  ImpactReport,
  ModuleImpact,
  SimilarChange,
  RiskFactor,
} from '../impact-analyzer';
import { formatImpactForPr, formatImpactForSlack } from '../impact-formatter';
import type { ImpactAnalysisConfig } from '@rtb-ai-hub/shared';

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<typeof import('@rtb-ai-hub/shared')>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    loadImpactAnalysisConfig: vi.fn().mockReturnValue({
      enabled: true,
      similarChangeLimit: 10,
      highThreshold: 10,
      mediumThreshold: 3,
    }),
  };
});

const defaultConfig: ImpactAnalysisConfig = {
  enabled: true,
  similarChangeLimit: 10,
  highThreshold: 10,
  mediumThreshold: 3,
};

const sampleDiff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index abc1234..def5678 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,5 +1,10 @@
+import { validateToken } from './token';
 export function login(user: string) {
-  return false;
+  return validateToken(user);
 }
diff --git a/src/auth/token.ts b/src/auth/token.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/auth/token.ts
@@ -0,0 +1,3 @@
+export function validateToken(user: string) {
+  return true;
+}
diff --git a/packages/shared/types.ts b/packages/shared/types.ts
index abc1234..def5678 100644
--- a/packages/shared/types.ts
+++ b/packages/shared/types.ts
@@ -1,3 +1,5 @@
 export type User = {
   name: string;
+  email: string;
+  role: string;
 };
+export type UserRole = 'admin' | 'user';`;

const largeDiff = Array.from(
  { length: 25 },
  (_, i) =>
    `diff --git a/src/module${i}/file${i}.ts b/src/module${i}/file${i}.ts
index abc..def 100644
--- a/src/module${i}/file${i}.ts
+++ b/src/module${i}/file${i}.ts
@@ -1 +1 @@
-old
+new`
).join('\n');

const typeDiff = `diff --git a/packages/shared/types.ts b/packages/shared/types.ts
index abc..def 100644
--- a/packages/shared/types.ts
+++ b/packages/shared/types.ts
@@ -1,3 +1,5 @@
-export type User = { name: string };
+export type User = { name: string; email: string };
+export interface AuthConfig { secret: string; }
+export enum Role { ADMIN, USER }`;

const migrationDiff = `diff --git a/drizzle/0005_add_column.sql b/drizzle/0005_add_column.sql
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/drizzle/0005_add_column.sql
@@ -0,0 +1 @@
+ALTER TABLE users ADD COLUMN email TEXT;
diff --git a/src/auth/login.ts b/src/auth/login.ts
index abc..def 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1 +1 @@
-old
+new`;

describe('extractModuleName', () => {
  it('extracts module from src/ path', () => {
    expect(extractModuleName('src/auth/login.ts')).toBe('auth');
  });

  it('extracts module from packages/ path', () => {
    expect(extractModuleName('packages/shared/types.ts')).toBe('shared');
  });

  it('extracts module from packages/ nested path', () => {
    expect(extractModuleName('packages/workflow-engine/src/utils/test.ts')).toBe('workflow-engine');
  });

  it('extracts drizzle module', () => {
    expect(extractModuleName('drizzle/0001_init.sql')).toBe('drizzle');
  });

  it('extracts mcp-servers module', () => {
    expect(extractModuleName('mcp-servers/jira/src/tools/index.ts')).toBe('mcp-jira');
  });

  it('extracts infrastructure module', () => {
    expect(extractModuleName('infrastructure/postgres/init.sql')).toBe('infra-postgres');
  });

  it('returns root for top-level files', () => {
    expect(extractModuleName('package.json')).toBe('root');
  });

  it('returns first directory for unknown paths', () => {
    expect(extractModuleName('docs/README.md')).toBe('docs');
  });
});

describe('determineImpactLevel', () => {
  it('returns high for files >= highThreshold', () => {
    expect(determineImpactLevel(10, defaultConfig)).toBe('high');
    expect(determineImpactLevel(15, defaultConfig)).toBe('high');
  });

  it('returns medium for files >= mediumThreshold and < highThreshold', () => {
    expect(determineImpactLevel(3, defaultConfig)).toBe('medium');
    expect(determineImpactLevel(9, defaultConfig)).toBe('medium');
  });

  it('returns low for files < mediumThreshold', () => {
    expect(determineImpactLevel(1, defaultConfig)).toBe('low');
    expect(determineImpactLevel(2, defaultConfig)).toBe('low');
  });
});

describe('analyzeDiff', () => {
  it('parses files from git diff format', () => {
    const result = analyzeDiff(sampleDiff, defaultConfig);
    expect(result.totalFiles).toBe(3);
  });

  it('groups files by module', () => {
    const result = analyzeDiff(sampleDiff, defaultConfig);
    const moduleNames = result.moduleImpacts.map((m) => m.module);
    expect(moduleNames).toContain('auth');
    expect(moduleNames).toContain('shared');
  });

  it('assigns correct file counts per module', () => {
    const result = analyzeDiff(sampleDiff, defaultConfig);
    const authModule = result.moduleImpacts.find((m) => m.module === 'auth');
    expect(authModule?.filesChanged).toBe(2);
    const sharedModule = result.moduleImpacts.find((m) => m.module === 'shared');
    expect(sharedModule?.filesChanged).toBe(1);
  });

  it('detects type changes', () => {
    const result = analyzeDiff(typeDiff, defaultConfig);
    expect(result.typeChanges.length).toBeGreaterThan(0);
    expect(result.typeChanges).toContain('User');
    expect(result.typeChanges).toContain('AuthConfig');
    expect(result.typeChanges).toContain('Role');
  });

  it('detects migration files', () => {
    const result = analyzeDiff(migrationDiff, defaultConfig);
    expect(result.hasMigration).toBe(true);
  });

  it('returns empty analysis for empty diff', () => {
    const result = analyzeDiff('', defaultConfig);
    expect(result.totalFiles).toBe(0);
    expect(result.moduleImpacts).toEqual([]);
    expect(result.typeChanges).toEqual([]);
    expect(result.hasMigration).toBe(false);
  });

  it('sorts modules by impact level (high first)', () => {
    const result = analyzeDiff(largeDiff, defaultConfig);
    if (result.moduleImpacts.length > 1) {
      const levels = result.moduleImpacts.map((m) => m.level);
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < levels.length; i++) {
        expect(order[levels[i]]).toBeGreaterThanOrEqual(order[levels[i - 1]]);
      }
    }
  });
});

describe('assessRisks', () => {
  it('flags type changes as warning', () => {
    const diff = {
      totalFiles: 3,
      moduleImpacts: [],
      suggestedReviewers: [],
      typeChanges: ['User', 'AuthConfig'],
      hasMigration: false,
    };
    const risks = assessRisks(diff, []);
    const typeRisk = risks.find((r) => r.description.includes('타입 변경'));
    expect(typeRisk).toBeDefined();
    expect(typeRisk?.severity).toBe('warning');
    expect(typeRisk?.description).toContain('2건');
  });

  it('flags past incidents as warning', () => {
    const history: SimilarChange[] = [
      { prNumber: 38, title: 'Auth change', mergedAt: '2025-01-01', outcome: 'incident' },
    ];
    const risks = assessRisks(null, history);
    const incidentRisk = risks.find((r) => r.description.includes('인시던트'));
    expect(incidentRisk).toBeDefined();
    expect(incidentRisk?.severity).toBe('warning');
  });

  it('flags large changes (>20 files) as warning', () => {
    const diff = {
      totalFiles: 25,
      moduleImpacts: [],
      suggestedReviewers: [],
      typeChanges: [],
      hasMigration: false,
    };
    const risks = assessRisks(diff, []);
    const largeRisk = risks.find((r) => r.description.includes('대규모 변경'));
    expect(largeRisk).toBeDefined();
    expect(largeRisk?.description).toContain('25개 파일');
  });

  it('flags migration files as warning', () => {
    const diff = {
      totalFiles: 2,
      moduleImpacts: [],
      suggestedReviewers: [],
      typeChanges: [],
      hasMigration: true,
    };
    const risks = assessRisks(diff, []);
    const migrationRisk = risks.find((r) => r.description.includes('마이그레이션'));
    expect(migrationRisk).toBeDefined();
    expect(migrationRisk?.severity).toBe('warning');
  });

  it('adds info for small changes', () => {
    const diff = {
      totalFiles: 2,
      moduleImpacts: [],
      suggestedReviewers: [],
      typeChanges: [],
      hasMigration: false,
    };
    const risks = assessRisks(diff, []);
    const smallRisk = risks.find((r) => r.description.includes('소규모 변경'));
    expect(smallRisk).toBeDefined();
    expect(smallRisk?.severity).toBe('info');
  });

  it('returns empty risks for null diff and no history', () => {
    const risks = assessRisks(null, []);
    expect(risks).toEqual([]);
  });
});

describe('generateSummary', () => {
  it('generates Korean summary for high impact modules', () => {
    const modules: ModuleImpact[] = [
      { module: 'auth', level: 'high', description: '12개 파일 변경', filesChanged: 12 },
    ];
    const summary = generateSummary(modules, [], []);
    expect(summary).toContain('auth');
    expect(summary).toContain('대규모 변경');
  });

  it('generates summary for normal changes', () => {
    const modules: ModuleImpact[] = [
      { module: 'shared', level: 'low', description: '1개 파일 변경', filesChanged: 1 },
    ];
    const summary = generateSummary(modules, [], []);
    expect(summary).toContain('shared');
    expect(summary).toContain('1개 파일');
  });

  it('includes risk count in summary', () => {
    const modules: ModuleImpact[] = [
      { module: 'auth', level: 'medium', description: '5개 파일 변경', filesChanged: 5 },
    ];
    const risks: RiskFactor[] = [
      { severity: 'warning', description: '타입 변경' },
      { severity: 'warning', description: '대규모 변경' },
    ];
    const summary = generateSummary(modules, risks, []);
    expect(summary).toContain('리스크 2건');
  });

  it('mentions incident history in summary', () => {
    const modules: ModuleImpact[] = [
      { module: 'auth', level: 'low', description: '2개 파일 변경', filesChanged: 2 },
    ];
    const history: SimilarChange[] = [
      { prNumber: 10, title: 'Old PR', mergedAt: '2025-01-01', outcome: 'incident' },
    ];
    const summary = generateSummary(modules, [], history);
    expect(summary).toContain('인시던트');
  });

  it('returns empty message for no changes', () => {
    const summary = generateSummary([], [], []);
    expect(summary).toContain('변경 사항이 없습니다');
  });
});

describe('analyzeImpact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty report when disabled', async () => {
    const { loadImpactAnalysisConfig } = await import('@rtb-ai-hub/shared');
    vi.mocked(loadImpactAnalysisConfig).mockReturnValueOnce({
      ...defaultConfig,
      enabled: false,
    });

    const input: ImpactAnalysisInput = {
      env: 'int',
      owner: 'test-org',
      repo: 'test-repo',
      prNumber: 42,
      baseBranch: 'develop',
      headBranch: 'feature/test',
    };

    const result = await analyzeImpact(input);
    expect(result.totalFiles).toBe(0);
    expect(result.moduleImpacts).toEqual([]);
    expect(result.riskFactors).toEqual([]);
    expect(result.summary).toBe('');
  });

  it('analyzes provided diffText', async () => {
    const input: ImpactAnalysisInput = {
      env: 'int',
      owner: 'test-org',
      repo: 'test-repo',
      prNumber: 42,
      baseBranch: 'develop',
      headBranch: 'feature/auth',
      diffText: sampleDiff,
    };

    const result = await analyzeImpact(input);
    expect(result.totalFiles).toBe(3);
    expect(result.moduleImpacts.length).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
  });

  it('includes similar changes in report', async () => {
    const similarChanges: SimilarChange[] = [
      { prNumber: 38, title: 'Auth refactor', mergedAt: '2025-01-15', outcome: 'incident' },
    ];

    const input: ImpactAnalysisInput = {
      env: 'int',
      owner: 'test-org',
      repo: 'test-repo',
      prNumber: 42,
      baseBranch: 'develop',
      headBranch: 'feature/auth',
      diffText: sampleDiff,
      similarChanges,
    };

    const result = await analyzeImpact(input);
    expect(result.similarChanges).toEqual(similarChanges);
    expect(result.riskFactors.some((r) => r.description.includes('인시던트'))).toBe(true);
  });

  it('handles empty diffText gracefully', async () => {
    const input: ImpactAnalysisInput = {
      env: 'int',
      owner: 'test-org',
      repo: 'test-repo',
      prNumber: 42,
      baseBranch: 'develop',
      headBranch: 'feature/empty',
      diffText: '',
    };

    const result = await analyzeImpact(input);
    expect(result.totalFiles).toBe(0);
    expect(result.moduleImpacts).toEqual([]);
  });
});

describe('formatImpactForPr', () => {
  it('generates markdown with header and file count', () => {
    const report: ImpactReport = {
      totalFiles: 5,
      moduleImpacts: [
        { module: 'auth', level: 'medium', description: '5개 파일 변경', filesChanged: 5 },
      ],
      similarChanges: [],
      riskFactors: [],
      suggestedReviewers: [],
      summary: '테스트 요약',
    };

    const md = formatImpactForPr(report);
    expect(md).toContain('Impact Analysis');
    expect(md).toContain('5개 파일');
    expect(md).toContain('auth');
    expect(md).toContain('Medium');
  });

  it('includes markdown table for module impacts', () => {
    const report: ImpactReport = {
      totalFiles: 12,
      moduleImpacts: [
        { module: 'auth', level: 'high', description: '10개 파일 변경', filesChanged: 10 },
        { module: 'shared', level: 'low', description: '2개 파일 변경', filesChanged: 2 },
      ],
      similarChanges: [],
      riskFactors: [],
      suggestedReviewers: [],
      summary: '',
    };

    const md = formatImpactForPr(report);
    expect(md).toContain('| 영역 | 영향도 | 설명 |');
    expect(md).toContain('auth');
    expect(md).toContain('High');
    expect(md).toContain('shared');
    expect(md).toContain('Low');
  });

  it('includes similar changes with incident markers', () => {
    const report: ImpactReport = {
      totalFiles: 3,
      moduleImpacts: [],
      similarChanges: [
        { prNumber: 38, title: 'Auth fix', mergedAt: '2025-01-15', outcome: 'incident' },
        { prNumber: 35, title: 'Login update', mergedAt: '2025-01-10', outcome: 'success' },
      ],
      riskFactors: [],
      suggestedReviewers: [],
      summary: '',
    };

    const md = formatImpactForPr(report);
    expect(md).toContain('과거 유사 변경');
    expect(md).toContain('PR #38');
    expect(md).toContain('⚠️');
    expect(md).toContain('인시던트 발생 이력');
    expect(md).toContain('PR #35');
    expect(md).toContain('✅');
  });

  it('includes risk factors', () => {
    const report: ImpactReport = {
      totalFiles: 3,
      moduleImpacts: [],
      similarChanges: [],
      riskFactors: [
        { severity: 'warning', description: '타입 변경 2건' },
        { severity: 'info', description: '소규모 변경' },
      ],
      suggestedReviewers: [],
      summary: '',
    };

    const md = formatImpactForPr(report);
    expect(md).toContain('리스크 요인');
    expect(md).toContain('⚠️');
    expect(md).toContain('ℹ️');
    expect(md).toContain('타입 변경 2건');
  });

  it('includes suggested reviewers', () => {
    const report: ImpactReport = {
      totalFiles: 3,
      moduleImpacts: [],
      similarChanges: [],
      riskFactors: [],
      suggestedReviewers: ['senior-dev', 'auth-expert'],
      summary: '',
    };

    const md = formatImpactForPr(report);
    expect(md).toContain('권장 리뷰어');
    expect(md).toContain('@senior-dev');
    expect(md).toContain('@auth-expert');
  });
});

describe('formatImpactForSlack', () => {
  it('generates slack message with summary', () => {
    const report: ImpactReport = {
      totalFiles: 5,
      moduleImpacts: [
        { module: 'auth', level: 'high', description: '5개 파일 변경', filesChanged: 5 },
      ],
      similarChanges: [],
      riskFactors: [{ severity: 'warning', description: '타입 변경' }],
      suggestedReviewers: [],
      summary: 'auth 모듈에 대규모 변경이 포함되어 있습니다.',
    };

    const slack = formatImpactForSlack(report);
    expect(slack).toContain('영향 분석 요약');
    expect(slack).toContain('auth 모듈에 대규모 변경');
    expect(slack).toContain('높은 영향: auth');
    expect(slack).toContain('리스크 1건 감지됨');
  });

  it('omits high impact section when none exist', () => {
    const report: ImpactReport = {
      totalFiles: 2,
      moduleImpacts: [
        { module: 'shared', level: 'low', description: '2개 파일 변경', filesChanged: 2 },
      ],
      similarChanges: [],
      riskFactors: [],
      suggestedReviewers: [],
      summary: '2개 파일이 shared 영역에서 변경되었습니다.',
    };

    const slack = formatImpactForSlack(report);
    expect(slack).not.toContain('높은 영향');
  });
});
