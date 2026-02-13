import type { Artifacts } from './issue-store';

export interface KnowledgeSearchResult {
  query: string;
  results: Array<{
    title: string;
    content: string;
    relevance: number;
  }>;
}

export interface InfraActionResult {
  success: boolean;
  action: string;
  data: Record<string, unknown>;
}

export class SimulatedHubClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;

  constructor(apiUrl = 'http://localhost:4000', apiToken = 'sim-test-token') {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
  }

  async searchKnowledge(query: string, domain?: string): Promise<KnowledgeSearchResult> {
    return {
      query,
      results: [
        {
          title: `obj_bld_mst - 빌딩 마스터 테이블`,
          content: [
            '## obj_bld_mst (빌딩 마스터)',
            '',
            '| Column | Type | Description |',
            '|--------|------|-------------|',
            '| bld_id | BIGINT | 빌딩 ID (PK) |',
            '| bld_nm | VARCHAR(200) | 빌딩명 |',
            '| bld_addr | VARCHAR(500) | 빌딩 주소 |',
            '| grs_area | DECIMAL(15,2) | 연면적 |',
            '| flr_cnt | INT | 층수 |',
            '| crt_dt | TIMESTAMP | 생성일시 |',
            '| upd_dt | TIMESTAMP | 수정일시 |',
            '',
            '### 관련 테이블',
            '- obj_bld_flr_mst: 층별 정보',
            '- obj_bld_unit_mst: 호실 정보',
            '',
            `### 자주 사용하는 쿼리 패턴`,
            '```sql',
            'SELECT b.bld_id, b.bld_nm, b.bld_addr, b.grs_area',
            'FROM obj_bld_mst b',
            "WHERE b.del_yn = 'N'",
            'ORDER BY b.bld_nm;',
            '```',
          ].join('\n'),
          relevance: 0.95,
        },
        {
          title: `obj_bld_flr_mst - 빌딩 층 마스터`,
          content: [
            '## obj_bld_flr_mst (빌딩 층 마스터)',
            '',
            '| Column | Type | Description |',
            '|--------|------|-------------|',
            '| flr_id | BIGINT | 층 ID (PK) |',
            '| bld_id | BIGINT | 빌딩 ID (FK) |',
            '| flr_no | VARCHAR(10) | 층 번호 |',
            '| flr_area | DECIMAL(15,2) | 층 면적 |',
          ].join('\n'),
          relevance: 0.78,
        },
      ],
    };
  }

  async refineRequirement(
    requirement: string,
    knowledgeContext: string
  ): Promise<{ refined: string; tables: string[]; apis: string[] }> {
    return {
      refined: [
        `## 정제된 요구사항: ${requirement}`,
        '',
        '### 기능 요구사항',
        '1. 빌딩 목록 조회 API (페이지네이션, 검색, 정렬)',
        '2. 빌딩 상세 조회 API (층/호실 정보 포함)',
        '3. 빌딩 등록/수정 API',
        '',
        '### 기술 명세',
        '- Base table: obj_bld_mst',
        '- Related: obj_bld_flr_mst, obj_bld_unit_mst',
        "- Soft delete: del_yn = 'N' 조건 필수",
        '- Pagination: offset-based (page, size)',
        '',
        '### 비기능 요구사항',
        '- 응답시간: 200ms 이내',
        '- 페이지 크기: 기본 20, 최대 100',
      ].join('\n'),
      tables: ['obj_bld_mst', 'obj_bld_flr_mst', 'obj_bld_unit_mst'],
      apis: [
        'GET /api/buildings',
        'GET /api/buildings/:id',
        'POST /api/buildings',
        'PUT /api/buildings/:id',
      ],
    };
  }

  async createBranch(
    repo: string,
    branchName: string,
    baseBranch: string
  ): Promise<InfraActionResult> {
    return {
      success: true,
      action: 'git/branch',
      data: { repo, branchName, baseBranch, created: true },
    };
  }

  async runOpenCodeTask(
    taskDescription: string,
    _context: Record<string, unknown>
  ): Promise<InfraActionResult> {
    return {
      success: true,
      action: 'opencode/task',
      data: {
        taskId: `sim-task-${Date.now()}`,
        status: 'completed',
        filesCreated: [
          'src/api/routes/buildings.ts',
          'src/api/services/building-service.ts',
          'src/api/repositories/building-repository.ts',
        ],
        filesModified: ['src/api/routes/index.ts'],
        description: taskDescription,
      },
    };
  }

  async commitAndPush(repo: string, branch: string, message: string): Promise<InfraActionResult> {
    return {
      success: true,
      action: 'git/commit-push',
      data: { repo, branch, message, commitHash: 'abc1234' },
    };
  }

  async runCi(repo: string, branch: string): Promise<InfraActionResult> {
    return {
      success: true,
      action: 'ci/run',
      data: {
        repo,
        branch,
        steps: [
          { name: 'lint', status: 'passed', duration: '3.2s' },
          { name: 'typecheck', status: 'passed', duration: '5.1s' },
          { name: 'test', status: 'passed', duration: '12.4s', coverage: '87%' },
          { name: 'build', status: 'passed', duration: '8.7s' },
        ],
        overall: 'passed',
      },
    };
  }

  async createPr(
    repo: string,
    branch: string,
    title: string,
    body: string
  ): Promise<InfraActionResult> {
    return {
      success: true,
      action: 'pr/create',
      data: {
        repo,
        branch,
        title,
        body,
        prNumber: 42,
        prUrl: `https://github.com/${repo}/pull/42`,
      },
    };
  }

  async deployPreview(repo: string, branch: string): Promise<InfraActionResult> {
    const port = 3100 + Math.floor(Math.random() * 100);
    return {
      success: true,
      action: 'deploy/preview',
      data: {
        repo,
        branch,
        previewUrl: `http://localhost:${port}`,
        port,
        status: 'running',
        healthCheck: 'passed',
      },
    };
  }

  formatArtifactSummary(artifacts: Partial<Artifacts>): string {
    const lines: string[] = ['### Artifacts Summary'];
    for (const [key, value] of Object.entries(artifacts)) {
      if (value) {
        lines.push(
          `- **${key}**: ${typeof value === 'string' && value.length > 80 ? value.slice(0, 80) + '...' : value}`
        );
      }
    }
    return lines.join('\n');
  }
}
