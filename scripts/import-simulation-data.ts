import { getDb } from '../packages/shared/src/db';
import { workflowExecutions } from '../packages/shared/src/db/schema';
import type { SimulatedWorkflow } from '../packages/dashboard/src/types/workflow';

const mockWorkflows: SimulatedWorkflow[] = [
  {
    key: 'SIM-001',
    summary: '빌딩 정보 조회 API 개발',
    description: 'RTB 플랫폼에서 빌딩 마스터 데이터를 조회하는 REST API를 개발합니다.',
    status: 'Done',
    priority: 'High',
    labels: ['RTB-AI-HUB', 'building', 'api'],
    created: '2026-02-12T02:54:22.793Z',
    updated: '2026-02-12T02:54:22.807Z',
    assignee: 'pm-agent',
    progress: 100,
    timeline: [
      {
        step: 1,
        agent: 'pm-agent',
        action: 'requirement_analysis',
        detail: 'Knowledge API에서 2개 관련 문서 검색. 요구사항 정제 완료.',
        result:
          '테이블: obj_bld_mst, obj_bld_flr_mst, obj_bld_unit_mst / API: GET /api/buildings, GET /api/buildings/:id, POST /api/buildings, PUT /api/buildings/:id',
        statusChange: 'Open → In Analysis',
        timestamp: '2026-02-12T02:54:22.796Z',
      },
      {
        step: 2,
        agent: 'developer-agent',
        action: 'dev_plan_creation',
        detail: '개발 계획서 작성 완료. Team Lead 승인 대기.',
        result: 'API 4개, Repository 2개, Service 1개 구현 예정',
        statusChange: 'In Analysis → Planning',
        timestamp: '2026-02-12T02:54:22.797Z',
      },
      {
        step: 3,
        agent: 'teamlead-agent',
        action: 'gate_g1_review',
        detail: '개발 계획 심사: APPROVED',
        result: '개발 계획이 요구사항을 충분히 반영하고 있음. API 설계와 DB 스키마가 적절함.',
        statusChange: 'G1 Approved',
        timestamp: '2026-02-12T02:54:22.798Z',
      },
      {
        step: 4,
        agent: 'developer-agent',
        action: 'implementation',
        detail: 'OpenCode로 코드 생성 → CI 통과 → PR #42 생성',
        result:
          'Branch: feature/SIM-001-building-info-api, PR: https://github.com/dev-rsquare/rtb-v2-mvp/pull/42, CI: passed',
        statusChange: 'Planning → In Development',
        timestamp: '2026-02-12T02:54:22.800Z',
      },
      {
        step: 5,
        agent: 'teamlead-agent',
        action: 'gate_g2_review',
        detail: '개발 완료 검증: APPROVED',
        result: 'CI 전체 통과, PR 생성 확인. 코드 품질 양호.',
        statusChange: 'G2 Approved',
        timestamp: '2026-02-12T02:54:22.801Z',
      },
      {
        step: 6,
        agent: 'ops-agent',
        action: 'preview_deploy',
        detail: '프리뷰 환경 배포 완료. Health check passed.',
        result: 'URL: http://localhost:3179, Port: 3179',
        statusChange: 'In Development → Preview Deployed',
        timestamp: '2026-02-12T02:54:22.801Z',
      },
      {
        step: 7,
        agent: 'test-agent',
        action: 'test_plan_creation',
        detail: '테스트 계획서 작성 완료 (9개 테스트 케이스). Team Lead 승인 대기.',
        result: '기능: 4개, 페이지네이션: 3개, 에러: 2개',
        statusChange: 'Preview Deployed → Test Planning',
        timestamp: '2026-02-12T02:54:22.803Z',
      },
      {
        step: 8,
        agent: 'teamlead-agent',
        action: 'gate_g3_review',
        detail: '테스트 계획 심사: APPROVED',
        result: '테스트 케이스 9개로 주요 기능 + 에러 케이스를 적절히 커버함.',
        statusChange: 'G3 Approved',
        timestamp: '2026-02-12T02:54:22.804Z',
      },
      {
        step: 9,
        agent: 'test-agent',
        action: 'test_execution',
        detail: '9개 테스트 케이스 전체 통과.',
        result: '9/9 PASS (100%)',
        statusChange: 'Test Planning → Testing',
        timestamp: '2026-02-12T02:54:22.805Z',
      },
      {
        step: 10,
        agent: 'teamlead-agent',
        action: 'gate_g4_review',
        detail: '테스트 결과 판정: APPROVED',
        result: '테스트 100% 통과. 프로덕션 배포 준비 완료.',
        statusChange: 'G4 Approved',
        timestamp: '2026-02-12T02:54:22.806Z',
      },
      {
        step: 11,
        agent: 'pm-agent',
        action: 'completion_notification',
        detail: '전체 워크플로우 완료. Slack 사용자에게 완료 알림 전송.',
        result: '빌딩 정보 조회 API 개발 완료, PR 생성됨, 테스트 100% 통과',
        statusChange: 'Testing → Done',
        timestamp: '2026-02-12T02:54:22.807Z',
      },
    ],
    artifacts: {
      refined_requirement:
        '## 정제된 요구사항: 빌딩 정보 조회 API 개발\n\n### 기능 요구사항\n1. 빌딩 목록 조회 API (페이지네이션, 검색, 정렬)\n2. 빌딩 상세 조회 API (층/호실 정보 포함)\n3. 빌딩 등록/수정 API',
      dev_plan:
        '## 개발 계획\n\n### 1. DB 레이어\n- BuildingRepository: obj_bld_mst CRUD\n- FloorRepository: obj_bld_flr_mst 조회',
      branch_name: 'feature/SIM-001-building-info-api',
      ci_result:
        '{"overall":"passed","steps":[{"name":"lint","status":"passed"},{"name":"typecheck","status":"passed"},{"name":"test","status":"passed","coverage":"87%"},{"name":"build","status":"passed"}]}',
      pr_url: 'https://github.com/dev-rsquare/rtb-v2-mvp/pull/42',
      preview_url: 'http://localhost:3179',
      test_plan: '## 테스트 계획\n\n### 1. API 기능 테스트\n- TC-001: GET /api/buildings',
      test_result: '## 테스트 결과\n\n9/9 PASS (100%)',
    },
    gates: {
      G1: {
        gatekeeper: 'teamlead-agent',
        decision: 'approved',
        reason: '개발 계획이 요구사항을 충분히 반영하고 있음.',
        checklist: { requirement_coverage: true, api_design_quality: true },
        timestamp: '2026-02-12T02:54:22.798Z',
      },
      G2: {
        gatekeeper: 'teamlead-agent',
        decision: 'approved',
        reason: 'CI 전체 통과, PR 생성 확인.',
        checklist: { ci_passed: true, pr_created: true },
        timestamp: '2026-02-12T02:54:22.801Z',
      },
      G3: {
        gatekeeper: 'teamlead-agent',
        decision: 'approved',
        reason: '테스트 케이스 9개로 적절히 커버함.',
        checklist: { test_coverage: true },
        timestamp: '2026-02-12T02:54:22.804Z',
      },
      G4: {
        gatekeeper: 'teamlead-agent',
        decision: 'approved',
        reason: '테스트 100% 통과.',
        checklist: { all_tests_passed: true },
        timestamp: '2026-02-12T02:54:22.806Z',
      },
    },
  },
  {
    key: 'SIM-002',
    summary: '매물 검색 필터 API 개발',
    description: '매물 검색 시 다양한 필터 조건을 지원하는 API를 개발합니다.',
    status: 'Planning',
    priority: 'High',
    labels: ['RTB-AI-HUB'],
    created: '2026-02-12T02:54:22.793Z',
    updated: '2026-02-12T02:54:22.807Z',
    assignee: 'developer-agent',
    progress: 33,
    timeline: [
      {
        step: 1,
        agent: 'pm-agent',
        action: 'requirement_analysis',
        detail: 'Knowledge API에서 매물 관련 문서 검색 완료.',
        result:
          '테이블: prd_pdm_mst, prd_pdm_img_mst / API: GET /api/products, GET /api/products/:id',
        statusChange: 'Open → In Analysis',
        timestamp: '2026-02-12T02:54:22.796Z',
      },
      {
        step: 2,
        agent: 'developer-agent',
        action: 'dev_plan_creation',
        detail: '개발 계획서 작성 중...',
        result: 'API 2개, Repository 1개 구현 예정',
        statusChange: 'In Analysis → Planning',
        timestamp: '2026-02-12T02:54:22.797Z',
      },
      {
        step: 3,
        agent: 'teamlead-agent',
        action: 'gate_g1_review',
        detail: '개발 계획 심사: REJECTED',
        result: '필터 조건이 명확하지 않음. 재작성 필요.',
        statusChange: 'G1 Rejected',
        timestamp: '2026-02-12T02:54:22.798Z',
      },
      {
        step: 4,
        agent: 'developer-agent',
        action: 'dev_plan_revision',
        detail: '필터 조건 구체화 중 (지역, 가격, 면적, 타입)...',
        result: 'In progress',
        statusChange: 'Planning (재작성)',
        timestamp: '2026-02-12T02:54:22.800Z',
      },
      {
        step: 5,
        agent: 'teamlead-agent',
        action: 'gate_g1_review',
        detail: '개발 계획 심사 (2차): APPROVED',
        result: '필터 조건이 명확함. 개발 진행 가능.',
        statusChange: 'G1 Approved',
        timestamp: '2026-02-12T02:54:22.801Z',
      },
    ],
    artifacts: {
      refined_requirement: 'Requirement analysis complete',
      dev_plan: 'Development plan revision approved',
      branch_name: null,
      ci_result: null,
      pr_url: null,
      preview_url: null,
      test_plan: null,
      test_result: null,
    },
    gates: {
      G1: {
        gatekeeper: 'teamlead-agent',
        decision: 'approved',
        reason: '필터 조건이 명확함.',
        checklist: { filter_criteria_clear: true },
        timestamp: '2026-02-12T02:54:22.801Z',
      },
      G2: null,
      G3: null,
      G4: null,
    },
  },
];

async function importData() {
  console.log('🔄 시뮬레이션 데이터 import 시작...');
  const db = getDb();

  for (const workflow of mockWorkflows) {
    try {
      await db.insert(workflowExecutions).values({
        id: `wf-sim-${workflow.key.toLowerCase()}`,
        type: 'JIRA_AUTO_DEV',
        status: workflow.status,
        input: { issue: { key: workflow.key, fields: { summary: workflow.summary } } },
        output: { completed: true },
        jiraKey: workflow.key,
        summary: workflow.summary,
        assignee: workflow.assignee,
        progress: workflow.progress,
        timeline: workflow.timeline as any,
        artifacts: workflow.artifacts as any,
        gateDecisions: workflow.gates as any,
        env: 'int',
        startedAt: new Date(workflow.created),
        completedAt: workflow.status === 'Done' ? new Date(workflow.updated) : null,
        createdAt: new Date(workflow.created),
        updatedAt: new Date(workflow.updated),
      });
      console.log(`✅ ${workflow.key} imported successfully`);
    } catch (error) {
      console.error(`❌ Failed to import ${workflow.key}:`, error);
    }
  }

  console.log('✨ 시뮬레이션 데이터 import 완료!');
  process.exit(0);
}

importData();
