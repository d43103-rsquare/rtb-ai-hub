# Communication Pattern Engine Design

## 개요

Communication Pattern Engine은 팀원 간 커뮤니케이션의 **반복적 패턴**을 인식하고, AI가 이를 **능동적으로 촉진**하는 시스템입니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Communication Pattern Engine                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     PATTERN REGISTRY                                 │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │   │
│   │  │ Requirement  │  │   Design     │  │ Implementation│  │ Testing  │ │   │
│   │  │Clarification │  │   Review     │  │     Sync     │  │  Handoff │ │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│   │  │   Incident   │  │  Deployment  │  │  Code Review │               │   │
│   │  │  Response    │  │   Coordination│  │   Facilitation│              │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    PATTERN ENGINE CORE                               │   │
│   │                                                                      │   │
│   │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │   │
│   │  │   Trigger    │───▶│   Pattern    │───▶│ Facilitation │           │   │
│   │  │  Detection   │    │  Selection   │    │   Strategy   │           │   │
│   │  └──────────────┘    └──────────────┘    └──────────────┘           │   │
│   │         │                   │                   │                    │   │
│   │         ▼                   ▼                   ▼                    │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │              Participant Coordination                        │    │   │
│   │  │   - Role identification                                      │    │   │
│   │  │   - Information gathering                                    │    │   │
│   │  │   - Consensus building                                       │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    STATE MANAGEMENT                                  │   │
│   │   PatternInstance ──▶ Phase ──▶ ParticipantResponse ──▶ Resolution  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 타입 정의

### 1.1 Core Types

```typescript
// packages/shared/src/communication-types.ts

/**
 * Communication Pattern 식별자
 */
export type CommunicationPatternId =
  | 'requirement-clarification'
  | 'design-review'
  | 'implementation-sync'
  | 'testing-handoff'
  | 'incident-response'
  | 'deployment-coordination'
  | 'code-review-facilitation'
  | 'architecture-decision'
  | 'scope-negotiation';

/**
 * Pattern Phase - 패턴의 각 단계
 */
export enum PatternPhase {
  INITIATED = 'initiated', // 패턴 시작
  GATHERING = 'gathering', // 정보 수집
  DISCUSSION = 'discussion', // 토론/협의
  CONSENSUS = 'consensus', // 합의 도출
  RESOLVED = 'resolved', // 완료
  BLOCKED = 'blocked', // 중단/차단
}

/**
 * Pattern Trigger - 패턴 시작 조건
 */
export interface PatternTrigger {
  id: string;
  type: 'message' | 'status-change' | 'event' | 'schedule' | 'manual';
  source: string; // e.g., 'slack', 'jira', 'github'
  condition: TriggerCondition;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface TriggerCondition {
  type: 'keyword' | 'intent' | 'entity' | 'custom';
  value: string | string[] | RegExp;
  context?: Record<string, unknown>;
}

/**
 * Pattern Definition - 패턴 정의
 */
export interface CommunicationPattern {
  id: CommunicationPatternId;
  name: string;
  description: string;

  // 트리거 조건
  triggers: PatternTrigger[];

  // 참여 역할
  participants: ParticipantConfig[];

  // 단계별 설정
  phases: PhaseConfig[];

  // 정보 요구사항
  informationRequirements: InformationRequirement[];

  // 촉진 전략
  facilitationStrategy: FacilitationStrategy;

  // 완료 조건
  completionCriteria: CompletionCriterion[];

  // 에스컬레이션 설정
  escalationConfig?: EscalationConfig;
}

/**
 * Participant Configuration
 */
export interface ParticipantConfig {
  role: TeamRole;
  required: boolean;
  canInitiate: boolean;
  responseTimeoutMinutes: number;

  // 이 역할이 제공해야 할 정보
  informationResponsibilities: string[];

  // 알림 설정
  notificationChannels: ('slack' | 'email' | 'jira')[];

  // 자동화 허용 여부
  allowAutoResponse: boolean;
}

/**
 * Phase Configuration
 */
export interface PhaseConfig {
  name: PatternPhase;
  order: number;
  description: string;

  // 이 단계에서 필요한 역할
  requiredRoles: TeamRole[];

  // 단계 완료 조건
  exitCriteria: ExitCriterion[];

  // 타임아웃
  timeoutMinutes?: number;

  // 다음 단계로 자동 진행 여부
  autoAdvance: boolean;
}

/**
 * Information Requirement
 */
export interface InformationRequirement {
  id: string;
  name: string;
  description: string;
  requiredFrom: TeamRole[];

  // 정보 유형
  type: 'text' | 'decision' | 'estimate' | 'file' | 'link' | 'confirmation';

  // 검증 규칙
  validation?: ValidationRule;

  // wiki에서 관련 문서 찾기
  wikiKeywords?: string[];
}

/**
 * Facilitation Strategy
 */
export interface FacilitationStrategy {
  // AI 개입 수준
  aiInterventionLevel: 'passive' | 'suggestive' | 'active' | 'autonomous';

  // 정보 종합 방식
  synthesisMethod: 'sequential' | 'parallel' | 'hierarchical';

  // 합의 도출 방식
  consensusMethod: 'unanimous' | 'majority' | 'delegate' | 'authority';

  // 충돌 해결 전략
  conflictResolution?: ConflictResolutionStrategy;
}

/**
 * Pattern Instance - 실행 중인 패턴 인스턴스
 */
export interface PatternInstance {
  id: string;
  patternId: CommunicationPatternId;
  status: PatternPhase;

  // 컨텍스트
  context: {
    jiraKey?: string;
    githubPrNumber?: number;
    slackChannelId?: string;
    slackThreadTs?: string;
    initiatingMessage?: string;
    relatedContextLinkId?: string;
  };

  // 참여자
  participants: PatternParticipant[];

  // 현재 단계
  currentPhase: PatternPhase;
  phaseHistory: PhaseHistoryEntry[];

  // 수집된 정보
  gatheredInformation: Record<string, InformationResponse>;

  // 결과물
  outputs: PatternOutput[];

  // 메타데이터
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // 설정
  config: CommunicationPattern;
}

/**
 * Pattern Participant
 */
export interface PatternParticipant {
  role: TeamRole;
  userId?: string; // Slack user ID, email, etc.
  status: 'pending' | 'active' | 'responded' | 'blocked' | 'skipped';
  joinedAt: Date;
  lastActivityAt?: Date;

  // 이 참여자가 제공한 정보
  contributions: Contribution[];

  // 응답 시간
  responseTimeMinutes?: number;
}

/**
 * Information Response
 */
export interface InformationResponse {
  requirementId: string;
  providedBy: TeamRole;
  providedAt: Date;

  // 응답 내용
  content: {
    raw: string;
    structured?: Record<string, unknown>;
    translated?: Record<TeamRole, string>; // 다른 역할용 번역
  };

  // 출처
  source: {
    type: 'message' | 'document' | 'wiki' | 'system';
    reference: string;
  };

  // 검증 상태
  validationStatus: 'pending' | 'valid' | 'invalid' | 'needs-clarification';
}

/**
 * Pattern Output
 */
export interface PatternOutput {
  type: 'specification' | 'decision' | 'summary' | 'action-items' | 'documentation';
  format: 'markdown' | 'jira-comment' | 'slack-message' | 'github-pr-description';
  content: string;

  // 수신자별 버전
  roleSpecificVersions?: Record<TeamRole, string>;

  // 관련 리소스
  relatedResources: {
    jiraKeys?: string[];
    figmaUrls?: string[];
    githubPrs?: number[];
    wikiPages?: string[];
  };
}
```

---

## 2. Pattern Registry

```typescript
// packages/workflow-engine/src/communication/patterns/pattern-registry.ts

import type { CommunicationPattern } from '@rtb-ai-hub/shared';

export class PatternRegistry {
  private patterns: Map<string, CommunicationPattern> = new Map();
  private triggerIndex: Map<string, string[]> = new Map(); // trigger type -> pattern ids

  register(pattern: CommunicationPattern): void {
    this.patterns.set(pattern.id, pattern);

    // 인덱싱
    for (const trigger of pattern.triggers) {
      const existing = this.triggerIndex.get(trigger.type) || [];
      existing.push(pattern.id);
      this.triggerIndex.set(trigger.type, existing);
    }
  }

  get(id: string): CommunicationPattern | undefined {
    return this.patterns.get(id);
  }

  findByTrigger(triggerType: string): CommunicationPattern[] {
    const ids = this.triggerIndex.get(triggerType) || [];
    return ids.map((id) => this.patterns.get(id)).filter(Boolean) as CommunicationPattern[];
  }

  findByParticipantRole(role: TeamRole): CommunicationPattern[] {
    return Array.from(this.patterns.values()).filter((p) =>
      p.participants.some((part) => part.role === role)
    );
  }

  getAll(): CommunicationPattern[] {
    return Array.from(this.patterns.values());
  }
}

// 싱글톤 인스턴스
export const patternRegistry = new PatternRegistry();
```

---

## 3. Pattern Implementations

### 3.1 Requirement Clarification Pattern

```typescript
// packages/workflow-engine/src/communication/patterns/implementations/requirement-clarification.ts

import type { CommunicationPattern } from '@rtb-ai-hub/shared';

export const requirementClarificationPattern: CommunicationPattern = {
  id: 'requirement-clarification',
  name: '요구사항 명확화',
  description: 'PM의 초기 요구사항을 각 역할별로 세분화하고 기술적 명세로 변환',

  triggers: [
    {
      id: 'jira-created',
      type: 'event',
      source: 'jira',
      condition: {
        type: 'intent',
        value: ['feature-request', 'user-story', 'requirement'],
      },
      priority: 'high',
    },
    {
      id: 'slack-mention',
      type: 'message',
      source: 'slack',
      condition: {
        type: 'keyword',
        value: ['@dev-team', '구현', '개발', '만들어주세요'],
      },
      priority: 'medium',
    },
  ],

  participants: [
    {
      role: 'pm',
      required: true,
      canInitiate: true,
      responseTimeoutMinutes: 60,
      informationResponsibilities: [
        'business-requirements',
        'user-stories',
        'acceptance-criteria',
        'priority',
        'timeline',
      ],
      notificationChannels: ['slack', 'jira'],
      allowAutoResponse: false,
    },
    {
      role: 'system-planner',
      required: true,
      canInitiate: false,
      responseTimeoutMinutes: 120,
      informationResponsibilities: [
        'technical-architecture',
        'integration-points',
        'data-model',
        'api-contract',
      ],
      notificationChannels: ['slack'],
      allowAutoResponse: false,
    },
    {
      role: 'ux-planner',
      required: false,
      canInitiate: false,
      responseTimeoutMinutes: 120,
      informationResponsibilities: [
        'user-flow',
        'wireframe',
        'interaction-design',
        'accessibility',
      ],
      notificationChannels: ['slack'],
      allowAutoResponse: false,
    },
    {
      role: 'developer',
      required: true,
      canInitiate: false,
      responseTimeoutMinutes: 240,
      informationResponsibilities: [
        'implementation-approach',
        'effort-estimate',
        'technical-constraints',
        'dependencies',
      ],
      notificationChannels: ['slack', 'jira'],
      allowAutoResponse: true, // AI가 초기 추정 제공 가능
    },
  ],

  phases: [
    {
      name: PatternPhase.INITIATED,
      order: 1,
      description: 'PM이 초기 요구사항 제시',
      requiredRoles: ['pm'],
      exitCriteria: [{ type: 'information-provided', requirement: 'business-requirements' }],
      autoAdvance: true,
    },
    {
      name: PatternPhase.GATHERING,
      order: 2,
      description: '각 역할별 필요 정보 수집',
      requiredRoles: ['pm', 'system-planner', 'developer'],
      exitCriteria: [{ type: 'all-required-information', timeout: 'response-timeout' }],
      timeoutMinutes: 480, // 8 hours
      autoAdvance: false,
    },
    {
      name: PatternPhase.DISCUSSION,
      order: 3,
      description: '추가 질문 및 협의',
      requiredRoles: ['pm', 'developer'],
      exitCriteria: [
        { type: 'consensus', on: 'implementation-approach' },
        { type: 'no-questions-remaining' },
      ],
      timeoutMinutes: 1440, // 24 hours
      autoAdvance: false,
    },
    {
      name: PatternPhase.CONSENSUS,
      order: 4,
      description: '최종 명세 합의',
      requiredRoles: ['pm', 'developer'],
      exitCriteria: [{ type: 'confirmation', from: ['pm', 'developer'] }],
      autoAdvance: true,
    },
  ],

  informationRequirements: [
    {
      id: 'business-requirements',
      name: '비즈니스 요구사항',
      description: '기능의 비즈니스적 목적과 성공 기준',
      requiredFrom: ['pm'],
      type: 'text',
      wikiKeywords: ['business-rules', 'domain-logic'],
    },
    {
      id: 'user-stories',
      name: '사용자 스토리',
      description: '사용자 관점의 기능 설명',
      requiredFrom: ['pm', 'ux-planner'],
      type: 'text',
    },
    {
      id: 'technical-architecture',
      name: '기술 아키텍처',
      description: '시스템 구성 및 통합 방식',
      requiredFrom: ['system-planner'],
      type: 'text',
      wikiKeywords: ['architecture', 'system-design'],
    },
    {
      id: 'implementation-approach',
      name: '구현 방식',
      description: '구체적인 구현 계획',
      requiredFrom: ['developer'],
      type: 'text',
      wikiKeywords: ['implementation', 'coding-standards'],
    },
    {
      id: 'effort-estimate',
      name: '작업량 추정',
      description: '스토리 포인트 또는 예상 소요 시간',
      requiredFrom: ['developer'],
      type: 'estimate',
    },
  ],

  facilitationStrategy: {
    aiInterventionLevel: 'active',
    synthesisMethod: 'hierarchical',
    consensusMethod: 'authority', // PM이 최종 결정
    conflictResolution: {
      strategy: 'escalate-to-lead',
      timeoutMinutes: 1440,
    },
  },

  completionCriteria: [
    { type: 'all-required-information-gathered' },
    { type: 'consensus-reached', participants: ['pm', 'developer'] },
    { type: 'jira-ticket-updated', with: 'technical-specification' },
  ],

  escalationConfig: {
    enabled: true,
    triggers: [
      { condition: 'timeout', afterMinutes: 1440 },
      { condition: 'disagreement', on: ['priority', 'scope'] },
    ],
    escalateTo: 'lead',
    notificationChannels: ['slack', 'email'],
  },
};
```

### 3.2 Design Review Pattern

```typescript
// packages/workflow-engine/src/communication/patterns/implementations/design-review.ts

export const designReviewPattern: CommunicationPattern = {
  id: 'design-review',
  name: '디자인 리뷰',
  description: 'Figma 디자인을 개발팀과 검토하고 구현 가능성 및 수정사항 도출',

  triggers: [
    {
      id: 'figma-ready',
      type: 'event',
      source: 'figma',
      condition: {
        type: 'status',
        value: 'Ready for Dev',
      },
      priority: 'high',
    },
    {
      id: 'slack-design-share',
      type: 'message',
      source: 'slack',
      condition: {
        type: 'entity',
        value: { type: 'url', pattern: 'figma.com' },
      },
      priority: 'medium',
    },
  ],

  participants: [
    {
      role: 'designer',
      required: true,
      canInitiate: true,
      responseTimeoutMinutes: 240,
      informationResponsibilities: [
        'design-specification',
        'interaction-details',
        'responsive-behavior',
        'edge-cases',
      ],
      notificationChannels: ['slack'],
      allowAutoResponse: false,
    },
    {
      role: 'ui-developer',
      required: true,
      canInitiate: false,
      responseTimeoutMinutes: 480,
      informationResponsibilities: [
        'feasibility-assessment',
        'implementation-questions',
        'component-reuse-suggestions',
        'effort-estimate',
      ],
      notificationChannels: ['slack', 'jira'],
      allowAutoResponse: true,
    },
    {
      role: 'ux-planner',
      required: false,
      canInitiate: false,
      responseTimeoutMinutes: 480,
      informationResponsibilities: ['user-flow-validation', 'accessibility-concerns'],
      notificationChannels: ['slack'],
      allowAutoResponse: false,
    },
  ],

  phases: [
    {
      name: PatternPhase.INITIATED,
      order: 1,
      description: '디자인 공유',
      requiredRoles: ['designer'],
      exitCriteria: [{ type: 'design-linked' }],
      autoAdvance: true,
    },
    {
      name: PatternPhase.GATHERING,
      order: 2,
      description: '개발팀 검토 및 질문 수집',
      requiredRoles: ['ui-developer'],
      exitCriteria: [{ type: 'review-completed' }],
      timeoutMinutes: 1440,
      autoAdvance: false,
    },
    {
      name: PatternPhase.DISCUSSION,
      order: 3,
      description: '디자인 수정 협의',
      requiredRoles: ['designer', 'ui-developer'],
      exitCriteria: [{ type: 'all-questions-resolved' }, { type: 'design-approved' }],
      autoAdvance: false,
    },
    {
      name: PatternPhase.RESOLVED,
      order: 4,
      description: '최종 디자인 확정',
      requiredRoles: ['designer', 'ui-developer'],
      exitCriteria: [{ type: 'final-design-marked' }],
      autoAdvance: true,
    },
  ],

  informationRequirements: [
    {
      id: 'design-specification',
      name: '디자인 명세',
      description: 'Figma 프레임, 컴포넌트, 스타일 상세',
      requiredFrom: ['designer'],
      type: 'link',
    },
    {
      id: 'feasibility-assessment',
      name: '구현 가능성 평가',
      description: '기술적 구현 난이도 및 제약사항',
      requiredFrom: ['ui-developer'],
      type: 'decision',
      wikiKeywords: ['frontend', 'component-library'],
    },
    {
      id: 'implementation-questions',
      name: '구현 관련 질문',
      description: '디자인에 대한 개발팀의 질문사항',
      requiredFrom: ['ui-developer'],
      type: 'text',
    },
  ],

  facilitationStrategy: {
    aiInterventionLevel: 'suggestive',
    synthesisMethod: 'parallel',
    consensusMethod: 'unanimous', // 디자인은 합의가 중요
    conflictResolution: {
      strategy: 'schedule-meeting',
      timeoutMinutes: 2880,
    },
  },

  completionCriteria: [
    { type: 'design-approved-by-developer' },
    { type: 'all-questions-answered' },
    { type: 'jira-linked-to-figma' },
  ],
};
```

---

## 4. Pattern Engine Core

```typescript
// packages/workflow-engine/src/communication/patterns/pattern-engine.ts

import { createLogger } from '@rtb-ai-hub/shared';
import type {
  PatternInstance,
  CommunicationPattern,
  PatternTrigger,
  PatternPhase,
  PatternParticipant,
  InformationResponse,
  PatternOutput,
} from '@rtb-ai-hub/shared';
import { patternRegistry } from './pattern-registry';
import { database } from '../../clients/database';
import { dbSchema } from '@rtb-ai-hub/shared';

const logger = createLogger('pattern-engine');

export class PatternEngine {
  private activeInstances: Map<string, PatternInstance> = new Map();

  /**
   * 트리거 감지 및 패턴 시작
   */
  async detectAndStart(
    triggerType: string,
    context: {
      source: string;
      content: string;
      metadata: Record<string, unknown>;
      initiatorRole?: TeamRole;
      initiatorUserId?: string;
    }
  ): Promise<PatternInstance | null> {
    // 패턴 찾기
    const patterns = patternRegistry.findByTrigger(triggerType);

    for (const pattern of patterns) {
      // 트리거 조건 확인
      const matchedTrigger = this.matchTrigger(pattern.triggers, context);
      if (!matchedTrigger) continue;

      // 인스턴스 생성
      const instance = await this.createInstance(pattern, context, matchedTrigger);

      // 첫 단계 시작
      await this.advancePhase(instance);

      return instance;
    }

    return null;
  }

  /**
   * 패턴 인스턴스 생성
   */
  private async createInstance(
    pattern: CommunicationPattern,
    context: {
      source: string;
      content: string;
      metadata: Record<string, unknown>;
      initiatorRole?: TeamRole;
      initiatorUserId?: string;
    },
    trigger: PatternTrigger
  ): Promise<PatternInstance> {
    const instance: PatternInstance = {
      id: generateId('pattern'),
      patternId: pattern.id,
      status: PatternPhase.INITIATED,
      context: {
        initiatingMessage: context.content,
        ...this.extractContextFromMetadata(context.metadata),
      },
      participants: this.initializeParticipants(pattern, context),
      currentPhase: PatternPhase.INITIATED,
      phaseHistory: [],
      gatheredInformation: {},
      outputs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      config: pattern,
    };

    // DB에 저장
    await this.persistInstance(instance);
    this.activeInstances.set(instance.id, instance);

    logger.info(
      {
        instanceId: instance.id,
        patternId: pattern.id,
        trigger: trigger.id,
      },
      'Pattern instance created'
    );

    return instance;
  }

  /**
   * 다음 단계로 진행
   */
  private async advancePhase(instance: PatternInstance): Promise<void> {
    const currentPhaseConfig = instance.config.phases.find((p) => p.name === instance.currentPhase);

    if (!currentPhaseConfig) {
      logger.error({ instanceId: instance.id }, 'Phase config not found');
      return;
    }

    // 현재 단계 완료 처리
    instance.phaseHistory.push({
      phase: instance.currentPhase,
      startedAt:
        instance.phaseHistory.length === 0
          ? instance.createdAt
          : instance.phaseHistory[instance.phaseHistory.length - 1].completedAt!,
      completedAt: new Date(),
    });

    // 다음 단계 결정
    const nextPhase = this.determineNextPhase(instance);

    if (nextPhase) {
      instance.currentPhase = nextPhase;
      instance.updatedAt = new Date();

      // 다음 단계의 참여자에게 알림
      await this.notifyParticipantsForPhase(instance);

      // 정보 수집 필요한 경우 요청
      await this.requestInformationForPhase(instance);
    } else {
      // 완료
      instance.currentPhase = PatternPhase.RESOLVED;
      instance.status = PatternPhase.RESOLVED;
      instance.completedAt = new Date();

      // 결과물 생성
      await this.generateOutputs(instance);
    }

    await this.persistInstance(instance);
  }

  /**
   * 정보 수집
   */
  async gatherInformation(
    instanceId: string,
    role: TeamRole,
    responses: InformationResponse[]
  ): Promise<void> {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      logger.warn({ instanceId }, 'Instance not found for information gathering');
      return;
    }

    // 정보 저장
    for (const response of responses) {
      instance.gatheredInformation[response.requirementId] = response;
    }

    // 참여자 상태 업데이트
    const participant = instance.participants.find((p) => p.role === role);
    if (participant) {
      participant.status = 'responded';
      participant.lastActivityAt = new Date();
      participant.contributions.push({
        type: 'information',
        requirementIds: responses.map((r) => r.requirementId),
        providedAt: new Date(),
      });
    }

    // 완료 조건 확인
    const phaseComplete = this.checkPhaseCompletion(instance);
    if (
      phaseComplete &&
      instance.config.phases.find((p) => p.name === instance.currentPhase)?.autoAdvance
    ) {
      await this.advancePhase(instance);
    }

    await this.persistInstance(instance);
  }

  /**
   * 결과물 생성
   */
  private async generateOutputs(instance: PatternInstance): Promise<void> {
    const strategy = instance.config.facilitationStrategy;

    // AI를 사용하여 종합
    if (strategy.synthesisMethod === 'hierarchical') {
      const output = await this.synthesizeHierarchically(instance);
      instance.outputs.push(output);
    } else {
      const output = await this.synthesizeParallel(instance);
      instance.outputs.push(output);
    }

    // 역할별 버전 생성
    for (const participant of instance.participants) {
      const roleSpecificVersion = await this.translateForRole(
        instance.outputs[0],
        participant.role,
        instance
      );
      instance.outputs[0].roleSpecificVersions = {
        ...instance.outputs[0].roleSpecificVersions,
        [participant.role]: roleSpecificVersion,
      };
    }

    // 알림 발송
    await this.deliverOutputs(instance);
  }

  /**
   * 계층적 종합 (Hierarchical Synthesis)
   */
  private async synthesizeHierarchically(instance: PatternInstance): Promise<PatternOutput> {
    // 1. 비즈니스 요구사항 종합 (PM)
    // 2. 기술 아키텍처 종합 (System Planner)
    // 3. 구현 방식 종합 (Developer)
    // 순차적으로 AI가 종합

    const synthesis = {
      business: instance.gatheredInformation['business-requirements'],
      architecture: instance.gatheredInformation['technical-architecture'],
      implementation: instance.gatheredInformation['implementation-approach'],
    };

    // AI 종합 로직...
    const content = await this.aiSynthesize(synthesis);

    return {
      type: 'specification',
      format: 'markdown',
      content,
      relatedResources: {
        jiraKeys: instance.context.jiraKey ? [instance.context.jiraKey] : undefined,
      },
    };
  }

  /**
   * DB에 인스턴스 저장
   */
  private async persistInstance(instance: PatternInstance): Promise<void> {
    await database.drizzle
      .insert(dbSchema.patternInstances)
      .values({
        id: instance.id,
        patternId: instance.patternId,
        status: instance.status,
        context: instance.context as unknown as Record<string, unknown>,
        participants: instance.participants as unknown as Record<string, unknown>[],
        currentPhase: instance.currentPhase,
        phaseHistory: instance.phaseHistory as unknown as Record<string, unknown>[],
        gatheredInformation: instance.gatheredInformation as unknown as Record<string, unknown>,
        outputs: instance.outputs as unknown as Record<string, unknown>[],
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
        completedAt: instance.completedAt,
      })
      .onConflictDoUpdate({
        target: dbSchema.patternInstances.id,
        set: {
          status: instance.status,
          currentPhase: instance.currentPhase,
          phaseHistory: instance.phaseHistory as unknown as Record<string, unknown>[],
          gatheredInformation: instance.gatheredInformation as unknown as Record<string, unknown>,
          outputs: instance.outputs as unknown as Record<string, unknown>[],
          updatedAt: instance.updatedAt,
          completedAt: instance.completedAt,
        },
      });
  }

  // Helper methods...
  private matchTrigger(triggers: PatternTrigger[], context: any): PatternTrigger | null {
    // 트리거 매칭 로직
    return (
      triggers.find((t) => {
        if (t.condition.type === 'keyword') {
          const keywords = Array.isArray(t.condition.value)
            ? t.condition.value
            : [t.condition.value];
          return keywords.some((kw) => context.content.toLowerCase().includes(kw.toLowerCase()));
        }
        // ... 다른 조건 타입
        return false;
      }) || null
    );
  }

  private initializeParticipants(
    pattern: CommunicationPattern,
    context: any
  ): PatternParticipant[] {
    return pattern.participants.map((p) => ({
      role: p.role,
      userId: context.initiatorRole === p.role ? context.initiatorUserId : undefined,
      status: 'pending',
      joinedAt: new Date(),
      contributions: [],
    }));
  }

  private extractContextFromMetadata(
    metadata: Record<string, unknown>
  ): Partial<PatternInstance['context']> {
    return {
      jiraKey: metadata.jiraKey as string,
      githubPrNumber: metadata.githubPrNumber as number,
      slackChannelId: metadata.slackChannelId as string,
      slackThreadTs: metadata.slackThreadTs as string,
    };
  }

  private determineNextPhase(instance: PatternInstance): PatternPhase | null {
    const currentOrder = instance.config.phases.find(
      (p) => p.name === instance.currentPhase
    )?.order;
    if (!currentOrder) return null;

    const nextPhase = instance.config.phases.find((p) => p.order === currentOrder + 1);
    return nextPhase?.name || null;
  }

  private async notifyParticipantsForPhase(instance: PatternInstance): Promise<void> {
    const phaseConfig = instance.config.phases.find((p) => p.name === instance.currentPhase);
    if (!phaseConfig) return;

    for (const role of phaseConfig.requiredRoles) {
      const participant = instance.participants.find((p) => p.role === role);
      const participantConfig = instance.config.participants.find((p) => p.role === role);

      if (participant && participantConfig) {
        // 알림 발송 로직...
        await this.sendNotification(instance, participant, participantConfig);
      }
    }
  }

  private async requestInformationForPhase(instance: PatternInstance): Promise<void> {
    const phaseConfig = instance.config.phases.find((p) => p.name === instance.currentPhase);
    if (!phaseConfig) return;

    // 현재 단계에서 필요한 정보 요청
    const requiredInfo = instance.config.informationRequirements.filter(
      (req) => !instance.gatheredInformation[req.id]
    );

    for (const info of requiredInfo) {
      const targetRoles = info.requiredFrom.filter((role) =>
        phaseConfig.requiredRoles.includes(role)
      );

      for (const role of targetRoles) {
        // 정보 요청 알림 발송
        await this.requestInformation(instance, role, info);
      }
    }
  }

  private checkPhaseCompletion(instance: PatternInstance): boolean {
    const phaseConfig = instance.config.phases.find((p) => p.name === instance.currentPhase);
    if (!phaseConfig) return false;

    for (const criterion of phaseConfig.exitCriteria) {
      if (!this.evaluateExitCriterion(instance, criterion)) {
        return false;
      }
    }

    return true;
  }

  private evaluateExitCriterion(instance: PatternInstance, criterion: any): boolean {
    // 종료 조건 평가 로직
    switch (criterion.type) {
      case 'information-provided':
        return !!instance.gatheredInformation[criterion.requirement];
      case 'all-required-information':
        return instance.config.informationRequirements
          .filter((req) =>
            req.requiredFrom.some((r) => instance.participants.some((p) => p.role === r))
          )
          .every((req) => !!instance.gatheredInformation[req.id]);
      case 'consensus':
        // 합의 여부 확인
        return true; // Simplified
      default:
        return false;
    }
  }

  // Placeholder methods for implementation
  private async sendNotification(
    instance: PatternInstance,
    participant: PatternParticipant,
    config: any
  ): Promise<void> {}
  private async requestInformation(
    instance: PatternInstance,
    role: TeamRole,
    info: any
  ): Promise<void> {}
  private async aiSynthesize(data: any): Promise<string> {
    return '';
  }
  private async synthesizeParallel(instance: PatternInstance): Promise<PatternOutput> {
    return { type: 'summary', format: 'markdown', content: '', relatedResources: {} };
  }
  private async translateForRole(
    output: PatternOutput,
    role: TeamRole,
    instance: PatternInstance
  ): Promise<string> {
    return output.content;
  }
  private async deliverOutputs(instance: PatternInstance): Promise<void> {}
}

// 싱글톤
export const patternEngine = new PatternEngine();
```

---

## 5. 데이터베이스 스키마

```sql
-- drizzle/0005_add_communication_tables.sql

-- 패턴 인스턴스 테이블
CREATE TABLE pattern_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated',

  -- 컨텍스트
  context JSONB DEFAULT '{}',

  -- 참여자
  participants JSONB DEFAULT '[]',

  -- 단계
  current_phase VARCHAR(50) NOT NULL,
  phase_history JSONB DEFAULT '[]',

  -- 수집된 정보
  gathered_information JSONB DEFAULT '{}',

  -- 결과물
  outputs JSONB DEFAULT '[]',

  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- 외래키
  context_link_id UUID REFERENCES context_links(id)
);

-- 인덱스
CREATE INDEX idx_pattern_instances_status ON pattern_instances(status);
CREATE INDEX idx_pattern_instances_pattern_id ON pattern_instances(pattern_id);
CREATE INDEX idx_pattern_instances_context_link ON pattern_instances(context_link_id);
CREATE INDEX idx_pattern_instances_created_at ON pattern_instances(created_at);

-- 패턴 이력/로그 테이블 (감사용)
CREATE TABLE pattern_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES pattern_instances(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  triggered_by VARCHAR(100), -- 역할 또는 시스템
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pattern_events_instance ON pattern_events(instance_id);
CREATE INDEX idx_pattern_events_type ON pattern_events(event_type);
CREATE INDEX idx_pattern_events_created ON pattern_events(created_at);

-- 역할별 커뮤니케이션 설정
CREATE TABLE role_communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL UNIQUE,

  -- 알림 설정
  notification_channels JSONB DEFAULT '["slack"]',
  notification_frequency VARCHAR(50) DEFAULT 'immediate', -- immediate, digest, quiet-hours

  -- 응답 시간 설정
  default_response_timeout_minutes INTEGER DEFAULT 480,

  -- 자동화 설정
  allow_auto_response BOOLEAN DEFAULT false,
  auto_response_triggers JSONB DEFAULT '[]',

  -- 선호하는 커뮤니케이션 시간
  preferred_hours_start TIME,
  preferred_hours_end TIME,
  timezone VARCHAR(100) DEFAULT 'Asia/Seoul',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자별 역할 매핑
CREATE TABLE user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL, -- email 또는 slack id
  role VARCHAR(50) NOT NULL,

  -- 컨텍스트 (특정 프로젝트/팀에만 적용)
  project_key VARCHAR(50),
  team_id VARCHAR(100),

  -- 우선순위 (같은 사용자가 여러 역할을 가질 때)
  priority INTEGER DEFAULT 1,

  -- 활성화 여부
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, role, project_key, team_id)
);

CREATE INDEX idx_user_roles_user ON user_role_assignments(user_id);
CREATE INDEX idx_user_roles_role ON user_role_assignments(role);
```

---

## 다음 단계

1. Role Adapter / Translation Layer 설계
2. Active Wiki Facilitation 설계
3. Onboarding Coordination 설계
4. 통합 및 API 설계

계속 진행하시겠습니까?
