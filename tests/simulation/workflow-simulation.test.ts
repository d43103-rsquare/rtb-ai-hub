import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createIssue,
  readIssue,
  updateIssue,
  addTimeline,
  setGate,
  setArtifact,
  cleanWorkspace,
  type GateDecision,
} from './issue-store';
import { SimulatedHubClient } from './hub-client';

const hub = new SimulatedHubClient();
const WORKSPACE_DIR = path.join(__dirname, 'workspace');

async function pmAgentAnalyze(issueKey: string): Promise<void> {
  const issue = readIssue(issueKey);

  const knowledge = await hub.searchKnowledge(issue.summary, 'building');
  const refined = await hub.refineRequirement(
    issue.summary,
    knowledge.results.map((r) => r.content).join('\n')
  );

  setArtifact(issueKey, 'refined_requirement', refined.refined);

  addTimeline(issueKey, {
    agent: 'pm-agent',
    action: 'requirement_analysis',
    detail: `Knowledge API에서 ${knowledge.results.length}개 관련 문서 검색. 요구사항 정제 완료.`,
    result: `테이블: ${refined.tables.join(', ')} / API: ${refined.apis.join(', ')}`,
    statusChange: 'Open → In Analysis',
  });

  updateIssue(issueKey, { status: 'In Analysis' });
}

async function developerAgentPlan(issueKey: string): Promise<void> {
  const issue = readIssue(issueKey);
  const requirement = issue.artifacts.refined_requirement!;

  const devPlan = [
    '## 개발 계획',
    '',
    '### 1. DB 레이어',
    '- BuildingRepository: obj_bld_mst CRUD',
    '- FloorRepository: obj_bld_flr_mst 조회',
    '',
    '### 2. Service 레이어',
    '- BuildingService: 비즈니스 로직, 페이지네이션, 검색',
    '',
    '### 3. API 레이어',
    '- GET /api/buildings — 목록 조회 (page, size, search)',
    '- GET /api/buildings/:id — 상세 조회 (층/호실 포함)',
    '- POST /api/buildings — 등록',
    '- PUT /api/buildings/:id — 수정',
    '',
    '### 4. 테스트',
    '- Unit: Repository, Service',
    '- Integration: API endpoint',
    '',
    `### 참조 요구사항`,
    requirement.slice(0, 200),
  ].join('\n');

  setArtifact(issueKey, 'dev_plan', devPlan);

  addTimeline(issueKey, {
    agent: 'developer-agent',
    action: 'dev_plan_creation',
    detail: '개발 계획서 작성 완료. Team Lead 승인 대기.',
    result: 'API 4개, Repository 2개, Service 1개 구현 예정',
    statusChange: 'In Analysis → Planning',
  });

  updateIssue(issueKey, { status: 'Planning' });
}

function teamleadGateReview(
  issueKey: string,
  gate: 'G1' | 'G2' | 'G3' | 'G4',
  approve: boolean,
  checklist: Record<string, boolean>,
  reason: string
): GateDecision {
  const decision: GateDecision = {
    gatekeeper: 'teamlead-agent',
    decision: approve ? 'approved' : 'rejected',
    reason,
    checklist,
    timestamp: new Date().toISOString(),
  };

  setGate(issueKey, gate, decision);

  const gateNames: Record<string, string> = {
    G1: '개발 계획 심사',
    G2: '개발 완료 검증',
    G3: '테스트 계획 심사',
    G4: '테스트 결과 판정',
  };

  addTimeline(issueKey, {
    agent: 'teamlead-agent',
    action: `gate_${gate.toLowerCase()}_review`,
    detail: `${gateNames[gate]}: ${approve ? 'APPROVED' : 'REJECTED'}`,
    result: reason,
    statusChange: approve ? `${gate} Approved` : `${gate} Rejected → 재작성 필요`,
  });

  return decision;
}

async function developerAgentImplement(issueKey: string): Promise<void> {
  const issue = readIssue(issueKey);
  const repo = 'dev-rsquare/rtb-v2-mvp';
  const branchName = `feature/SIM-001-building-info-api`;

  const branchResult = await hub.createBranch(repo, branchName, 'develop');
  expect(branchResult.success).toBe(true);
  setArtifact(issueKey, 'branch_name', branchName);

  const codeResult = await hub.runOpenCodeTask('빌딩 정보 조회 API 개발', {
    requirement: issue.artifacts.refined_requirement,
    plan: issue.artifacts.dev_plan,
  });
  expect(codeResult.success).toBe(true);

  const commitResult = await hub.commitAndPush(
    repo,
    branchName,
    `feat(building): add building info API

- GET /api/buildings (list with pagination)
- GET /api/buildings/:id (detail with floors)
- POST /api/buildings (create)
- PUT /api/buildings/:id (update)

Refs: ${issueKey}`
  );
  expect(commitResult.success).toBe(true);

  const ciResult = await hub.runCi(repo, branchName);
  expect(ciResult.success).toBe(true);
  setArtifact(issueKey, 'ci_result', JSON.stringify(ciResult.data));

  const prResult = await hub.createPr(
    repo,
    branchName,
    `feat(building): 빌딩 정보 조회 API [${issueKey}]`,
    `## Summary\n빌딩 마스터(obj_bld_mst) CRUD API 구현\n\n## Jira\n${issueKey}`
  );
  expect(prResult.success).toBe(true);
  setArtifact(issueKey, 'pr_url', prResult.data.prUrl as string);

  addTimeline(issueKey, {
    agent: 'developer-agent',
    action: 'implementation',
    detail: `OpenCode로 코드 생성 → CI 통과 → PR #${prResult.data.prNumber} 생성`,
    result: `Branch: ${branchName}, PR: ${prResult.data.prUrl}, CI: passed`,
    statusChange: 'Planning → In Development',
  });

  updateIssue(issueKey, { status: 'In Development' });
}

async function opsAgentDeploy(issueKey: string): Promise<void> {
  const issue = readIssue(issueKey);
  const repo = 'dev-rsquare/rtb-v2-mvp';

  const deployResult = await hub.deployPreview(repo, issue.artifacts.branch_name!);
  expect(deployResult.success).toBe(true);
  setArtifact(issueKey, 'preview_url', deployResult.data.previewUrl as string);

  addTimeline(issueKey, {
    agent: 'ops-agent',
    action: 'preview_deploy',
    detail: `프리뷰 환경 배포 완료. Health check passed.`,
    result: `URL: ${deployResult.data.previewUrl}, Port: ${deployResult.data.port}`,
    statusChange: 'In Development → Preview Deployed',
  });

  updateIssue(issueKey, { status: 'Preview Deployed' });
}

async function testAgentPlan(issueKey: string): Promise<void> {
  const issue = readIssue(issueKey);

  const testPlan = [
    '## 테스트 계획',
    '',
    '### 1. API 기능 테스트',
    '- TC-001: GET /api/buildings — 빈 목록 조회',
    '- TC-002: POST /api/buildings → GET /api/buildings — 등록 후 목록 확인',
    '- TC-003: GET /api/buildings/:id — 상세 조회 (층 정보 포함)',
    '- TC-004: PUT /api/buildings/:id — 수정 후 확인',
    '',
    '### 2. 페이지네이션 테스트',
    '- TC-005: page=1&size=10 — 첫 페이지',
    '- TC-006: page=2&size=5 — 두번째 페이지',
    '- TC-007: size=200 — 최대 100으로 제한 확인',
    '',
    '### 3. 에러 케이스',
    '- TC-008: GET /api/buildings/99999 — 404 Not Found',
    '- TC-009: POST /api/buildings (빈 body) — 400 Bad Request',
    '',
    `### 테스트 환경`,
    `- Preview URL: ${issue.artifacts.preview_url}`,
  ].join('\n');

  setArtifact(issueKey, 'test_plan', testPlan);

  addTimeline(issueKey, {
    agent: 'test-agent',
    action: 'test_plan_creation',
    detail: '테스트 계획서 작성 완료 (9개 테스트 케이스). Team Lead 승인 대기.',
    result: '기능: 4개, 페이지네이션: 3개, 에러: 2개',
    statusChange: 'Preview Deployed → Test Planning',
  });

  updateIssue(issueKey, { status: 'Test Planning' });
}

async function testAgentExecute(issueKey: string): Promise<void> {
  const testResult = [
    '## 테스트 결과',
    '',
    '| TC | Description | Result |',
    '|----|-------------|--------|',
    '| TC-001 | 빈 목록 조회 | PASS |',
    '| TC-002 | 등록 후 목록 확인 | PASS |',
    '| TC-003 | 상세 조회 | PASS |',
    '| TC-004 | 수정 후 확인 | PASS |',
    '| TC-005 | 첫 페이지 | PASS |',
    '| TC-006 | 두번째 페이지 | PASS |',
    '| TC-007 | 최대 크기 제한 | PASS |',
    '| TC-008 | 404 Not Found | PASS |',
    '| TC-009 | 400 Bad Request | PASS |',
    '',
    '### Summary: 9/9 PASS (100%)',
  ].join('\n');

  setArtifact(issueKey, 'test_result', testResult);

  addTimeline(issueKey, {
    agent: 'test-agent',
    action: 'test_execution',
    detail: '9개 테스트 케이스 전체 통과.',
    result: '9/9 PASS (100%)',
    statusChange: 'Test Planning → Testing',
  });

  updateIssue(issueKey, { status: 'Testing' });
}

function pmAgentComplete(issueKey: string): void {
  addTimeline(issueKey, {
    agent: 'pm-agent',
    action: 'completion_notification',
    detail: '전체 워크플로우 완료. Slack 사용자에게 완료 알림 전송.',
    result: '빌딩 정보 조회 API 개발 완료, PR 생성됨, 테스트 100% 통과',
    statusChange: 'Testing → Done',
  });

  updateIssue(issueKey, { status: 'Done' });
}

describe('Workflow Simulation: Feature Development (Happy Path)', () => {
  const ISSUE_KEY = 'SIM-001';

  beforeAll(() => {
    cleanWorkspace();
  });

  it('Step 0: Slack에서 이슈가 접수됨', () => {
    const issue = createIssue({
      key: ISSUE_KEY,
      summary: '빌딩 정보 조회 API 개발',
      description: 'RTB 플랫폼에서 빌딩 마스터 데이터를 조회하는 REST API를 개발합니다.',
      priority: 'High',
      labels: ['RTB-AI-HUB', 'building', 'api'],
    });

    expect(issue.status).toBe('Open');
    expect(issue.timeline).toHaveLength(0);
    expect(issue.gates.G1).toBeNull();
  });

  it('Step 1-2: PM Agent가 요구사항을 분석하고 Knowledge API로 도메인 지식을 조회', async () => {
    await pmAgentAnalyze(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('In Analysis');
    expect(issue.artifacts.refined_requirement).toBeTruthy();
    expect(issue.artifacts.refined_requirement).toContain('obj_bld_mst');
    expect(issue.timeline).toHaveLength(1);
    expect(issue.timeline[0].agent).toBe('pm-agent');
  });

  it('Step 3-4: Developer Agent가 개발 계획을 작성', async () => {
    await developerAgentPlan(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('Planning');
    expect(issue.artifacts.dev_plan).toBeTruthy();
    expect(issue.artifacts.dev_plan).toContain('GET /api/buildings');
    expect(issue.timeline).toHaveLength(2);
    expect(issue.timeline[1].agent).toBe('developer-agent');
  });

  it('Step 5-6: Team Lead가 G1(개발 계획)을 승인', () => {
    const decision = teamleadGateReview(
      ISSUE_KEY,
      'G1',
      true,
      {
        requirement_coverage: true,
        api_design_quality: true,
        db_schema_alignment: true,
        test_strategy_included: true,
        security_considerations: true,
      },
      '개발 계획이 요구사항을 충분히 반영하고 있음. API 설계와 DB 스키마가 적절함.'
    );

    const issue = readIssue(ISSUE_KEY);
    expect(issue.gates.G1).not.toBeNull();
    expect(issue.gates.G1!.decision).toBe('approved');
    expect(decision.decision).toBe('approved');
    expect(issue.timeline).toHaveLength(3);
  });

  it('Step 7: Developer Agent가 OpenCode로 코드 생성 → CI → PR', async () => {
    await developerAgentImplement(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('In Development');
    expect(issue.artifacts.branch_name).toBe('feature/SIM-001-building-info-api');
    expect(issue.artifacts.ci_result).toBeTruthy();
    expect(issue.artifacts.pr_url).toContain('github.com');
    expect(issue.timeline).toHaveLength(4);
  });

  it('Step 8: Team Lead가 G2(개발 완료)를 승인', () => {
    const decision = teamleadGateReview(
      ISSUE_KEY,
      'G2',
      true,
      {
        ci_passed: true,
        pr_created: true,
        code_quality: true,
        no_security_issues: true,
      },
      'CI 전체 통과, PR 생성 확인. 코드 품질 양호.'
    );

    expect(decision.decision).toBe('approved');
    const issue = readIssue(ISSUE_KEY);
    expect(issue.gates.G2!.decision).toBe('approved');
  });

  it('Step 9-10: Ops Agent가 프리뷰 환경을 배포', async () => {
    await opsAgentDeploy(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('Preview Deployed');
    expect(issue.artifacts.preview_url).toContain('http://localhost');
  });

  it('Step 11-12: Test Agent가 테스트 계획을 작성', async () => {
    await testAgentPlan(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('Test Planning');
    expect(issue.artifacts.test_plan).toBeTruthy();
    expect(issue.artifacts.test_plan).toContain('TC-001');
  });

  it('Step 13: Team Lead가 G3(테스트 계획)을 승인', () => {
    const decision = teamleadGateReview(
      ISSUE_KEY,
      'G3',
      true,
      {
        coverage_sufficient: true,
        edge_cases_covered: true,
        error_cases_included: true,
      },
      '테스트 케이스 9개로 주요 기능 + 에러 케이스를 적절히 커버함.'
    );

    expect(decision.decision).toBe('approved');
  });

  it('Step 14: Test Agent가 테스트를 실행', async () => {
    await testAgentExecute(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('Testing');
    expect(issue.artifacts.test_result).toContain('9/9 PASS');
  });

  it('Step 15: Team Lead가 G4(테스트 결과)를 승인', () => {
    const decision = teamleadGateReview(
      ISSUE_KEY,
      'G4',
      true,
      {
        all_tests_passed: true,
        no_critical_issues: true,
        ready_for_production: true,
      },
      '테스트 100% 통과. 프로덕션 배포 준비 완료.'
    );

    expect(decision.decision).toBe('approved');
  });

  it('Step 16: PM Agent가 완료 알림을 전송', () => {
    pmAgentComplete(ISSUE_KEY);

    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('Done');
    expect(issue.timeline.length).toBeGreaterThanOrEqual(10);
  });

  it('최종 검증: 이슈 파일이 올바른 상태로 workspace에 저장됨', () => {
    const filePath = path.join(WORKSPACE_DIR, `${ISSUE_KEY}.json`);
    expect(fs.existsSync(filePath)).toBe(true);

    const issue = readIssue(ISSUE_KEY);

    expect(issue.status).toBe('Done');

    expect(issue.artifacts.refined_requirement).toBeTruthy();
    expect(issue.artifacts.dev_plan).toBeTruthy();
    expect(issue.artifacts.branch_name).toBeTruthy();
    expect(issue.artifacts.ci_result).toBeTruthy();
    expect(issue.artifacts.pr_url).toBeTruthy();
    expect(issue.artifacts.preview_url).toBeTruthy();
    expect(issue.artifacts.test_plan).toBeTruthy();
    expect(issue.artifacts.test_result).toBeTruthy();

    expect(issue.gates.G1!.decision).toBe('approved');
    expect(issue.gates.G2!.decision).toBe('approved');
    expect(issue.gates.G3!.decision).toBe('approved');
    expect(issue.gates.G4!.decision).toBe('approved');

    const agents = issue.timeline.map((t) => t.agent);
    expect(agents).toContain('pm-agent');
    expect(agents).toContain('developer-agent');
    expect(agents).toContain('teamlead-agent');
    expect(agents).toContain('ops-agent');
    expect(agents).toContain('test-agent');
  });
});

describe('Workflow Simulation: G1 Rejection → Resubmission', () => {
  const ISSUE_KEY = 'SIM-002';

  beforeAll(() => {
    cleanWorkspace();
  });

  it('Step 0: 이슈 생성', () => {
    const issue = createIssue({
      key: ISSUE_KEY,
      summary: '매물 검색 필터 API 개발',
      description: '매물 검색 시 다양한 필터 조건을 지원하는 API를 개발합니다.',
    });

    expect(issue.status).toBe('Open');
  });

  it('Step 1: PM Agent 분석', async () => {
    await pmAgentAnalyze(ISSUE_KEY);
    const issue = readIssue(ISSUE_KEY);
    expect(issue.status).toBe('In Analysis');
  });

  it('Step 2: Developer Agent가 불완전한 개발 계획을 작성', () => {
    const incompletePlan = [
      '## 개발 계획',
      '',
      '### API',
      '- GET /api/properties/search — 매물 검색',
      '',
      '### DB',
      '- prd_pdm_mst 테이블 조회',
    ].join('\n');

    setArtifact(ISSUE_KEY, 'dev_plan', incompletePlan);
    addTimeline(ISSUE_KEY, {
      agent: 'developer-agent',
      action: 'dev_plan_creation',
      detail: '개발 계획서 작성 (초안).',
      result: 'API 1개 계획',
      statusChange: 'In Analysis → Planning',
    });
    updateIssue(ISSUE_KEY, { status: 'Planning' });
  });

  it('Step 3: Team Lead가 G1을 반려 — 페이지네이션/필터 누락', () => {
    const decision = teamleadGateReview(
      ISSUE_KEY,
      'G1',
      false,
      {
        requirement_coverage: false,
        api_design_quality: false,
        db_schema_alignment: true,
        test_strategy_included: false,
        security_considerations: true,
      },
      [
        'REJECTED: 다음 사항을 보완해주세요:',
        '1. 페이지네이션 설계가 없음 (offset vs cursor 중 선택 필요)',
        '2. 필터 파라미터 정의가 없음 (가격, 면적, 위치 등)',
        '3. 테스트 전략이 포함되지 않음',
        '4. 요구사항 대비 API 수가 부족 (검색 외 상세조회 필요)',
      ].join('\n')
    );

    expect(decision.decision).toBe('rejected');

    const issue = readIssue(ISSUE_KEY);
    expect(issue.gates.G1!.decision).toBe('rejected');
    expect(issue.gates.G1!.checklist.requirement_coverage).toBe(false);
  });

  it('Step 4: Developer Agent가 계획을 보완하여 재작성', () => {
    const revisedPlan = [
      '## 개발 계획 (Revised)',
      '',
      '### 1. API 설계',
      '- GET /api/properties/search — 매물 검색 (필터 + 페이지네이션)',
      '  - Filters: price_min, price_max, area_min, area_max, location, type',
      '  - Pagination: cursor-based (lastId, size)',
      '- GET /api/properties/:id — 매물 상세 조회',
      '',
      '### 2. DB 레이어',
      '- PropertyRepository: prd_pdm_mst 검색 쿼리 (동적 WHERE 생성)',
      '- 인덱스: (price, area, location) 복합 인덱스 활용',
      '',
      '### 3. 테스트 전략',
      '- Unit: Repository 필터 조합 테스트',
      '- Integration: 검색 API 파라미터 조합 테스트',
      '- Performance: 1만건 데이터 기준 응답시간 200ms 이내 확인',
    ].join('\n');

    setArtifact(ISSUE_KEY, 'dev_plan', revisedPlan);

    addTimeline(ISSUE_KEY, {
      agent: 'developer-agent',
      action: 'dev_plan_revision',
      detail:
        'Team Lead 피드백 반영하여 계획 보완. 페이지네이션(cursor), 필터 파라미터, 테스트 전략 추가.',
      result: 'API 2개, cursor-based pagination, 필터 6종, 테스트 전략 포함',
      statusChange: 'Planning → Planning (Revised)',
    });
  });

  it('Step 5: Team Lead가 보완된 계획을 G1 승인', () => {
    const decision = teamleadGateReview(
      ISSUE_KEY,
      'G1',
      true,
      {
        requirement_coverage: true,
        api_design_quality: true,
        db_schema_alignment: true,
        test_strategy_included: true,
        security_considerations: true,
      },
      '보완된 계획이 모든 요구사항을 충족함. Cursor 기반 페이지네이션 선택이 적절함.'
    );

    expect(decision.decision).toBe('approved');
  });

  it('최종 검증: 반려 이력과 재승인이 모두 기록됨', () => {
    const issue = readIssue(ISSUE_KEY);

    expect(issue.gates.G1!.decision).toBe('approved');

    const g1Reviews = issue.timeline.filter((t) => t.action.includes('gate_g1'));
    expect(g1Reviews).toHaveLength(2);
    expect(g1Reviews[0].detail).toContain('REJECTED');
    expect(g1Reviews[1].detail).toContain('APPROVED');

    const revisions = issue.timeline.filter((t) => t.action === 'dev_plan_revision');
    expect(revisions).toHaveLength(1);

    const filePath = path.join(WORKSPACE_DIR, `${ISSUE_KEY}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe('Workflow Simulation: Bug Fix (Happy Path)', () => {
  const ISSUE_KEY = 'SIM-BUG-001';

  beforeAll(() => {
    cleanWorkspace();
  });

  it('Step 0: Bug 이슈가 접수됨', () => {
    const issue = createIssue({
      key: ISSUE_KEY,
      summary: 'API returns 500 on empty payload',
      description: `## Bug Report
### Steps to reproduce
1. Send POST /api/data with empty body
2. Observe 500 Internal Server Error

### Expected
400 Bad Request with validation error

### Actual
500 with stack trace:
\`\`\`
TypeError: Cannot destructure property 'name' of undefined
  at processData (src/handlers/data.ts:42)
\`\`\`

### Environment
- Server: int
- Endpoint: POST /api/data`,
      priority: 'Critical',
      labels: ['bug', 'api'],
    });

    expect(issue.status).toBe('Open');
  });

  it('Step 1: 티켓 분류 — Bug으로 판별', () => {
    // Simulate classification
    addTimeline(ISSUE_KEY, {
      agent: 'classifier',
      action: 'ticket_classification',
      detail: 'issueType=Bug, labels=[bug, api] → TicketCategory.BUG',
      result: 'Routed to bug-fix workflow',
      statusChange: 'Open → In Analysis',
    });
    updateIssue(ISSUE_KEY, { status: 'In Analysis' });

    const updated = readIssue(ISSUE_KEY);
    expect(updated.status).toBe('In Analysis');
  });

  it('Step 2: 컨텍스트 수집 — 에러 로그, 스택 트레이스 추출', () => {
    const issue = readIssue(ISSUE_KEY);

    // Extract stack trace from description
    const description = issue.description || '';
    const codeBlockMatch = description.match(/```[\s\S]*?```/);
    expect(codeBlockMatch).toBeTruthy();

    setArtifact(
      ISSUE_KEY,
      'stack_trace',
      "TypeError: Cannot destructure property 'name' of undefined at processData (src/handlers/data.ts:42)"
    );
    setArtifact(
      ISSUE_KEY,
      'related_files',
      'src/handlers/data.ts, src/handlers/__tests__/data.test.ts'
    );

    addTimeline(ISSUE_KEY, {
      agent: 'bug-fix-workflow',
      action: 'context_collection',
      detail: '스택 트레이스 추출, 관련 파일 식별 (src/handlers/data.ts:42)',
      result: 'Root cause location: processData function, line 42',
      statusChange: 'In Analysis',
    });
  });

  it('Step 3: CLAUDE.md 생성 — Bug Fix Guide', () => {
    const issue = readIssue(ISSUE_KEY);

    // Simulate CLAUDE.md generation
    const claudeMd = [
      `# ${ISSUE_KEY} — Bug Fix Guide`,
      `**Summary**: ${issue.summary}`,
      '## Bug Report',
      issue.description,
      '## Stack Trace',
      '```',
      issue.artifacts.stack_trace,
      '```',
      '## Bug Fix Process',
      '1. Root Cause Analysis',
      '2. Fix Implementation',
      '3. Regression Test',
      '4. Verification',
    ].join('\n');

    setArtifact(ISSUE_KEY, 'claude_md', claudeMd);

    addTimeline(ISSUE_KEY, {
      agent: 'bug-fix-workflow',
      action: 'claude_md_generation',
      detail:
        'Bug Fix Guide CLAUDE.md 생성 완료 (Root Cause Analysis + Regression Test 지침 포함)',
      result: 'CLAUDE.md written to worktree',
      statusChange: 'In Analysis',
    });
  });

  it('Step 4: Claude Code 실행 — 원인 분석 + 수정 + 테스트', () => {
    setArtifact(
      ISSUE_KEY,
      'root_cause',
      'processData() assumes req.body is always defined. When empty payload is sent, destructuring fails.'
    );
    setArtifact(
      ISSUE_KEY,
      'fix_description',
      'Added null check for req.body with 400 response for empty payloads'
    );
    setArtifact(ISSUE_KEY, 'test_added', 'test: POST /api/data with empty body returns 400');

    addTimeline(ISSUE_KEY, {
      agent: 'claude-code',
      action: 'bug_fix_implementation',
      detail: 'Claude Code가 원인 분석 → 수정 코드 생성 → 회귀 테스트 추가 완료',
      result: 'Files changed: src/handlers/data.ts, src/handlers/__tests__/data.test.ts',
      statusChange: 'In Analysis → In Development',
    });

    updateIssue(ISSUE_KEY, { status: 'In Development' });
  });

  it('Step 5: Quality Gates 통과', () => {
    const gateResults = {
      lint: { passed: true, durationMs: 3200 },
      typecheck: { passed: true, durationMs: 8500 },
      test: { passed: true, durationMs: 12000 },
      build: { passed: true, durationMs: 15000 },
    };

    setArtifact(ISSUE_KEY, 'gate_results', JSON.stringify(gateResults));

    addTimeline(ISSUE_KEY, {
      agent: 'bug-fix-workflow',
      action: 'quality_gates',
      detail: '4개 게이트 전체 통과: lint ✅, typecheck ✅, test ✅, build ✅',
      result: `Total: ${Object.values(gateResults).reduce((sum, g) => sum + g.durationMs, 0)}ms`,
      statusChange: 'In Development',
    });
  });

  it('Step 6: PR 생성', async () => {
    const branchName = `bugfix/${ISSUE_KEY}-fix-empty-payload-500`;
    setArtifact(ISSUE_KEY, 'branch_name', branchName);

    const prResult = await hub.createPr(
      'dev-rsquare/rtb-v2-mvp',
      branchName,
      `fix(${ISSUE_KEY}): ${readIssue(ISSUE_KEY).summary}`,
      [
        `## Bug Fix: ${ISSUE_KEY}`,
        '',
        `**Summary**: ${readIssue(ISSUE_KEY).summary}`,
        '',
        '### Root Cause Analysis',
        readIssue(ISSUE_KEY).artifacts.root_cause || '',
        '',
        '### Fix',
        readIssue(ISSUE_KEY).artifacts.fix_description || '',
        '',
        '### Quality Gates',
        '- ✅ lint (3.2s)',
        '- ✅ typecheck (8.5s)',
        '- ✅ test (12s)',
        '- ✅ build (15s)',
        '',
        '---',
        '🤖 Auto-generated by RTB AI Hub — Bug Fix Workflow',
      ].join('\n')
    );

    expect(prResult.success).toBe(true);
    setArtifact(ISSUE_KEY, 'pr_url', prResult.data.prUrl as string);

    addTimeline(ISSUE_KEY, {
      agent: 'bug-fix-workflow',
      action: 'pr_creation',
      detail: `PR #${prResult.data.prNumber} 생성 완료`,
      result: `PR: ${prResult.data.prUrl}, Branch: ${branchName}`,
      statusChange: 'In Development → PR Created',
    });

    updateIssue(ISSUE_KEY, { status: 'PR Created' });
  });

  it('Step 7: 워크플로우 완료', () => {
    addTimeline(ISSUE_KEY, {
      agent: 'bug-fix-workflow',
      action: 'workflow_complete',
      detail: 'Bug fix 워크플로우 완료. 원인 분석 → 수정 → 테스트 → PR 생성 자동화 성공.',
      result: 'Status: COMPLETED',
      statusChange: 'PR Created → Done',
    });

    updateIssue(ISSUE_KEY, { status: 'Done' });
  });

  it('최종 검증: Bug fix 워크플로우 전체 아티팩트 확인', () => {
    const issue = readIssue(ISSUE_KEY);

    expect(issue.status).toBe('Done');
    expect(issue.artifacts.stack_trace).toBeTruthy();
    expect(issue.artifacts.root_cause).toBeTruthy();
    expect(issue.artifacts.fix_description).toBeTruthy();
    expect(issue.artifacts.test_added).toBeTruthy();
    expect(issue.artifacts.gate_results).toBeTruthy();
    expect(issue.artifacts.pr_url).toContain('github.com');
    expect(issue.artifacts.branch_name).toContain('bugfix/');

    // Verify timeline has all expected agents
    const agents = issue.timeline.map((t) => t.agent);
    expect(agents).toContain('classifier');
    expect(agents).toContain('bug-fix-workflow');
    expect(agents).toContain('claude-code');

    // Verify no design debate in bug fix flow
    const debateSteps = issue.timeline.filter((t) => t.action.includes('debate'));
    expect(debateSteps).toHaveLength(0);
  });
});

describe('IssueStore: CRUD operations', () => {
  const ISSUE_KEY = 'SIM-CRUD-001';

  afterAll(() => {
    const filePath = path.join(WORKSPACE_DIR, `${ISSUE_KEY}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it('create + read', () => {
    const created = createIssue({
      key: ISSUE_KEY,
      summary: 'CRUD Test',
      description: 'Testing IssueStore CRUD',
    });

    expect(created.key).toBe(ISSUE_KEY);
    expect(created.status).toBe('Open');

    const read = readIssue(ISSUE_KEY);
    expect(read.key).toBe(ISSUE_KEY);
    expect(read.summary).toBe('CRUD Test');
  });

  it('update', () => {
    const updated = updateIssue(ISSUE_KEY, { status: 'In Progress', priority: 'Critical' });
    expect(updated.status).toBe('In Progress');
    expect(updated.priority).toBe('Critical');
  });

  it('addTimeline', () => {
    addTimeline(ISSUE_KEY, {
      agent: 'test',
      action: 'test_action',
      detail: 'detail',
      result: 'result',
      statusChange: 'none',
    });

    const issue = readIssue(ISSUE_KEY);
    expect(issue.timeline).toHaveLength(1);
    expect(issue.timeline[0].step).toBe(1);
    expect(issue.timeline[0].agent).toBe('test');
  });

  it('setGate', () => {
    setGate(ISSUE_KEY, 'G1', {
      gatekeeper: 'teamlead-agent',
      decision: 'approved',
      reason: 'Test approval',
      checklist: { item1: true },
      timestamp: new Date().toISOString(),
    });

    const issue = readIssue(ISSUE_KEY);
    expect(issue.gates.G1).not.toBeNull();
    expect(issue.gates.G1!.decision).toBe('approved');
  });

  it('setArtifact', () => {
    setArtifact(ISSUE_KEY, 'branch_name', 'feature/test-branch');

    const issue = readIssue(ISSUE_KEY);
    expect(issue.artifacts.branch_name).toBe('feature/test-branch');
  });

  it('readIssue throws for non-existent key', () => {
    expect(() => readIssue('NON-EXISTENT')).toThrow('Issue not found');
  });
});
