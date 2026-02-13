import { createLogger, loadImpactAnalysisConfig } from '@rtb-ai-hub/shared';
import type { Environment, ImpactAnalysisConfig } from '@rtb-ai-hub/shared';

const logger = createLogger('impact-analyzer');

export type ImpactLevel = 'high' | 'medium' | 'low';

export type ModuleImpact = {
  module: string;
  level: ImpactLevel;
  description: string;
  filesChanged: number;
};

export type SimilarChange = {
  prNumber: number;
  title: string;
  mergedAt: string;
  outcome?: string;
  incidentId?: string;
};

export type RiskFactor = {
  severity: 'warning' | 'info';
  description: string;
};

export type ImpactReport = {
  totalFiles: number;
  moduleImpacts: ModuleImpact[];
  similarChanges: SimilarChange[];
  riskFactors: RiskFactor[];
  suggestedReviewers: string[];
  summary: string;
};

export type ImpactAnalysisInput = {
  env: Environment;
  owner: string;
  repo: string;
  prNumber: number;
  baseBranch: string;
  headBranch: string;
  jiraKey?: string;
  diffText?: string;
  similarChanges?: SimilarChange[];
};

type DiffAnalysis = {
  totalFiles: number;
  moduleImpacts: ModuleImpact[];
  suggestedReviewers: string[];
  typeChanges: string[];
  hasMigration: boolean;
};

export function extractModuleName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');

  const packagesMatch = normalized.match(/^packages\/([^/]+)/);
  if (packagesMatch) return packagesMatch[1];

  const srcMatch = normalized.match(/^src\/([^/]+)/);
  if (srcMatch) return srcMatch[1];

  const drizzleMatch = normalized.match(/^drizzle\//);
  if (drizzleMatch) return 'drizzle';

  const mcpMatch = normalized.match(/^mcp-servers\/([^/]+)/);
  if (mcpMatch) return `mcp-${mcpMatch[1]}`;

  const infraMatch = normalized.match(/^infrastructure\/([^/]+)/);
  if (infraMatch) return `infra-${infraMatch[1]}`;

  const parts = normalized.split('/');
  if (parts.length > 1) return parts[0];

  return 'root';
}

export function determineImpactLevel(
  filesChanged: number,
  config: ImpactAnalysisConfig
): ImpactLevel {
  if (filesChanged >= config.highThreshold) return 'high';
  if (filesChanged >= config.mediumThreshold) return 'medium';
  return 'low';
}

function parseChangedFiles(diffText: string): string[] {
  const files: string[] = [];
  const diffHeaderRegex = /^diff --git a\/(.+?) b\//gm;
  let match: RegExpExecArray | null;

  while ((match = diffHeaderRegex.exec(diffText)) !== null) {
    files.push(match[1]);
  }

  if (files.length === 0) {
    const lines = diffText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('+') &&
        !trimmed.startsWith('-') &&
        !trimmed.startsWith('@')
      ) {
        if (trimmed.includes('/') || trimmed.includes('.')) {
          files.push(trimmed);
        }
      }
    }
  }

  return [...new Set(files)];
}

function detectTypeChanges(diffText: string): string[] {
  const typeChanges: string[] = [];
  const typeRegex = /^[+-]\s*export\s+(type|interface|enum)\s+(\w+)/gm;
  let match: RegExpExecArray | null;

  while ((match = typeRegex.exec(diffText)) !== null) {
    typeChanges.push(match[2]);
  }

  return [...new Set(typeChanges)];
}

function detectMigrationFiles(files: string[]): boolean {
  return files.some(
    (f) =>
      f.includes('drizzle/') ||
      f.includes('migration') ||
      f.includes('migrate') ||
      f.match(/\d{4}.*\.sql$/) !== null
  );
}

function buildModuleDescription(module: string, filesChanged: number): string {
  const fileWord = filesChanged === 1 ? '파일' : '파일';
  return `${filesChanged}개 ${fileWord} 변경`;
}

export function analyzeDiff(diffText: string, config: ImpactAnalysisConfig): DiffAnalysis {
  if (!diffText || diffText.trim().length === 0) {
    return {
      totalFiles: 0,
      moduleImpacts: [],
      suggestedReviewers: [],
      typeChanges: [],
      hasMigration: false,
    };
  }

  const files = parseChangedFiles(diffText);
  const typeChanges = detectTypeChanges(diffText);
  const hasMigration = detectMigrationFiles(files);

  const moduleFileMap = new Map<string, string[]>();
  for (const file of files) {
    const module = extractModuleName(file);
    const existing = moduleFileMap.get(module) || [];
    existing.push(file);
    moduleFileMap.set(module, existing);
  }

  const moduleImpacts: ModuleImpact[] = [];
  for (const [module, moduleFiles] of moduleFileMap) {
    const level = determineImpactLevel(moduleFiles.length, config);
    moduleImpacts.push({
      module,
      level,
      description: buildModuleDescription(module, moduleFiles.length),
      filesChanged: moduleFiles.length,
    });
  }

  moduleImpacts.sort((a, b) => {
    const order: Record<ImpactLevel, number> = { high: 0, medium: 1, low: 2 };
    return order[a.level] - order[b.level];
  });

  return {
    totalFiles: files.length,
    moduleImpacts,
    suggestedReviewers: [],
    typeChanges,
    hasMigration,
  };
}

export function assessRisks(diff: DiffAnalysis | null, history: SimilarChange[]): RiskFactor[] {
  const risks: RiskFactor[] = [];

  if (diff?.typeChanges && diff.typeChanges.length > 0) {
    risks.push({
      severity: 'warning',
      description: `타입 변경 ${diff.typeChanges.length}건 — 다른 패키지에서 참조할 수 있음`,
    });
  }

  const incidentChanges = history.filter((h) => h.outcome === 'incident');
  if (incidentChanges.length > 0) {
    risks.push({
      severity: 'warning',
      description: `동일 영역에서 과거 인시던트 ${incidentChanges.length}건 — 테스트 강화 권장`,
    });
  }

  if (diff && diff.totalFiles > 20) {
    risks.push({
      severity: 'warning',
      description: `대규모 변경 (${diff.totalFiles}개 파일) — 단계적 머지 고려`,
    });
  }

  if (diff?.hasMigration) {
    risks.push({
      severity: 'warning',
      description: 'DB 마이그레이션 파일 포함 — 배포 순서 확인 필요',
    });
  }

  if (diff && diff.totalFiles > 0 && diff.totalFiles <= 3) {
    risks.push({
      severity: 'info',
      description: `소규모 변경 (${diff.totalFiles}개 파일) — 빠른 리뷰 가능`,
    });
  }

  return risks;
}

export function generateSummary(
  moduleImpacts: ModuleImpact[],
  riskFactors: RiskFactor[],
  history: SimilarChange[]
): string {
  if (moduleImpacts.length === 0) {
    return '변경 사항이 없습니다.';
  }

  const highImpacts = moduleImpacts.filter((m) => m.level === 'high');
  const totalFiles = moduleImpacts.reduce((sum, m) => sum + m.filesChanged, 0);
  const moduleNames = moduleImpacts.map((m) => m.module);
  const warnings = riskFactors.filter((r) => r.severity === 'warning');

  const parts: string[] = [];

  if (highImpacts.length > 0) {
    parts.push(
      `${highImpacts.map((m) => m.module).join(', ')} 모듈에 대규모 변경이 포함되어 있습니다.`
    );
  } else {
    parts.push(`${totalFiles}개 파일이 ${moduleNames.join(', ')} 영역에서 변경되었습니다.`);
  }

  if (warnings.length > 0) {
    parts.push(`리스크 ${warnings.length}건이 감지되었습니다.`);
  }

  const incidents = history.filter((h) => h.outcome === 'incident');
  if (incidents.length > 0) {
    parts.push('과거 유사 변경에서 인시던트 이력이 있어 주의가 필요합니다.');
  }

  return parts.join(' ');
}

export async function analyzeImpact(input: ImpactAnalysisInput): Promise<ImpactReport> {
  const config = loadImpactAnalysisConfig();

  if (!config.enabled) {
    logger.debug('Impact analysis disabled');
    return {
      totalFiles: 0,
      moduleImpacts: [],
      similarChanges: [],
      riskFactors: [],
      suggestedReviewers: [],
      summary: '',
    };
  }

  logger.info(
    { prNumber: input.prNumber, repo: `${input.owner}/${input.repo}` },
    'Starting impact analysis'
  );

  const diffText = input.diffText || '';
  // TODO: If no diffText provided, fetch from GitHub MCP:
  // const diff = await getMcpClient('GITHUB', input.env).callTool('getPullRequestDiff', { ... });

  const diff = analyzeDiff(diffText, config);
  const history = input.similarChanges || [];
  // TODO: Fetch similar changes from git log / Context Engine (B-1)
  // const history = await findSimilarChanges(input, config);

  const riskFactors = assessRisks(diff, history);
  const summary = generateSummary(diff.moduleImpacts, riskFactors, history);

  const report: ImpactReport = {
    totalFiles: diff.totalFiles,
    moduleImpacts: diff.moduleImpacts,
    similarChanges: history,
    riskFactors,
    suggestedReviewers: diff.suggestedReviewers,
    summary,
  };

  logger.info(
    {
      totalFiles: report.totalFiles,
      modules: report.moduleImpacts.length,
      risks: report.riskFactors.length,
    },
    'Impact analysis complete'
  );

  return report;
}
