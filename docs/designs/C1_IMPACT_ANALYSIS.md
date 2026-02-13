# C-1: Impact Analysis (영향 분석)

> **상태**: ✅ 구현 완료 (2026-02-11) — 40개 테스트
> **우선순위**: Phase C (Decision Facilitation)
> **난이도**: 중상 — GitHub diff 분석 + 의존성 추적 + AI 요약
> **의존성**: B-1 (Context Engine) 활용, A-1 (Role-aware Notifications) 활용
> **예상 작업량**: 3~5일

---

## 1. 목표

PR이 올라올 때 **변경 범위, 영향받는 모듈/팀, 과거 유사 변경 이력, 리스크 요인**을
자동 분석하여 PR description에 첨부하고 관련자에게 알린다.

리뷰어가 "이 변경이 어디에 영향을 주는지" 직접 추적할 필요 없이,
AI가 영향 분석 보고서를 자동으로 생성한다.

## 2. 출력 예시

### PR description에 첨부되는 영향 분석 섹션

```markdown
### 🔍 Impact Analysis

**변경 범위**: 12개 파일 (auth 모듈 8개, shared 4개)

**영향받는 영역**:
| 영역 | 영향도 | 설명 |
|------|--------|------|
| auth 모듈 | 🔴 High | 로그인 플로우 전체 변경 |
| shared/types | 🟡 Medium | User 타입 확장 — 결제 모듈에서 참조중 |
| dashboard | 🟢 Low | 로그인 페이지 라우트 추가만 |

**과거 유사 변경**:

- 2주 전 PR #38 (PROJ-098 회원가입) — auth 모듈 변경 후 세션 만료 이슈 발생
  → 세션 관련 테스트 강화 권장

**리스크 요인**:

- ⚠️ shared/types.ts의 User 타입 변경 → 다른 패키지에서 import하는 곳 3개
- ⚠️ DB 마이그레이션 필요 (users 테이블 컬럼 추가)
- ℹ️ 테스트 커버리지: 신규 파일 85%, 수정 파일 92%

**권장 리뷰어**: @senior-dev (auth 모듈 최다 기여자)
```

### Slack 알림 (관련 팀에게)

```
🔍 PROJ-123 PR #42 영향 분석

auth 모듈 대규모 변경이 포함되어 있습니다.
shared/types.ts의 User 타입이 변경되어 결제 모듈에 영향이 있을 수 있습니다.

→ 결제팀 @payment-team 사전 확인을 권장합니다.
→ 2주 전 유사 변경에서 세션 이슈 이력이 있어 주의가 필요합니다.
```

## 3. 분석 항목

| 분석               | 데이터 소스              | 방법                                   |
| ------------------ | ------------------------ | -------------------------------------- |
| **변경 범위**      | GitHub PR diff           | 파일 목록 + 디렉토리별 분류            |
| **모듈 영향**      | PR diff + 프로젝트 구조  | 변경 파일의 디렉토리 → 모듈 매핑       |
| **타입 영향**      | PR diff + import 추적    | 타입/인터페이스 변경 시 참조 파일 탐색 |
| **과거 유사 변경** | Git log + Context Engine | 같은 디렉토리/파일 변경한 최근 PR 조회 |
| **과거 인시던트**  | Context Engine (B-1)     | 동일 모듈 관련 Datadog 인시던트 이력   |
| **리스크 평가**    | 위 데이터 종합           | AI가 리스크 수준 판단 + 권장사항 생성  |
| **권장 리뷰어**    | Git blame/log            | 변경 파일의 최다 기여자 추출           |

## 4. 상세 설계

### 4.1 Impact Analyzer 모듈

**위치**: `packages/workflow-engine/src/utils/impact-analyzer.ts` (신규)

```typescript
import { createLogger } from '@rtb-ai-hub/shared';
import type { Environment } from '@rtb-ai-hub/shared';

const logger = createLogger('impact-analyzer');

// ─── 타입 ────────────────────────────────────────────────────────────

export type ImpactLevel = 'high' | 'medium' | 'low';

export type ModuleImpact = {
  module: string; // e.g. 'auth', 'shared/types', 'dashboard'
  level: ImpactLevel;
  description: string;
  filesChanged: number;
};

export type SimilarChange = {
  prNumber: number;
  title: string;
  mergedAt: string;
  outcome?: string; // 'success' | 'incident' | 'rollback'
  incidentId?: string; // Datadog incident ID if any
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
  summary: string; // AI-generated 1-2 sentence summary
};

export type ImpactAnalysisInput = {
  env: Environment;
  owner: string;
  repo: string;
  prNumber: number;
  baseBranch: string;
  headBranch: string;
  jiraKey?: string;
};

// ─── 메인 함수 ───────────────────────────────────────────────────────

export async function analyzeImpact(input: ImpactAnalysisInput): Promise<ImpactReport> {
  const [diffResult, historyResult, contextResult] = await Promise.allSettled([
    analyzeDiff(input),
    findSimilarChanges(input),
    findRelatedContext(input),
  ]);

  const diff = diffResult.status === 'fulfilled' ? diffResult.value : null;
  const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
  const context = contextResult.status === 'fulfilled' ? contextResult.value : null;

  const moduleImpacts = diff?.moduleImpacts ?? [];
  const riskFactors = assessRisks(diff, history, context);
  const suggestedReviewers = diff?.suggestedReviewers ?? [];

  return {
    totalFiles: diff?.totalFiles ?? 0,
    moduleImpacts,
    similarChanges: history,
    riskFactors,
    suggestedReviewers,
    summary: generateSummary(moduleImpacts, riskFactors, history),
  };
}
```

### 4.2 Diff Analyzer (Private)

```typescript
type DiffAnalysis = {
  totalFiles: number;
  moduleImpacts: ModuleImpact[];
  suggestedReviewers: string[];
  typeChanges: string[]; // 변경된 타입/인터페이스 목록
};

async function analyzeDiff(input: ImpactAnalysisInput): Promise<DiffAnalysis> {
  // 1. GitHub MCP로 PR diff 가져오기
  //    getPullRequestDiff(env, owner, repo, prNumber)

  // 2. 변경 파일을 디렉토리별로 그룹핑
  //    src/auth/* → 'auth' 모듈
  //    packages/shared/* → 'shared' 모듈

  // 3. 모듈별 영향도 판정
  //    - 10+ 파일 변경 = high
  //    - 3~9 파일 = medium
  //    - 1~2 파일 = low

  // 4. 타입/인터페이스 변경 감지
  //    diff에서 'export type', 'export interface', 'export enum' 변경 추출

  // 5. 타입 변경 시 import 추적 (선택적)
  //    변경된 타입을 import하는 다른 파일 목록 → 영향 범위 확장

  // 6. Git blame으로 최다 기여자 추출
  //    변경 파일들의 blame → 가장 많이 기여한 사람 = 추천 리뷰어

  return { totalFiles: 0, moduleImpacts: [], suggestedReviewers: [], typeChanges: [] };
}
```

### 4.3 History Analyzer (Private)

```typescript
async function findSimilarChanges(input: ImpactAnalysisInput): Promise<SimilarChange[]> {
  // 1. 현재 PR에서 변경된 디렉토리 목록 추출
  // 2. Git log에서 같은 디렉토리를 변경한 최근 10개 PR 조회
  // 3. Context Engine (B-1)으로 해당 PR들의 인시던트 이력 확인
  // 4. 인시던트가 있었던 PR은 outcome='incident'로 표시

  return [];
}

async function findRelatedContext(
  input: ImpactAnalysisInput
): Promise<{ incidents: string[]; deploys: string[] } | null> {
  if (!input.jiraKey) return null;

  // Context Engine (B-1)에서 관련 인시던트/배포 이력 조회
  // getContext(input.jiraKey) → incidents, deploys

  return null;
}
```

### 4.4 Risk Assessment

```typescript
function assessRisks(
  diff: DiffAnalysis | null,
  history: SimilarChange[],
  context: { incidents: string[]; deploys: string[] } | null
): RiskFactor[] {
  const risks: RiskFactor[] = [];

  // 1. shared 타입 변경 → 다른 패키지 영향
  if (diff?.typeChanges.length) {
    risks.push({
      severity: 'warning',
      description: `타입 변경 ${diff.typeChanges.length}건 — 다른 패키지에서 참조할 수 있음`,
    });
  }

  // 2. 과거 인시던트 이력
  const incidentChanges = history.filter((h) => h.outcome === 'incident');
  if (incidentChanges.length > 0) {
    risks.push({
      severity: 'warning',
      description: `동일 영역에서 과거 인시던트 ${incidentChanges.length}건 — 테스트 강화 권장`,
    });
  }

  // 3. 대규모 변경
  if (diff && diff.totalFiles > 20) {
    risks.push({
      severity: 'warning',
      description: `대규모 변경 (${diff.totalFiles}개 파일) — 단계적 머지 고려`,
    });
  }

  // 4. DB 마이그레이션 감지
  // diff에 drizzle/ 또는 migration 파일이 포함되면 리스크 추가

  return risks;
}
```

### 4.5 Report Formatter

**위치**: `packages/workflow-engine/src/utils/impact-formatter.ts` (신규)

```typescript
import type { ImpactReport, ImpactLevel } from './impact-analyzer';

const LEVEL_ICONS: Record<ImpactLevel, string> = {
  high: '🔴 High',
  medium: '🟡 Medium',
  low: '🟢 Low',
};

export function formatImpactForPr(report: ImpactReport): string {
  const sections: string[] = [];

  sections.push('### 🔍 Impact Analysis\n');
  sections.push(`**변경 범위**: ${report.totalFiles}개 파일\n`);

  // 모듈 영향 테이블
  if (report.moduleImpacts.length > 0) {
    sections.push('**영향받는 영역**:');
    sections.push('| 영역 | 영향도 | 설명 |');
    sections.push('|------|--------|------|');
    for (const m of report.moduleImpacts) {
      sections.push(`| ${m.module} | ${LEVEL_ICONS[m.level]} | ${m.description} |`);
    }
    sections.push('');
  }

  // 과거 유사 변경
  if (report.similarChanges.length > 0) {
    sections.push('**과거 유사 변경**:');
    for (const c of report.similarChanges) {
      const icon = c.outcome === 'incident' ? '⚠️' : '✅';
      sections.push(`- ${icon} PR #${c.prNumber} (${c.title}) — ${c.mergedAt}`);
      if (c.outcome === 'incident') {
        sections.push(`  → 이 영역에서 인시던트 발생 이력 있음. 주의 필요.`);
      }
    }
    sections.push('');
  }

  // 리스크 요인
  if (report.riskFactors.length > 0) {
    sections.push('**리스크 요인**:');
    for (const r of report.riskFactors) {
      const icon = r.severity === 'warning' ? '⚠️' : 'ℹ️';
      sections.push(`- ${icon} ${r.description}`);
    }
    sections.push('');
  }

  // 권장 리뷰어
  if (report.suggestedReviewers.length > 0) {
    sections.push(`**권장 리뷰어**: ${report.suggestedReviewers.map((r) => `@${r}`).join(', ')}`);
  }

  return sections.join('\n');
}

export function formatImpactForSlack(report: ImpactReport): string {
  const lines: string[] = [];
  lines.push(`🔍 영향 분석 요약\n`);
  lines.push(report.summary);

  const highImpacts = report.moduleImpacts.filter((m) => m.level === 'high');
  if (highImpacts.length > 0) {
    lines.push(`\n⚠️ 높은 영향: ${highImpacts.map((m) => m.module).join(', ')}`);
  }

  if (report.riskFactors.length > 0) {
    lines.push(`\n리스크 ${report.riskFactors.length}건 감지됨`);
  }

  return lines.join('\n');
}
```

### 4.6 통합 지점

**`jira-auto-dev-multi.ts`** — PR 생성 시 impact analysis 결과를 PR body에 추가:

```typescript
import { analyzeImpact } from '../utils/impact-analyzer';
import { formatImpactForPr } from '../utils/impact-formatter';

// PR 생성 후, 영향 분석 실행
const impactReport = await analyzeImpact({
  env,
  owner,
  repo,
  prNumber,
  baseBranch,
  headBranch,
  jiraKey: event.issueKey,
});

// PR description에 영향 분석 섹션 추가
const impactSection = formatImpactForPr(impactReport);
// GitHub API로 PR body 업데이트
```

**`auto-review` 워크플로우** — PR 리뷰 시에도 영향 분석 참고:

```typescript
// 리뷰어에게 영향 분석 결과를 함께 제공
// AI 리뷰 프롬프트에 impact report 주입
```

### 4.7 Feature Flag

```typescript
// shared/constants.ts
FEATURE_FLAGS: {
  IMPACT_ANALYSIS_ENABLED: process.env.IMPACT_ANALYSIS_ENABLED === 'true',
}
```

### 4.8 환경변수

```bash
# .env.advanced
IMPACT_ANALYSIS_ENABLED=true
IMPACT_SIMILAR_CHANGE_LIMIT=10    # 조회할 과거 유사 변경 수
IMPACT_HIGH_THRESHOLD=10          # high 영향도 파일 수 기준
IMPACT_MEDIUM_THRESHOLD=3         # medium 영향도 파일 수 기준
```

## 5. 구현 순서

1. `packages/shared/src/constants.ts` — Feature flag + config
2. `packages/workflow-engine/src/utils/impact-analyzer.ts` — 분석 로직
3. `packages/workflow-engine/src/utils/impact-formatter.ts` — PR/Slack 포맷
4. `packages/workflow-engine/src/workflows/jira-auto-dev-multi.ts` — PR body에 영향 분석 추가
5. 테스트

## 6. 테스트 계획

| 테스트       | 검증 내용                                  |
| ------------ | ------------------------------------------ |
| 모듈 분류    | 파일 경로 → 모듈 이름 올바르게 매핑        |
| 영향도 판정  | 파일 수 기준 high/medium/low 올바르게 판정 |
| 리스크 평가  | 타입 변경, 대규모 변경, 과거 인시던트 감지 |
| 포맷 PR      | 영향 분석 마크다운 올바르게 생성           |
| 포맷 Slack   | Slack 메시지 올바르게 생성                 |
| 부분 데이터  | diff만 있고 history 없을 때 graceful 처리  |
| 비활성       | IMPACT_ANALYSIS_ENABLED=false일 때 스킵    |
| summary 생성 | 영향도, 리스크 기반 1-2문장 요약           |

## 7. B-1 Context Engine 연동

```typescript
// Context Engine에서 관련 이력 조회
import { getContext, getContextByPr } from './context-engine';

// PR에 연결된 Jira key → 과거 인시던트, 배포 이력 조회
const context = await getContext(jiraKey);
// context.datadogIncidents → 인시던트 이력
// context.deployHistory → 배포 이력
```

## 8. A-2 PR Context Enrichment 연동

기존 `buildEnrichedPrDescription()`에 impact analysis 섹션 추가:

```typescript
// pr-description-builder.ts 확장
type PrDescriptionInput = {
  // ... 기존 필드
  impactReport?: ImpactReport; // C-1 추가
};

// buildEnrichedPrDescription() 안에서
if (input.impactReport) {
  sections.push(formatImpactForPr(input.impactReport));
}
```
