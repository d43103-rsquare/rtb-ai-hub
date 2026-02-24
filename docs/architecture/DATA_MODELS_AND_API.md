> **Status: DESIGN_ONLY** — 설계 문서만 존재, 실제 DB 스키마는 `packages/shared/src/db/schema.ts` 참조

# Data Models & API Design

## 1. 통합 데이터 모델

### 1.1 전체 ER 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Communication Coordinator Data Model                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  context_links   │────▶│ pattern_instances│◀────│  wiki_suggestions│
│  (기존)           │     │   (NEW)          │     │    (NEW)         │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   pattern_events │     │knowledge_gaps    │     │  concept_maps    │
│     (NEW)        │     │    (NEW)         │     │    (NEW)         │
└──────────────────┘     └──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ onboarding_plans │────▶│onboarding_progress│    │ mentor_profiles  │
│    (NEW)         │     │     (NEW)        │◀────│    (NEW)         │
└────────┬─────────┘     └──────────────────┘     └──────────────────┘
         │
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│contextual_help_  │     │ translation_     │
│   history        │     │   history        │
│   (NEW)          │     │   (NEW)          │
└──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   role_comm_     │     │  user_role_      │     │  feature_flags   │
│   preferences    │     │  assignments     │     │   (기존)         │
│    (NEW)         │     │    (NEW)         │     └──────────────────┘
└──────────────────┘     └──────────────────┘
```

### 1.2 테이블 상세 정의

```sql
-- ============================================
-- COMMUNICATION COORDINATOR CORE TABLES
-- ============================================

-- Pattern Instance: 커뮤니케이션 패턴 실행 인스턴스
CREATE TABLE pattern_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated',

  -- 컨텍스트 (JSONB)
  context JSONB DEFAULT '{
    "jiraKey": null,
    "githubPrNumber": null,
    "slackChannelId": null,
    "slackThreadTs": null,
    "initiatingMessage": null
  }',

  -- 참여자
  participants JSONB DEFAULT '[]',
  -- [{
  --   "role": "pm",
  --   "userId": "user@company.com",
  --   "status": "responded",
  --   "joinedAt": "2026-01-15T09:00:00Z",
  --   "contributions": [...]
  -- }]

  -- 단계 관리
  current_phase VARCHAR(50) NOT NULL,
  phase_history JSONB DEFAULT '[]',
  -- [{
  --   "phase": "initiated",
  --   "startedAt": "2026-01-15T09:00:00Z",
  --   "completedAt": "2026-01-15T09:30:00Z"
  -- }]

  -- 수집된 정보
  gathered_information JSONB DEFAULT '{}',
  -- {
  --   "business-requirements": {...},
  --   "technical-architecture": {...}
  -- }

  -- 결과물
  outputs JSONB DEFAULT '[]',

  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- 외래키
  context_link_id UUID REFERENCES context_links(id) ON DELETE SET NULL
);

COMMENT ON TABLE pattern_instances IS '커뮤니케이션 패턴 실행 인스턴스';
COMMENT ON COLUMN pattern_instances.pattern_id IS '패턴 식별자 (requirement-clarification, design-review 등)';
COMMENT ON COLUMN pattern_instances.status IS '현재 상태: initiated, gathering, discussion, consensus, resolved, blocked';

CREATE INDEX idx_pattern_instances_status ON pattern_instances(status);
CREATE INDEX idx_pattern_instances_pattern ON pattern_instances(pattern_id);
CREATE INDEX idx_pattern_instances_context_link ON pattern_instances(context_link_id);
CREATE INDEX idx_pattern_instances_created ON pattern_instances(created_at);

-- Pattern Events: 패턴 실행 이력 (감사용)
CREATE TABLE pattern_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES pattern_instances(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  -- phase_started, phase_completed, information_received, participant_joined, etc.

  event_data JSONB DEFAULT '{}',
  -- 이벤트별 상세 데이터

  triggered_by VARCHAR(100), -- 역할 또는 시스템
  triggered_by_user_id VARCHAR(200),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pattern_events_instance ON pattern_events(instance_id);
CREATE INDEX idx_pattern_events_type ON pattern_events(event_type);
CREATE INDEX idx_pattern_events_created ON pattern_events(created_at DESC);

-- ============================================
-- WIKI FACILITATION TABLES
-- ============================================

-- Wiki Suggestions: 자동 생성된 wiki 제안
CREATE TABLE wiki_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id VARCHAR(100) NOT NULL,

  -- 제안된 문서
  document_path VARCHAR(500) NOT NULL,
  document_title VARCHAR(500),
  summary TEXT,
  relevance_score DECIMAL(3,2) CHECK (relevance_score >= 0 AND relevance_score <= 1),

  -- 관련 섹션
  key_sections JSONB DEFAULT '[]',
  -- [{
  --   "heading": "Authentication Flow",
  --   "content": "...",
  --   "relevanceScore": 0.95,
  --   "lineNumbers": {"start": 10, "end": 50}
  -- }]

  -- 제안 근거
  matched_keywords TEXT[],
  matched_concepts TEXT[],
  context_gaps TEXT[],

  -- 표시 설정
  urgency VARCHAR(50) CHECK (urgency IN ('immediate', 'helpful', 'reference')),
  format VARCHAR(50) CHECK (format IN ('inline', 'sidebar', 'popup', 'digest')),

  -- 메타데이터
  suggested_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  feedback VARCHAR(50) CHECK (feedback IN ('helpful', 'not-relevant', 'already-known')),

  -- 관계
  user_id VARCHAR(200),
  jira_key VARCHAR(50),
  pattern_instance_id UUID REFERENCES pattern_instances(id) ON DELETE SET NULL
);

CREATE INDEX idx_wiki_suggestions_user ON wiki_suggestions(user_id);
CREATE INDEX idx_wiki_suggestions_relevance ON wiki_suggestions(relevance_score DESC);
CREATE INDEX idx_wiki_suggestions_trigger ON wiki_suggestions(trigger_id);
CREATE INDEX idx_wiki_suggestions_jira ON wiki_suggestions(jira_key);

-- Knowledge Gaps: 감지된 지식 격차
CREATE TABLE knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_in VARCHAR(200) NOT NULL, -- message id, discussion id
  detected_in_type VARCHAR(50) NOT NULL, -- slack, jira, github

  gap_type VARCHAR(100) NOT NULL CHECK (gap_type IN (
    'missing-domain', 'missing-technical', 'ambiguous-term', 'outdated-info'
  )),
  description TEXT NOT NULL,
  affected_roles TEXT[],
  severity VARCHAR(50) CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  related_wiki_docs TEXT[],
  related_discussions TEXT[],
  suggested_resolution TEXT,

  status VARCHAR(50) DEFAULT 'detected' CHECK (status IN (
    'detected', 'suggested', 'acknowledged', 'resolved', 'ignored'
  )),

  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(200)
);

CREATE INDEX idx_knowledge_gaps_status ON knowledge_gaps(status);
CREATE INDEX idx_knowledge_gaps_severity ON knowledge_gaps(severity);
CREATE INDEX idx_knowledge_gaps_type ON knowledge_gaps(gap_type);

-- Concept Maps: 개념 관계맵
CREATE TABLE concept_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_concept VARCHAR(200) NOT NULL,

  nodes JSONB DEFAULT '[]',
  -- [{
  --   "id": "jwt",
  --   "concept": "JWT Authentication",
  --   "category": "technical",
  --   "wikiPath": "security/jwt.md",
  --   "importance": 0.9
  -- }]

  edges JSONB DEFAULT '[]',
  -- [{
  --   "from": "jwt",
  --   "to": "oauth",
  --   "relationship": "related-to",
  --   "strength": 0.8
  -- }]

  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_for VARCHAR(200) -- user id or session id
);

CREATE INDEX idx_concept_maps_root ON concept_maps(root_concept);

-- ============================================
-- ONBOARDING TABLES
-- ============================================

-- Onboarding Plans: 온보딩 계획
CREATE TABLE onboarding_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,

  start_date TIMESTAMPTZ NOT NULL,
  expected_end_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,

  phases JSONB DEFAULT '[]',
  -- [{
  --   "id": "phase-1",
  --   "name": "도메인 이해",
  --   "order": 1,
  --   "durationDays": 3,
  --   "steps": [...],
  --   "status": "in-progress"
  -- }]

  progress JSONB DEFAULT '{
    "completedSteps": 0,
    "totalSteps": 10,
    "currentPhase": "phase-1",
    "overallProgress": 0
  }',

  mentor_id VARCHAR(200),
  mentor_assigned_at TIMESTAMPTZ,

  config JSONB DEFAULT '{
    "pace": "standard",
    "focusAreas": [],
    "skipIfKnown": true
  }',

  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_onboarding_plans_user ON onboarding_plans(user_id);
CREATE INDEX idx_onboarding_plans_role ON onboarding_plans(role);
CREATE INDEX idx_onboarding_plans_status ON onboarding_plans(status);

-- Onboarding Progress: 상세 진행 이력
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES onboarding_plans(id) ON DELETE CASCADE,

  step_id VARCHAR(100) NOT NULL,
  step_name VARCHAR(200),
  step_type VARCHAR(50),

  status VARCHAR(50) NOT NULL CHECK (status IN ('not-started', 'in-progress', 'completed', 'skipped')),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,

  notes TEXT,
  mentor_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(plan_id, step_id)
);

CREATE INDEX idx_onboarding_progress_plan ON onboarding_progress(plan_id);
CREATE INDEX idx_onboarding_progress_status ON onboarding_progress(status);

-- Mentor Profiles: 멘토 프로필
CREATE TABLE mentor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,

  expertise JSONB DEFAULT '{
    "domains": [],
    "technologies": [],
    "yearsOfExperience": 0
  }',

  mentoring_stats JSONB DEFAULT '{
    "totalMentees": 0,
    "currentMentees": 0,
    "averageRating": 0,
    "preferredMenteeRoles": []
  }',

  availability JSONB DEFAULT '{
    "maxMentees": 2,
    "preferredMeetingTimes": [],
    "timezone": "Asia/Seoul"
  }',

  is_available BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mentor_profiles_available ON mentor_profiles(is_available) WHERE is_available = true;
CREATE INDEX idx_mentor_profiles_role ON mentor_profiles(role);

-- Contextual Help History: 맥락 기반 도움 이력
CREATE TABLE contextual_help_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL,
  role VARCHAR(50) NOT NULL,

  question TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  -- {
  --   "currentTask": "...",
  --   "currentFile": "...",
  --   "currentTicket": "..."
  -- }

  answer TEXT,
  resources JSONB DEFAULT '[]',
  suggested_people JSONB DEFAULT '[]',

  urgency VARCHAR(50),
  helpful BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contextual_help_user ON contextual_help_history(user_id);
CREATE INDEX idx_contextual_help_role ON contextual_help_history(role);
CREATE INDEX idx_contextual_help_created ON contextual_help_history(created_at DESC);

-- ============================================
-- TRANSLATION & ADAPTER TABLES
-- ============================================

-- Translation History: 번역 이력
CREATE TABLE translation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_role VARCHAR(50) NOT NULL,
  target_role VARCHAR(50) NOT NULL,

  input_text TEXT NOT NULL,
  input_format VARCHAR(50) DEFAULT 'text',
  input_structured JSONB,

  output_text TEXT NOT NULL,
  output_format VARCHAR(50) DEFAULT 'text',
  output_structured JSONB,

  -- 품질 메트릭
  quality JSONB DEFAULT '{
    "accuracy": 0,
    "completeness": 0,
    "clarity": 0,
    "confidence": 0
  }',

  -- 검증 결과
  validation JSONB DEFAULT '{
    "checked": false,
    "issues": [],
    "suggestions": []
  }',

  context JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(200)
);

CREATE INDEX idx_translation_roles ON translation_history(source_role, target_role);
CREATE INDEX idx_translation_created ON translation_history(created_at DESC);

-- ============================================
-- CONFIGURATION TABLES
-- ============================================

-- Role Communication Preferences: 역할별 커뮤니케이션 설정
CREATE TABLE role_communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL UNIQUE,

  notification_channels JSONB DEFAULT '["slack"]',
  notification_frequency VARCHAR(50) DEFAULT 'immediate',

  default_response_timeout_minutes INTEGER DEFAULT 480,

  allow_auto_response BOOLEAN DEFAULT false,
  auto_response_triggers JSONB DEFAULT '[]',

  preferred_hours_start TIME,
  preferred_hours_end TIME,
  timezone VARCHAR(100) DEFAULT 'Asia/Seoul',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Role Assignments: 사용자 역할 매핑
CREATE TABLE user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL,
  role VARCHAR(50) NOT NULL,

  project_key VARCHAR(50),
  team_id VARCHAR(100),

  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, role, project_key, team_id)
);

CREATE INDEX idx_user_roles_user ON user_role_assignments(user_id);
CREATE INDEX idx_user_roles_role ON user_role_assignments(role);
CREATE INDEX idx_user_roles_active ON user_role_assignments(is_active) WHERE is_active = true;

-- ============================================
-- FEATURE FLAGS (기존 테이블 확장)
-- ============================================

-- 기존 constants.ts의 FEATURE_FLAGS에 추가할 항목들:
-- - COMMUNICATION_COORDINATOR_ENABLED
-- - PATTERN_ENGINE_ENABLED
-- - ROLE_ADAPTER_ENABLED
-- - WIKI_FACILITATION_ENABLED
-- - ONBOARDING_COORDINATION_ENABLED
```

---

## 2. REST API 설계

### 2.1 API 개요

```
Base URL: /api/v1/coordinator

인증: Bearer Token (기존 auth-service와 통일)
Content-Type: application/json
```

### 2.2 Pattern Engine API

```yaml
# 패턴 인스턴스 관리

POST /patterns/instances
  description: 새 패턴 인스턴스 생성
  request:
    body:
      patternId: string (requirement-clarification, design-review, ...)
      context:
        jiraKey?: string
        githubPrNumber?: number
        slackChannelId?: string
        initiatingMessage: string
      participants:
        - role: ExtendedTeamRole
          userId?: string
  response:
    201:
      body:
        id: UUID
        patternId: string
        status: string
        currentPhase: string
        participants: [...]

GET /patterns/instances/:id
  description: 패턴 인스턴스 조회
  response:
    200:
      body:
        id: UUID
        patternId: string
        status: string
        currentPhase: string
        participants: [...]
        gatheredInformation: {...}
        outputs: [...]
        phaseHistory: [...]

POST /patterns/instances/:id/information
  description: 정보 수집
  request:
    body:
      role: ExtendedTeamRole
      responses:
        - requirementId: string
          content:
            raw: string
            structured?: {...}
  response:
    200:
      body:
        instance: PatternInstance
        phaseAdvanced: boolean

POST /patterns/instances/:id/advance
  description: 다음 단계로 진행
  response:
    200:
      body:
        instance: PatternInstance
        newPhase: string

GET /patterns/instances
  description: 패턴 인스턴스 목록 조회
  query:
    status?: string
    patternId?: string
    userId?: string
    jiraKey?: string
    limit?: number (default: 20)
    offset?: number (default: 0)
  response:
    200:
      body:
        items: [...]
        total: number
        limit: number
        offset: number

# 패턴 템플릿 관리

GET /patterns/templates
  description: 사용 가능한 패턴 템플릿 목록
  response:
    200:
      body:
        patterns:
          - id: string
            name: string
            description: string
            participants: [...]

GET /patterns/templates/:id
  description: 패턴 템플릿 상세 조회
  response:
    200:
      body:
        id: string
        name: string
        description: string
        triggers: [...]
        participants: [...]
        phases: [...]
        informationRequirements: [...]
```

### 2.3 Role Adapter API

```yaml
POST /translate
  description: 역할 간 번역
  request:
    body:
      sourceRole: ExtendedTeamRole
      targetRole: ExtendedTeamRole
      content: string
      context:
        jiraKey?: string
        projectContext?: string
        conversationHistory?: string[]
      options:
        detailLevel: high | medium | low
        includeAlternatives: boolean
        includeJustification: boolean
  response:
    200:
      body:
        output:
          raw: string
          structured?: {...}
        sourceAnalysis:
          intent: string
          extractedConcepts: [...]
          confidence: number
        transformation:
          mappedConcepts: [...]
          addedContext: [...]
          removedAmbiguity: [...]
        quality:
          accuracy: number
          completeness: number
          clarity: number
          confidence: number
        validation:
          checked: boolean
          issues: [...]
          suggestions: [...]

POST /translate/bidirectional
  description: 양방향 번역 (번역 후 역번역)
  request:
    body:
      role1: ExtendedTeamRole
      role2: ExtendedTeamRole
      content: string
      from: ExtendedTeamRole
  response:
    200:
      body:
        to: string  # role1 -> role2 번역
        back: string  # role2 -> role1 역번역
        consistency: number  # 원문과 역번역의 일치도

GET /translate/history
  description: 번역 이력 조회
  query:
    sourceRole?: ExtendedTeamRole
    targetRole?: ExtendedTeamRole
    userId?: string
    limit?: number
  response:
    200:
      body:
        items: [...]
        total: number

# 도메인 모델 조회

GET /domain-models/:role
  description: 역할별 도메인 모델 조회
  response:
    200:
      body:
        role: ExtendedTeamRole
        coreConcepts: [...]
        language:
          preferredVocabulary: [...]
          typicalPatterns: [...]
          ambiguityIndicators: [...]
        informationNeeds:
          alwaysRequired: [...]
          contextDependent: [...]
          niceToHave: [...]

GET /domain-models/concepts
  description: 개념 검색
  query:
    q: string
    role?: ExtendedTeamRole
    category?: ConceptCategory
  response:
    200:
      body:
        concepts:
          - id: string
            name: string
            role: ExtendedTeamRole
            category: ConceptCategory
            definition: string
```

### 2.4 Wiki Facilitation API

```yaml
POST /wiki/analyze
  description: 컨텍스트 분석 및 wiki 제안
  request:
    body:
      source: slack | jira | github | manual
      sourceId: string
      content:
        text: string
        author:
          userId: string
          role: ExtendedTeamRole
        threadContext?: string[]
      context:
        jiraKey?: string
        project?: string
        participants: ExtendedTeamRole[]
  response:
    200:
      body:
        suggestions:
          - id: string
            document:
              path: string
              title: string
              summary: string
              relevanceScore: number
              keySections: [...]
            reasoning:
              matchedKeywords: [...]
              matchedConcepts: [...]
              contextGaps: [...]
            presentation:
              urgency: immediate | helpful | reference
              format: inline | sidebar | popup | digest
        gaps:
          - id: string
            gapType: string
            description: string
            severity: critical | high | medium | low

POST /wiki/suggestions/:id/feedback
  description: 제안 피드백
  request:
    body:
      feedback: helpful | not-relevant | already-known
  response:
    200:
      body:
        success: true

GET /wiki/suggestions
  description: 제안 이력 조회
  query:
    userId?: string
    jiraKey?: string
    feedback?: string
    limit?: number
  response:
    200:
      body:
        items: [...]
        total: number

# 개념 관계맵

POST /wiki/concept-maps
  description: 개념 관계맵 생성
  request:
    body:
      rootConcept: string
      depth: number (default: 2)
  response:
    200:
      body:
        id: UUID
        rootConcept: string
        nodes: [...]
        edges: [...]
        generatedAt: string

GET /wiki/concept-maps/:id
  description: 개념 관계맵 조회
  response:
    200:
      body:
        id: UUID
        rootConcept: string
        nodes: [...]
        edges: [...]

# Knowledge Gaps

GET /wiki/gaps
  description: 지식 격차 목록
  query:
    status?: detected | suggested | acknowledged | resolved | ignored
    severity?: critical | high | medium | low
    role?: ExtendedTeamRole
  response:
    200:
      body:
        items: [...]
        total: number

PATCH /wiki/gaps/:id
  description: 지식 격차 상태 업데이트
  request:
    body:
      status: string
      resolution?: string
  response:
    200:
      body:
        gap: KnowledgeGap
```

### 2.5 Onboarding API

```yaml
POST /onboarding/plans
  description: 온보딩 플랜 생성
  request:
    body:
      userId: string
      role: ExtendedTeamRole
      startDate: string (ISO 8601)
      pace?: standard | accelerated | extended
      priorExperience?: string[]
  response:
    201:
      body:
        id: UUID
        userId: string
        role: ExtendedTeamRole
        phases: [...]
        mentor?: {...}

GET /onboarding/plans/:id
  description: 온보딩 플랜 조회
  response:
    200:
      body:
        id: UUID
        userId: string
        role: ExtendedTeamRole
        phases: [...]
        progress:
          completedSteps: number
          totalSteps: number
          currentPhase: string
          overallProgress: number
        mentor?: {...}

PATCH /onboarding/plans/:id
  description: 온보딩 플랜 수정
  request:
    body:
      status?: active | completed | paused | cancelled
      config?: {...}
  response:
    200:
      body:
        plan: OnboardingPlan

POST /onboarding/plans/:id/progress
  description: 진행 상황 업데이트
  request:
    body:
      stepId: string
      status: not-started | in-progress | completed | skipped
      notes?: string
  response:
    200:
      body:
        progress: OnboardingProgress
        plan: OnboardingPlan

GET /onboarding/plans/:id/recommendations
  description: 다음 단계 추천
  response:
    200:
      body:
        step:
          id: string
          name: string
          type: string
          content: {...}
        reasoning: string

POST /onboarding/contextual-help
  description: 맥락 기반 도움 요청
  request:
    body:
      userId: string
      role: ExtendedTeamRole
      context:
        currentTask?: string
        currentFile?: string
        currentTicket?: string
        errorMessage?: string
        codeSnippet?: string
      question: string
      urgency: blocking | helpful | curiosity
  response:
    200:
      body:
        answer: string
        resources: [...]
        nextSteps: [...]
        suggestedPeople: [...]
        learningOpportunity?: {...}

# 멘토 관리

GET /onboarding/mentors
  description: 멘토 목록 조회
  query:
    role?: ExtendedTeamRole
    available?: boolean
    technology?: string
  response:
    200:
      body:
        mentors:
          - userId: string
            role: ExtendedTeamRole
            expertise: {...}
            availability: {...}

POST /onboarding/mentors/:id/assign
  description: 멘토 배정
  request:
    body:
      menteeId: string
  response:
    200:
      body:
        match:
          mentorId: string
          menteeId: string
          score: number
          recommendations: {...}

GET /onboarding/mentors/:id/stats
  description: 멘토 통계
  response:
    200:
      body:
        totalMentees: number
        currentMentees: number
        averageRating: number
        completedMentorships: number
```

### 2.6 Dashboard & Analytics API

```yaml
GET /dashboard/overview
  description: 대시보드 개요
  response:
    200:
      body:
        activePatterns: number
        pendingTranslations: number
        wikiSuggestionsToday: number
        activeOnboarding: number
        knowledgeGaps: number

GET /analytics/communication
  description: 커뮤니케이션 분석
  query:
    startDate: string
    endDate: string
    role?: ExtendedTeamRole
  response:
    200:
      body:
        patterns:
          initiated: number
          completed: number
          averageDuration: number
        translations:
          total: number
          averageQuality: number
          byRole: {...}
        wikiFacilitation:
          suggestionsGenerated: number
          averageRelevance: number
          helpfulRate: number

GET /analytics/onboarding
  description: 온보딩 분석
  query:
    cohort?: string
    role?: ExtendedTeamRole
  response:
    200:
      body:
        completionRate: number
        averageTimeToProductivity: number
        satisfactionScore: number
        dropOffPoints: [...]
```

---

## 3. WebSocket Events (Real-time)

```yaml
# 패턴 업데이트
pattern:updated
  payload:
    instanceId: UUID
    patternId: string
    status: string
    currentPhase: string
    message: string

# wiki 제안
wiki:suggested
  payload:
    suggestionId: UUID
    documentTitle: string
    summary: string
    urgency: string
    relevanceScore: number

# 온보딩 진행
onboarding:progress
  payload:
    planId: UUID
    userId: string
    stepId: string
    status: string
    overallProgress: number

# 번역 완료
translation:completed
  payload:
    translationId: UUID
    sourceRole: string
    targetRole: string
    confidence: number
```

---

다음 단계: **통합 및 확장 전략 문서화**
