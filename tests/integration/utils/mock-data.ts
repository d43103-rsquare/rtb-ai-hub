export const mockJiraIssue = {
  key: 'PROJ-123',
  summary: '사용자 로그인 기능 구현',
  description: 'RTB 플랫폼의 사용자 인증 시스템을 구현합니다.',
  status: 'In Progress',
  assignee: 'pm-agent',
  labels: ['auth', 'login', 'RTB-AI-HUB'],
  priority: 'High',
  components: ['Frontend', 'Backend'],
  created: '2026-01-15T09:00:00Z',
  updated: '2026-01-15T10:30:00Z',
};

export const mockSlackEvent = {
  type: 'app_mention',
  user: 'U123456',
  text: '@RTB AI Assistant 로그인 기능 어떻게 진행되고 있어?',
  channel: 'C123456',
  ts: '1234567890.123456',
};

export const mockSlashCommand = {
  command: '/rtb-ai',
  text: 'start PROJ-123',
  user_id: 'U123456',
  channel_id: 'C123456',
  response_url: 'https://hooks.slack.com/test',
};

export const mockAgentResponse = {
  pm: {
    agentId: 'pm-agent',
    name: 'VisionKeeper',
    response: 'PROJ-123 로그인 기능은 현재 개발 중입니다.',
    context: {
      jiraKey: 'PROJ-123',
      status: 'In Progress',
      nextSteps: ['UI 개발 완료', 'API 연동', '테스트'],
    },
  },
  systemPlanner: {
    agentId: 'system-planner-agent',
    name: 'BlueprintMaster',
    response: '로그인 시스템 아키텍처를 설계하겠습니다.',
    architecture: {
      components: ['OAuth Provider', 'Session Manager', 'Auth Middleware'],
      database: ['users', 'sessions', 'oauth_tokens'],
      apis: ['/api/auth/login', '/api/auth/logout', '/api/auth/refresh'],
    },
  },
  uxDesigner: {
    agentId: 'ux-designer-agent',
    name: 'ExperienceCraftsman',
    response: '로그인 UX 플로우를 설계했습니다.',
    flow: [
      { step: 1, action: '사용자가 로그인 페이지 진입', screen: 'Login Page' },
      { step: 2, action: '이메일/비밀번호 입력', screen: 'Login Form' },
      { step: 3, action: '인증 성공', screen: 'Dashboard' },
    ],
  },
  uiDev: {
    agentId: 'ui-dev-agent',
    name: 'PixelPerfect',
    response: '로그인 폼 컴포넌트를 생성했습니다.',
    code: {
      component: 'LoginForm.tsx',
      props: ['onSubmit', 'isLoading', 'error'],
      styles: 'Tailwind CSS',
    },
  },
  backendDev: {
    agentId: 'backend-dev-agent',
    name: 'DataGuardian',
    response: '로그인 API를 구현했습니다.',
    endpoints: [
      { method: 'POST', path: '/api/auth/login', description: '사용자 로그인' },
      { method: 'POST', path: '/api/auth/logout', description: '로그아웃' },
      { method: 'POST', path: '/api/auth/refresh', description: '토큰 갱신' },
    ],
  },
  qa: {
    agentId: 'qa-agent',
    name: 'QualityGatekeeper',
    response: '로그인 기능 테스트 케이스를 작성했습니다.',
    testCases: [
      { id: 'TC001', type: 'positive', description: '정상 로그인' },
      { id: 'TC002', type: 'negative', description: '잘못된 비밀번호' },
      { id: 'TC003', type: 'edge', description: '세션 만료' },
    ],
  },
  ops: {
    agentId: 'ops-agent',
    name: 'InfrastructureKeeper',
    response: '배포 상태를 확인했습니다.',
    deployment: {
      status: 'healthy',
      version: 'v1.2.3',
      environment: 'production',
      lastDeployed: '2026-01-15T08:00:00Z',
    },
  },
};

export const mockGatewayConfig = {
  gateway: {
    mode: 'http',
    port: 3000,
    host: '0.0.0.0',
  },
  hooks: {
    enabled: true,
    path: '/hooks',
    token: 'test-token',
  },
  agents: {
    enabled: true,
    mode: 'multi',
    coordinator: 'pm-agent',
    timeout: 3600,
    max_concurrent: 3,
  },
  channels: {
    slack: {
      enabled: true,
      socket_mode: true,
    },
  },
};

export const mockScenario1 = {
  name: 'Login Feature Development',
  steps: [
    { agent: 'pm-agent', action: 'create_jira_ticket', input: '로그인 기능 구현' },
    { agent: 'system-planner-agent', action: 'design_architecture', input: '로그인 시스템 설계' },
    { agent: 'ux-designer-agent', action: 'design_ux_flow', input: '로그인 UX 설계' },
    { agent: 'ui-dev-agent', action: 'implement_ui', input: '로그인 폼 구현' },
    { agent: 'backend-dev-agent', action: 'implement_api', input: '로그인 API 구현' },
    { agent: 'qa-agent', action: 'write_tests', input: '로그인 테스트 케이스' },
    { agent: 'ops-agent', action: 'deploy', input: '프로덕션 배포' },
  ],
};

export const mockScenario2 = {
  name: 'Payment API Incident Response',
  steps: [
    { agent: 'ops-agent', action: 'detect_incident', input: '결제 API 장애 감지' },
    { agent: 'ops-agent', action: 'create_alert', input: 'P1 알림 생성' },
    { agent: 'pm-agent', action: 'notify_stakeholders', input: '이해관계자 알림' },
    { agent: 'backend-dev-agent', action: 'analyze_logs', input: '로그 분석' },
    { agent: 'ops-agent', action: 'rollback', input: '이전 버전 롤백' },
    { agent: 'qa-agent', action: 'verify_fix', input: '수정 검증' },
  ],
};

export const mockScenario3 = {
  name: 'New Hire Onboarding',
  steps: [
    { agent: 'pm-agent', action: 'create_onboarding_plan', input: '신규 입사자 온보딩 계획' },
    {
      agent: 'system-planner-agent',
      action: 'explain_architecture',
      input: '시스템 아키텍처 설명',
    },
    { agent: 'ops-agent', action: 'setup_environment', input: '개발 환경 설정' },
    { agent: 'ux-designer-agent', action: 'explain_design_system', input: '디자인 시스템 설명' },
    { agent: 'pm-agent', action: 'assign_first_task', input: '첫 업무 할당' },
  ],
};
