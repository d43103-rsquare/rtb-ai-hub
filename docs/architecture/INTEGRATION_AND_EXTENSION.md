# Integration & Extension Strategy

## 1. 기존 시스템과의 통합

### 1.1 통합 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Integration Architecture                                 │
└─────────────────────────────────────────────────────────────────────────────┘

EXISTING SYSTEM                      NEW COMPONENTS
─────────────────────────────────────────────────────────────────────────────

┌──────────────────┐              ┌─────────────────────────────────────┐
│  Webhook Listener│              │  Communication Coordinator          │
│  :4000           │              │  Service                            │
│                  │◀────────────│                                     │
│  /webhooks/jira  │  Events      │  - Pattern Engine                   │
│  /webhooks/github│              │  - Role Adapter                     │
│  /webhooks/slack │              │  - Wiki Facilitator                 │
│  /webhooks/figma │              │  - Onboarding Service               │
└────────┬─────────┘              └──────────────┬──────────────────────┘
         │                                       │
         │                                       │
         ▼                                       ▼
┌──────────────────┐              ┌─────────────────────────────────────┐
│   BullMQ Queues  │              │  Multi-Agent Pipeline               │
│                  │              │  (Existing)                         │
│  jira-queue      │◀────────────│                                     │
│  github-queue    │              │  Analyzer → Planner → Developer     │
│  figma-queue     │              │         ↓                           │
└────────┬─────────┘              │      Reviewer ← Oracle              │
         │                        └─────────────────────────────────────┘
         │                                       │
         │                                       │
         ▼                                       ▼
┌──────────────────┐              ┌─────────────────────────────────────┐
│ Workflow Engine  │              │  Context Engine                     │
│                  │              │  (Existing)                         │
│  Workers         │────────────▶│                                     │
│                  │  Context     │  - context_links table              │
└────────┬─────────┘              │  - Cross-reference engine           │
         │                        └─────────────────────────────────────┘
         │                                       │
         ▼                                       ▼
┌──────────────────┐              ┌─────────────────────────────────────┐
│  Notification    │              │  Wiki Knowledge                     │
│  (Slack/Jira)    │◀────────────│  (Existing)                         │
│                  │  Results     │                                     │
└──────────────────┘              │  - Auto-indexing                    │
                                  │  - Domain search                    │
                                  └─────────────────────────────────────┘
```

### 1.2 통합 포인트 상세

#### 1.2.1 Webhook Listener Integration

```typescript
// packages/webhook-listener/src/routes/coordinator.ts

import { Router } from 'express';
import { patternEngine } from '@rtb-ai-hub/workflow-engine';
import { wikiFacilitator } from '@rtb-ai-hub/workflow-engine';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('coordinator-routes');
const router = Router();

/**
 * 커뮤니케이션 이벤트 처리
 * 기존 웹훅 라우트에서 확장
 */
router.post('/events', async (req, res) => {
  const { source, event, context } = req.body;

  try {
    // 1. Pattern Engine에 이벤트 전달
    const patternInstance = await patternEngine.detectAndStart({
      id: generateEventId(),
      source,
      sourceId: event.id,
      content: {
        text: event.text,
        author: {
          userId: event.author.id,
          role: await resolveRole(event.author.email),
        },
        timestamp: new Date(),
        threadContext: event.threadMessages,
      },
      context: {
        jiraKey: context.jiraKey,
        project: context.project,
        participants: await resolveParticipants(event.participants),
      },
    });

    // 2. Wiki Facilitation 실행
    if (patternInstance) {
      const { suggestions, gaps } = await wikiFacilitator.analyzeAndSuggest({
        id: generateTriggerId(),
        source,
        sourceId: event.id,
        content: {
          text: event.text,
          author: {
            userId: event.author.id,
            role: await resolveRole(event.author.email),
          },
          timestamp: new Date(),
        },
        context: {
          jiraKey: context.jiraKey,
          participants: await resolveParticipants(event.participants),
        },
      });

      // 3. 결과를 Slack/Jira에 전송
      await deliverSuggestions(suggestions, event.channel);
    }

    res.json({
      success: true,
      patternInstanceId: patternInstance?.id,
    });
  } catch (error) {
    logger.error({ error, source }, 'Failed to process coordinator event');
    res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
```

#### 1.2.2 Workflow Engine Integration

```typescript
// packages/workflow-engine/src/communication/integration.ts

import { AgentOrchestrator } from '../agents/orchestrator';
import { PatternEngine } from './patterns/pattern-engine';
import { RoleAdapter } from './adapters/adapter-registry';

/**
 * 통합 서비스
 * 기존 워크플로우와 새 컴포넌트 연결
 */
export class CommunicationCoordinatorIntegration {
  constructor(
    private orchestrator: AgentOrchestrator,
    private patternEngine: PatternEngine,
    private roleAdapter: RoleAdapter
  ) {}

  /**
   * 기존 AI 워크플로우에 커뮤니케이션 패턴 통합
   */
  async enhanceWorkflowWithPattern(
    workflowExecutionId: string,
    patternId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    // 1. 패턴 인스턴스 생성
    const patternInstance = await this.patternEngine.createInstance({
      id: generateId('pattern'),
      patternId,
      context: {
        workflowExecutionId,
        ...context,
      },
    });

    // 2. 워크플로우 컨텍스트에 패턴 정보 추가
    await this.enhanceAgentContext(workflowExecutionId, {
      patternInstanceId: patternInstance.id,
      communicationContext: patternInstance.context,
    });
  }

  /**
   * 멀티 에이전트 파이프라인에 역할 어댑터 통합
   */
  async adaptAgentCommunication(
    agentRole: AgentRole,
    targetHumanRole: ExtendedTeamRole,
    content: string
  ): Promise<string> {
    // 에이전트 출력을 인간 역할에 맞게 번역
    const translation = await this.roleAdapter.translate(
      'system' as ExtendedTeamRole,
      targetHumanRole,
      content,
      { detailLevel: 'medium' }
    );

    return translation.output.raw;
  }
}
```

#### 1.2.3 Context Engine Integration

```typescript
// packages/workflow-engine/src/utils/context-engine.ts (기존 파일 확장)

/**
 * 커뮤니케이션 컨텍스트 추가
 */
export interface ExtendedContextLink extends ContextLink {
  // 패턴 관련
  patternInstances?: string[];

  // 번역 이력
  translationHistory?: Array<{
    id: string;
    sourceRole: ExtendedTeamRole;
    targetRole: ExtendedTeamRole;
    timestamp: string;
  }>;

  // wiki 제안
  wikiSuggestions?: Array<{
    id: string;
    documentPath: string;
    acknowledged: boolean;
  }>;

  // 참여자 정보
  participants?: Record<
    ExtendedTeamRole,
    {
      userId: string;
      joinedAt: string;
    }
  >;
}

/**
 * 패턴 인스턴스와 컨텍스트 연결
 */
export async function linkPatternToContext(
  jiraKey: string,
  patternInstanceId: string
): Promise<void> {
  const context = await getContext(jiraKey);

  if (context) {
    const existing = (context as ExtendedContextLink).patternInstances || [];

    await updateContext({
      jiraKey,
      patternInstances: [...existing, patternInstanceId],
    });
  }
}
```

#### 1.2.4 Notification Integration

```typescript
// packages/workflow-engine/src/utils/role-notifier.ts (기존 파일 확장)

/**
 * 커뮤니케이션 패턴 결과 알림
 */
export async function notifyPatternResult(
  patternInstance: PatternInstance,
  options: NotifyByRoleOptions
): Promise<void> {
  // 역할별 맞춤 메시지 생성
  const messages = generateRoleSpecificMessages(patternInstance);

  for (const participant of patternInstance.participants) {
    const message = messages[participant.role];
    if (message) {
      await notifyByRole({
        eventType: 'pattern_completed',
        context: {
          ...options.context,
          patternId: patternInstance.patternId,
          patternOutput: message,
        },
      });
    }
  }
}

/**
 * Wiki 제안 알림
 */
export async function notifyWikiSuggestion(
  suggestion: WikiSuggestion,
  userId: string
): Promise<void> {
  const config = loadTeamNotifyConfig();

  if (!config.enabled) return;

  const message = formatWikiSuggestionMessage(suggestion);

  await sendSlackMessage(config.slackBotToken, await getUserChannel(userId), message);
}
```

---

## 2. 구현 로드맵

### 2.1 Phase 1: Foundation (Weeks 1-2)

**목표**: 핵심 인프라 구축

```yaml
Week 1:
  - Database Schema Migration
    - pattern_instances
    - wiki_suggestions
    - onboarding_plans

  - Core Types & Interfaces
    - packages/shared/src/communication-types.ts
    - Type definitions for all components

  - Service Skeleton
    - Directory structure setup
    - Base classes implementation

Week 2:
  - API Routes
    - REST API endpoints
    - Basic CRUD operations

  - Database Layer
    - Drizzle ORM models
    - Query builders

  - Testing Setup
    - Unit test framework
    - Integration test scaffolding
```

### 2.2 Phase 2: Core Components (Weeks 3-5)

**목표**: 핵심 컴포넌트 구현

```yaml
Week 3:
  - Communication Pattern Engine
    - Pattern Registry
    - Pattern Engine Core
    - 2-3 Basic Patterns (requirement-clarification, design-review)

Week 4:
  - Role Adapter Layer
    - Base Adapter
    - PM Adapter
    - Developer Adapter
    - Translation Pipeline

Week 5:
  - Wiki Facilitation
    - Facilitator Service
    - Suggestion Engine
    - Gap Detector
    - Integration with existing WikiKnowledge
```

### 2.3 Phase 3: Advanced Features (Weeks 6-7)

**목표**: 고급 기능 구현

```yaml
Week 6:
  - Onboarding Coordination
    - Onboarding Service
    - Path Generator
    - Mentor Matcher
    - Contextual Help System

Week 7:
  - Integration & Polish
    - Slack integration
    - Jira integration
    - Dashboard widgets
    - Real-time notifications (WebSocket)
```

### 2.4 Phase 4: Testing & Deployment (Week 8)

**목표**: 안정화 및 배포

```yaml
Week 8:
  - Testing
    - Unit tests (target: 80% coverage)
    - Integration tests
    - E2E tests
    - Load testing

  - Documentation
    - API documentation
    - User guide
    - Admin guide

  - Deployment
    - Docker compose updates
    - Migration scripts
    - Monitoring setup
    - Feature flags configuration
```

---

## 3. 마이그레이션 전략

### 3.1 데이터베이스 마이그레이션

```sql
-- drizzle/0005_add_communication_coordinator.sql

-- 순차적 마이그레이션
-- 1. 신규 테이블 생성 (no dependencies)
CREATE TABLE pattern_instances (...);
CREATE TABLE pattern_events (...);

-- 2. context_links 확장
ALTER TABLE context_links
ADD COLUMN pattern_instances JSONB DEFAULT '[]',
ADD COLUMN wiki_suggestions JSONB DEFAULT '[]';

-- 3. 인덱스 생성
CREATE INDEX CONCURRENTLY idx_pattern_instances_status ON pattern_instances(status);

-- 4. 기본 데이터 삽입
INSERT INTO role_communication_preferences (role, notification_channels)
VALUES
  ('pm', '["slack", "jira"]'),
  ('developer', '["slack"]'),
  ('designer', '["slack"]');
```

### 3.2 Feature Flag 기반 롤아웃

```typescript
// packages/shared/src/constants.ts

export const FEATURE_FLAGS = {
  // 기존 플래그들...

  // Communication Coordinator 플래그
  COMMUNICATION_COORDINATOR_ENABLED: process.env.CC_ENABLED === 'true',
  PATTERN_ENGINE_ENABLED: process.env.CC_PATTERN_ENGINE_ENABLED === 'true',
  ROLE_ADAPTER_ENABLED: process.env.CC_ROLE_ADAPTER_ENABLED === 'true',
  WIKI_FACILITATION_ENABLED: process.env.CC_WIKI_FACILITATION_ENABLED === 'true',
  ONBOARDING_COORDINATION_ENABLED: process.env.CC_ONBOARDING_ENABLED === 'true',

  // 단계별 활성화
  CC_PHASE_1: process.env.CC_PHASE_1 === 'true', // Foundation
  CC_PHASE_2: process.env.CC_PHASE_2 === 'true', // Core Components
  CC_PHASE_3: process.env.CC_PHASE_3 === 'true', // Advanced Features
};

// 사용 예시
if (FEATURE_FLAGS.COMMUNICATION_COORDINATOR_ENABLED && FEATURE_FLAGS.PATTERN_ENGINE_ENABLED) {
  // 패턴 엔진 초기화
  await initializePatternEngine();
}
```

### 3.3 롤백 전략

```yaml
Rollback Strategy:
  Database:
    - Migration rollback scripts 준비
    - 데이터 백업 자동화
    - Down migration 테스트

  Application:
    - Blue-green deployment
    - Feature flag 즉시 비활성화
    - Circuit breaker 패턴

  Monitoring:
    - Error rate 알림 (threshold: 1%)
    - Latency 알림 (p95 > 2s)
    - 자동 롤백 트리거
```

---

## 4. 확장 가능성

### 4.1 새로운 패턴 추가

```typescript
// 새로운 패턴 추가 예시

// 1. 패턴 정의 생성
export const incidentResponsePattern: CommunicationPattern = {
  id: 'incident-response',
  name: '장애 대응',
  description: 'P1/P2 장애 발생 시 팀 간 조율',

  triggers: [
    {
      id: 'datadog-alert',
      type: 'event',
      source: 'datadog',
      condition: { priority: ['P1', 'P2'] },
      priority: 'urgent',
    },
  ],

  participants: [
    { role: 'ops', required: true, ... },
    { role: 'backend-developer', required: true, ... },
    { role: 'lead', required: false, ... },
  ],

  phases: [
    { name: 'detection', ... },
    { name: 'triage', ... },
    { name: 'mitigation', ... },
    { name: 'resolution', ... },
    { name: 'postmortem', ... },
  ],

  // ...
};

// 2. Registry에 등록
patternRegistry.register(incidentResponsePattern);

// 3. 자동으로 사용 가능
```

### 4.2 새로운 역할 추가

```typescript
// 새로운 역할 추가 예시

// 1. 타입 확장
export type ExtendedTeamRole =
  | ...existing roles
  | 'security-engineer'
  | 'data-analyst';

// 2. Domain Model 정의
const securityEngineerDomainModel: RoleDomainModel = {
  role: 'security-engineer',
  coreConcepts: [...],
  language: {...},
  informationNeeds: {...},
  transformationRules: [...],
};

// 3. Adapter 구현
export class SecurityEngineerAdapter extends BaseRoleAdapter {
  constructor() {
    super('security-engineer', securityEngineerDomainModel);
  }
  // ...
}

// 4. Registry에 등록
adapterRegistry.register(new SecurityEngineerAdapter());
```

### 4.3 외부 서비스 통합

```typescript
// 새로운 외부 서비스 통합 예시 (e.g., Notion, Linear)

interface ExternalServiceIntegration {
  name: string;
  triggers: TriggerConfig[];
  actions: ActionConfig[];
}

const notionIntegration: ExternalServiceIntegration = {
  name: 'notion',
  triggers: [
    {
      event: 'page.created',
      handler: async (event) => {
        // Notion 페이지 생성 시 패턴 트리거
        await patternEngine.detectAndStart({
          source: 'notion',
          // ...
        });
      },
    },
  ],
  actions: [
    {
      name: 'createPage',
      handler: async (content) => {
        // Notion 페이지 생성
        await notionClient.createPage(content);
      },
    },
  ],
};
```

---

## 5. 모니터링 및 메트릭

### 5.1 핵심 메트릭

```typescript
// Metrics to track

const METRICS = {
  // Pattern Engine
  patternInstancesCreated: 'cc_pattern_instances_created_total',
  patternCompletionRate: 'cc_pattern_completion_rate',
  patternAverageDuration: 'cc_pattern_duration_seconds',

  // Role Adapter
  translationsPerformed: 'cc_translations_total',
  translationQuality: 'cc_translation_quality_score',
  translationLatency: 'cc_translation_latency_seconds',

  // Wiki Facilitation
  wikiSuggestionsGenerated: 'cc_wiki_suggestions_total',
  wikiSuggestionAcceptanceRate: 'cc_wiki_suggestion_acceptance_rate',
  wikiSuggestionRelevance: 'cc_wiki_suggestion_relevance_score',

  // Onboarding
  onboardingStarted: 'cc_onboarding_started_total',
  onboardingCompletionRate: 'cc_onboarding_completion_rate',
  onboardingTimeToProductivity: 'cc_onboarding_time_to_productivity_days',

  // System
  apiLatency: 'cc_api_latency_seconds',
  apiErrors: 'cc_api_errors_total',
  dbQueryLatency: 'cc_db_query_latency_seconds',
};
```

### 5.2 알림 설정

```yaml
Alerting Rules:
  Critical:
    - pattern_completion_rate < 0.5 (for 1 hour)
    - translation_quality < 0.6 (for 30 minutes)
    - api_error_rate > 0.05 (for 5 minutes)

  Warning:
    - pattern_average_duration > 86400 seconds (24 hours)
    - wiki_suggestion_acceptance_rate < 0.3
    - onboarding_completion_rate < 0.7

  Info:
    - new_pattern_instance_created
    - translation_performed
    - wiki_suggestion_accepted
```

---

## 6. 결론

이 문서는 rtb-ai-hub를 **Communication Coordinator**로 확장하기 위한 완전한 아키텍처 설계를 제시했습니다.

### 핵심 성과

1. **4개의 핵심 컴포넌트** 설계 완료
   - Communication Pattern Engine
   - Role Adapter / Translation Layer
   - Active Wiki Facilitation
   - Onboarding Coordination

2. **통합 전략** 수립
   - 기존 시스템과의 연결점 정의
   - 점진적 마이그레이션 계획
   - Feature flag 기반 롤아웃

3. **8주 구현 로드맵** 수립
   - 단계별 목표와 산출물 정의
   - 리스크 완화 전략

### 다음 단계

1. **PoC 개발** (2주)
   - Requirement Clarification 패턴 구현
   - PM ↔ Developer 번역 검증

2. **파일럿 테스트** (2주)
   - 1개 팀에서 시범 운영
   - 피드백 수집 및 개선

3. **전체 롤아웃** (4주)
   - 단계적 확대
   - 모니터링 및 안정화

시작하시겠습니까?
