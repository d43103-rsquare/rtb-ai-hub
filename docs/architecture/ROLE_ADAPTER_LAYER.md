# Role Adapter / Translation Layer Design

## 개요

Role Adapter / Translation Layer는 **서로 다른 역할 간의 언어와 개념 차이를 해소**하는 핵심 컴포넌트입니다. PM의 비즈니스 언어를 개발자의 기술 언어로, 개발자의 기술 제약을 PM이 이해할 수 있는 비즈니스 영향으로 번역합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Role Adapter / Translation Layer                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Input (PM Language)                                                        │
│   "로그인 기능 만들어주세요"                                                  │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    TRANSLATION PIPELINE                              │   │
│   │                                                                      │   │
│   │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────┐ │   │
│   │  │   Parse     │──▶│  Enrich     │──▶│  Transform  │──▶│ Generate│ │   │
│   │  │   Intent    │   │  Context    │   │  Concepts   │   │ Output  │ │   │
│   │  └─────────────┘   └─────────────┘   └─────────────┘   └─────────┘ │   │
│   │         │                │                │                │        │   │
│   │         ▼                ▼                ▼                ▼        │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │              Role-Specific Domain Models                     │   │   │
│   │  │                                                              │   │   │
│   │  │   PM Model:          business-goal, user-action, outcome     │   │   │
│   │  │   UX Model:          user-flow, interaction, wireframe       │   │   │
│   │  │   Dev Model:         api-endpoint, data-model, auth-flow     │   │   │
│   │  │   QA Model:          test-case, acceptance-criteria, edge    │   │   │
│   │  │                                                              │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│   Output (Developer Language)                                                │
│   "JWT 기반 인증 API 구현 필요: POST /auth/login, OAuth2 연동,              │
│    세션 관리, 보안 고려사항..."                                               │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    REVERSE TRANSLATION                               │   │
│   │                                                                      │   │
│   Input (Dev Language)                                                   │   │
│   "DB 스키마 변경 필요: users 테이블에 oauth_provider 컬럼 추가"           │   │
│         │                                                                │   │
│         ▼                                                                │   │
│   Output (PM Language)                                                   │   │
│   "소셜 로그인 기능을 위해 사용자 데이터 구조를 확장해야 합니다.           │   │
│    기존 사용자에게는 영향 없으며, 신규 가입자만 해당됩니다."              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 타입 정의

### 1.1 Core Types

```typescript
// packages/shared/src/communication-types.ts (append)

/**
 * TeamRole 확장 - 7개 세분화된 역할
 */
export type ExtendedTeamRole =
  | 'pm' // Product Manager
  | 'system-planner' // System Architect/Planner
  | 'ux-planner' // UX Designer/Planner
  | 'ui-developer' // Frontend/UI Developer
  | 'backend-developer' // Backend Developer
  | 'qa' // Quality Assurance
  | 'ops' // DevOps/Operations
  | 'lead'; // Team Lead (기존)

/**
 * Domain Concept - 역할별 개념
 */
export interface DomainConcept {
  id: string;
  name: string; // 개념명
  role: ExtendedTeamRole; // 속한 역할
  category: ConceptCategory; // 개념 카테고리
  definition: string; // 정의
  relatedConcepts: string[]; // 관련 개념 IDs
  wikiReferences: string[]; // 관련 wiki 문서
  examples: string[]; // 예시
  aliases: string[]; // 동의어/별칭
}

export type ConceptCategory =
  | 'business' // 비즈니스/도메인
  | 'user-experience' // 사용자 경험
  | 'technical' // 기술/구현
  | 'process' // 프로세스/워크플로우
  | 'quality' // 품질/테스트
  | 'infrastructure'; // 인프라/운영

/**
 * Translation Request
 */
export interface TranslationRequest {
  id: string;
  sourceRole: ExtendedTeamRole;
  targetRole: ExtendedTeamRole;

  // 입력
  input: {
    raw: string;
    format: 'text' | 'structured' | 'mixed';
    structured?: Record<string, unknown>;
    source?: 'slack' | 'jira' | 'github' | 'figma' | 'manual';
  };

  // 컨텍스트
  context: {
    jiraKey?: string;
    projectContext?: string;
    conversationHistory?: string[];
    relatedDocuments?: string[];
  };

  // 옵션
  options: {
    detailLevel: 'high' | 'medium' | 'low';
    includeAlternatives: boolean;
    includeJustification: boolean;
    preserveIntent: boolean;
  };
}

/**
 * Translation Result
 */
export interface TranslationResult {
  requestId: string;

  // 번역 결과
  output: {
    raw: string;
    format: 'text' | 'structured' | 'mixed';
    structured?: Record<string, unknown>;
  };

  // 원문 분석
  sourceAnalysis: {
    intent: string;
    extractedConcepts: ExtractedConcept[];
    confidence: number;
  };

  // 변환 과정
  transformation: {
    mappedConcepts: MappedConcept[];
    addedContext: string[];
    removedAmbiguity: string[];
  };

  // 품질 메트릭
  quality: {
    accuracy: number; // 정확도 (0-1)
    completeness: number; // 완전성 (0-1)
    clarity: number; // 명확성 (0-1)
    confidence: number; // 전반적 신뢰도 (0-1)
  };

  // 검증 정보
  validation: {
    checked: boolean;
    issues: ValidationIssue[];
    suggestions: string[];
  };

  // 메타데이터
  metadata: {
    processingTimeMs: number;
    modelUsed: string;
    tokensUsed: { input: number; output: number };
  };
}

/**
 * Extracted Concept - 원문에서 추출된 개념
 */
export interface ExtractedConcept {
  conceptId: string;
  text: string; // 원문에서의 텍스트
  position: { start: number; end: number };
  confidence: number;
  role: ExtendedTeamRole;
  category: ConceptCategory;
}

/**
 * Mapped Concept - 번역된 개념
 */
export interface MappedConcept {
  sourceConceptId: string;
  targetConceptId: string;
  sourceRole: ExtendedTeamRole;
  targetRole: ExtendedTeamRole;
  mappingType: 'direct' | 'expanded' | 'simplified' | 'interpreted';
  explanation: string;
}

/**
 * Validation Issue
 */
export interface ValidationIssue {
  type: 'ambiguity' | 'missing-context' | 'technical-inaccuracy' | 'business-mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  suggestion?: string;
}

/**
 * Role Domain Model - 역할별 도메인 모델 정의
 */
export interface RoleDomainModel {
  role: ExtendedTeamRole;

  // 핵심 개념
  coreConcepts: DomainConcept[];

  // 언어 특성
  language: {
    preferredVocabulary: string[]; // 선호 어휘
    typicalPatterns: string[]; // 일반적 표현 패턴
    ambiguityIndicators: string[]; // 모호성 지표
    precisionRequirements: string[]; // 정확성 필요 영역
  };

  // 정보 요구사항
  informationNeeds: {
    alwaysRequired: string[]; // 항상 필요한 정보
    contextDependent: string[]; // 상황에 따른 정보
    niceToHave: string[]; // 있으면 좋은 정보
  };

  // 변환 규칙
  transformationRules: TransformationRule[];
}

/**
 * Transformation Rule - 변환 규칙
 */
export interface TransformationRule {
  id: string;
  name: string;

  // 적용 조건
  condition: {
    sourceRole?: ExtendedTeamRole;
    targetRole?: ExtendedTeamRole;
    conceptCategory?: ConceptCategory;
    pattern?: RegExp;
    keywords?: string[];
  };

  // 변환 동작
  action: {
    type: 'expand' | 'simplify' | 'rephrase' | 'add-context' | 'request-clarification';
    template?: string;
    enrichWithWiki?: boolean;
    addExamples?: boolean;
  };

  // 우선순위
  priority: number;

  // 활성화 여부
  enabled: boolean;
}

/**
 * Adapter Configuration
 */
export interface AdapterConfig {
  sourceRole: ExtendedTeamRole;
  targetRole: ExtendedTeamRole;

  // 동작 설정
  behavior: {
    autoTranslate: boolean;
    suggestBeforeTranslate: boolean;
    requireConfirmation: boolean;
    showOriginal: boolean;
  };

  // 품질 기준
  quality: {
    minConfidence: number;
    minAccuracy: number;
    flagForReview: boolean;
  };

  // 컨텍스트
  context: {
    includeWikiReferences: boolean;
    includeConversationHistory: boolean;
    includeRelatedDocuments: boolean;
    maxContextLength: number;
  };
}
```

---

## 2. Domain Models by Role

### 2.1 PM (Product Manager) Domain Model

```typescript
const pmDomainModel: RoleDomainModel = {
  role: 'pm',

  coreConcepts: [
    {
      id: 'pm-user-story',
      name: '사용자 스토리',
      role: 'pm',
      category: 'business',
      definition: '사용자 관점의 기능 요구사항',
      relatedConcepts: ['pm-acceptance-criteria', 'pm-business-value'],
      wikiReferences: ['agile/user-stories', 'requirements/gathering'],
      examples: ['사용자로서, 나는 로그인할 수 있어야 한다'],
      aliases: ['user story', '스토리', '요구사항'],
    },
    {
      id: 'pm-business-value',
      name: '비즈니스 가치',
      role: 'pm',
      category: 'business',
      definition: '기능이 제공하는 비즈니스적 이점',
      relatedConcepts: ['pm-roi', 'pm-kpi'],
      wikiReferences: ['business/value-proposition'],
      examples: ['로그인 기능은 사용자 참여도를 20% 높인다'],
      aliases: ['가치', 'benefit', 'value proposition'],
    },
    {
      id: 'pm-priority',
      name: '우선순위',
      role: 'pm',
      category: 'process',
      definition: '작업의 중요도와 긴급도',
      relatedConcepts: ['pm-timeline', 'pm-dependencies'],
      wikiReferences: ['process/prioritization'],
      examples: ['P0: 핵심 기능', 'P1: 중요 기능', 'P2: 향후 기능'],
      aliases: ['priority', '중요도', '긴급도'],
    },
    {
      id: 'pm-mvp',
      name: 'MVP',
      role: 'pm',
      category: 'process',
      definition: '최소 기능 제품',
      relatedConcepts: ['pm-scope', 'pm-iteration'],
      wikiReferences: ['product/mvp'],
      examples: ['로그인 MVP: 이메일/비밀번호만 지원'],
      aliases: ['Minimum Viable Product', '핵심 기능', '1차 범위'],
    },
    {
      id: 'pm-scope',
      name: '범위',
      role: 'pm',
      category: 'process',
      definition: '프로젝트 또는 기능의 경계',
      relatedConcepts: ['pm-mvp', 'pm-timeline'],
      wikiReferences: ['project/scope-management'],
      examples: ['IN SCOPE: 이메일 로그인', 'OUT OF SCOPE: 소셜 로그인'],
      aliases: ['scope', '기능 범위', '포함사항'],
    },
  ],

  language: {
    preferredVocabulary: [
      '사용자',
      '비즈니스',
      '가치',
      '우선순위',
      '범위',
      '타임라인',
      'ROI',
      'KPI',
      '전환율',
      '참여도',
      ' retention',
    ],
    typicalPatterns: [
      '사용자가 {action}할 수 있어야 한다',
      '{feature}를 통해 {benefit}를 달성하고 싶다',
      '{date}까지 {deliverable}가 필요하다',
      '이 기능의 우선순위는 {priority}이다',
    ],
    ambiguityIndicators: [
      '좋은',
      '빠른',
      '편리한',
      '쉬운',
      '직관적인',
      '적절히',
      '충분히',
      '필요한',
      '적당한',
    ],
    precisionRequirements: ['날짜', '숫자', '퍼센트', '우선순위', 'acceptance criteria'],
  },

  informationNeeds: {
    alwaysRequired: ['business-goal', 'user-persona', 'success-criteria'],
    contextDependent: ['timeline', 'budget', 'competitor-analysis'],
    niceToHave: ['market-research', 'user-feedback'],
  },

  transformationRules: [
    {
      id: 'pm-expand-vague-terms',
      name: '모호한 용어 확장',
      condition: {
        sourceRole: 'pm',
        keywords: ['좋은', '빠른', '편리한', '쉬운'],
      },
      action: {
        type: 'request-clarification',
        template: '"{term}"의 구체적인 기준이나 측정 방법을 알려주세요.',
      },
      priority: 100,
      enabled: true,
    },
    {
      id: 'pm-add-business-context',
      name: '비즈니스 컨텍스트 추가',
      condition: {
        sourceRole: 'pm',
        targetRole: 'developer',
        conceptCategory: 'business',
      },
      action: {
        type: 'add-context',
        enrichWithWiki: true,
        template: '비즈니스 목표: {goal}\n사용자 가치: {value}\n성공 기준: {criteria}',
      },
      priority: 80,
      enabled: true,
    },
  ],
};
```

### 2.2 Developer Domain Model

```typescript
const developerDomainModel: RoleDomainModel = {
  role: 'backend-developer', // or 'ui-developer'

  coreConcepts: [
    {
      id: 'dev-api-endpoint',
      name: 'API 엔드포인트',
      role: 'backend-developer',
      category: 'technical',
      definition: '클라이언트가 서버와 통신하는 URL',
      relatedConcepts: ['dev-http-method', 'dev-request-body', 'dev-response'],
      wikiReferences: ['api/rest-design', 'api/authentication'],
      examples: ['POST /api/v1/auth/login', 'GET /api/v1/users/me'],
      aliases: ['endpoint', 'API', 'URL', 'route'],
    },
    {
      id: 'dev-auth-flow',
      name: '인증 흐름',
      role: 'backend-developer',
      category: 'technical',
      definition: '사용자 신원을 확인하는 프로세스',
      relatedConcepts: ['dev-jwt', 'dev-oauth', 'dev-session'],
      wikiReferences: ['security/auth-flows', 'security/jwt'],
      examples: ['JWT: Access Token + Refresh Token', 'OAuth2: Authorization Code Flow'],
      aliases: ['authentication', 'auth', '인증', '로그인 프로세스'],
    },
    {
      id: 'dev-data-model',
      name: '데이터 모델',
      role: 'backend-developer',
      category: 'technical',
      definition: '데이터 구조와 관계',
      relatedConcepts: ['dev-schema', 'dev-entity', 'dev-relationship'],
      wikiReferences: ['database/schema-design', 'orm/models'],
      examples: ['User: { id, email, password_hash, created_at }'],
      aliases: ['model', 'schema', '엔티티', '테이블 구조'],
    },
    {
      id: 'dev-dependency',
      name: '의존성',
      role: 'backend-developer',
      category: 'technical',
      definition: '다른 시스템/모듈에 대한 의존 관계',
      relatedConcepts: ['dev-api-contract', 'dev-integration'],
      wikiReferences: ['architecture/dependencies', 'api/contracts'],
      examples: ['로그인 기능 → 인증 서버', '결제 기능 → PG사 API'],
      aliases: ['dependency', '의존', '선행조건', 'prerequisite'],
    },
    {
      id: 'dev-tech-debt',
      name: '기술 부채',
      role: 'backend-developer',
      category: 'process',
      definition: '빠른 개발을 위해 나중에 해결하기로 한 기술적 타협',
      relatedConcepts: ['dev-refactoring', 'dev-code-quality'],
      wikiReferences: ['process/tech-debt'],
      examples: ['임시로 하드코딩된 값', '테스트 커버리지 부족'],
      aliases: ['tech debt', '기술적 부채', '리팩토링 필요'],
    },
  ],

  language: {
    preferredVocabulary: [
      'API',
      '엔드포인트',
      '인증',
      '권한',
      '스키마',
      '마이그레이션',
      '의존성',
      '비동기',
      '트랜잭션',
      '캐싱',
      '로깅',
    ],
    typicalPatterns: [
      '{method} {endpoint} 구현 필요',
      '{table} 테이블에 {column} 컬럼 추가',
      '{service}와의 통합 필요',
      '의존성: {dependency} 선행 필요',
    ],
    ambiguityIndicators: ['적절히', '충분히', '나중에', '간단히', '대략'],
    precisionRequirements: ['API 스펙', '데이터 타입', '제약조건', '에러 코드', '성능 지표'],
  },

  informationNeeds: {
    alwaysRequired: ['api-spec', 'data-model', 'auth-requirements', 'dependencies'],
    contextDependent: ['performance-requirements', 'security-requirements', 'integration-points'],
    niceToHave: ['load-test-results', 'monitoring-dashboard'],
  },

  transformationRules: [
    {
      id: 'dev-simplify-tech-jargon',
      name: '기술 용어 단순화',
      condition: {
        sourceRole: 'backend-developer',
        targetRole: 'pm',
        conceptCategory: 'technical',
      },
      action: {
        type: 'simplify',
        template: '{business-impact}를 위한 {technical-action}',
        addExamples: true,
      },
      priority: 90,
      enabled: true,
    },
    {
      id: 'dev-expand-api-spec',
      name: 'API 명세 확장',
      condition: {
        sourceRole: 'pm',
        targetRole: 'backend-developer',
        keywords: ['API', '엔드포인트', '인터페이스'],
      },
      action: {
        type: 'expand',
        template: `
          API: {endpoint}
          Method: {method}
          Auth: {auth-type}
          Request: {request-schema}
          Response: {response-schema}
          Errors: {error-cases}
        `,
      },
      priority: 95,
      enabled: true,
    },
  ],
};
```

---

## 3. Role Adapter Implementation

### 3.1 Base Adapter

```typescript
// packages/workflow-engine/src/communication/adapters/base-adapter.ts

import type {
  ExtendedTeamRole,
  RoleDomainModel,
  TranslationRequest,
  TranslationResult,
  DomainConcept,
  ExtractedConcept,
  ValidationIssue,
} from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { AnthropicClient } from '../../clients/anthropic';

const logger = createLogger('role-adapter');

export abstract class BaseRoleAdapter {
  protected logger = logger;
  protected aiClient: AnthropicClient;

  constructor(
    public readonly role: ExtendedTeamRole,
    public readonly domainModel: RoleDomainModel,
    aiClient?: AnthropicClient
  ) {
    this.aiClient = aiClient || new AnthropicClient();
  }

  /**
   * 번역 실행
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const startTime = Date.now();

    this.logger.info(
      {
        requestId: request.id,
        from: request.sourceRole,
        to: request.targetRole,
      },
      'Starting translation'
    );

    try {
      // 1. 의도 파싱 및 개념 추출
      const sourceAnalysis = await this.parseIntent(request);

      // 2. 컨텍스트 보강
      const enrichedContext = await this.enrichContext(request, sourceAnalysis);

      // 3. 개념 변환
      const transformation = await this.transformConcepts(request, sourceAnalysis, enrichedContext);

      // 4. 결과 생성
      const output = await this.generateOutput(request, transformation);

      // 5. 품질 검증
      const quality = await this.evaluateQuality(request, output, transformation);

      // 6. 검증
      const validation = await this.validateTranslation(request, output);

      const result: TranslationResult = {
        requestId: request.id,
        output,
        sourceAnalysis,
        transformation,
        quality,
        validation,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          modelUsed: 'claude-sonnet',
          tokensUsed: { input: 0, output: 0 }, // TODO: Track actual tokens
        },
      };

      this.logger.info(
        {
          requestId: request.id,
          quality: quality.confidence,
          processingTimeMs: result.metadata.processingTimeMs,
        },
        'Translation completed'
      );

      return result;
    } catch (error) {
      this.logger.error(
        {
          requestId: request.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Translation failed'
      );
      throw error;
    }
  }

  /**
   * 의도 파싱 및 개념 추출
   */
  protected async parseIntent(
    request: TranslationRequest
  ): Promise<TranslationResult['sourceAnalysis']> {
    const prompt = this.buildParsePrompt(request);

    const response = await this.aiClient.generateText(prompt, {
      tier: 'haiku',
      maxTokens: 1000,
      temperature: 0.1,
    });

    const parsed = this.extractJson(response.text);

    return {
      intent: parsed?.intent || 'unknown',
      extractedConcepts: parsed?.concepts || [],
      confidence: parsed?.confidence || 0.5,
    };
  }

  /**
   * 컨텍스트 보강
   */
  protected async enrichContext(
    request: TranslationRequest,
    analysis: TranslationResult['sourceAnalysis']
  ): Promise<string[]> {
    const enriched: string[] = [];

    // Wiki 참조 추가
    if (request.options.detailLevel !== 'low') {
      const wikiRefs = await this.findWikiReferences(analysis.extractedConcepts);
      enriched.push(...wikiRefs);
    }

    // 관련 문서 추가
    if (request.context.relatedDocuments) {
      enriched.push(...request.context.relatedDocuments);
    }

    // 대화 히스토리 추가
    if (request.context.conversationHistory && request.options.detailLevel === 'high') {
      enriched.push(...request.context.conversationHistory.slice(-3));
    }

    return enriched;
  }

  /**
   * 개념 변환
   */
  protected async transformConcepts(
    request: TranslationRequest,
    analysis: TranslationResult['sourceAnalysis'],
    enrichedContext: string[]
  ): Promise<TranslationResult['transformation']> {
    const mappedConcepts: MappedConcept[] = [];
    const addedContext: string[] = [];
    const removedAmbiguity: string[] = [];

    for (const concept of analysis.extractedConcepts) {
      // 개념 매핑
      const mapping = await this.mapConcept(concept, request.sourceRole, request.targetRole);

      if (mapping) {
        mappedConcepts.push(mapping);
      }

      // 모호성 제거
      if (this.isAmbiguous(concept)) {
        const clarification = await this.requestClarification(concept);
        removedAmbiguity.push(clarification);
      }
    }

    // 컨텍스트 추가
    addedContext.push(...enrichedContext);

    return {
      mappedConcepts,
      addedContext,
      removedAmbiguity,
    };
  }

  /**
   * 결과 생성
   */
  protected async generateOutput(
    request: TranslationRequest,
    transformation: TranslationResult['transformation']
  ): Promise<TranslationResult['output']> {
    const prompt = this.buildGeneratePrompt(request, transformation);

    const response = await this.aiClient.generateText(prompt, {
      tier: 'sonnet',
      maxTokens: 2000,
      temperature: 0.3,
    });

    // 구조화된 출력 파싱
    const structured = this.tryParseStructured(response.text);

    return {
      raw: response.text,
      format: structured ? 'structured' : 'text',
      structured,
    };
  }

  /**
   * 품질 평가
   */
  protected async evaluateQuality(
    request: TranslationRequest,
    output: TranslationResult['output'],
    transformation: TranslationResult['transformation']
  ): Promise<TranslationResult['quality']> {
    const prompt = this.buildQualityPrompt(request, output, transformation);

    const response = await this.aiClient.generateText(prompt, {
      tier: 'haiku',
      maxTokens: 500,
      temperature: 0.1,
    });

    const parsed = this.extractJson(response.text);

    return {
      accuracy: parsed?.accuracy || 0.7,
      completeness: parsed?.completeness || 0.7,
      clarity: parsed?.clarity || 0.7,
      confidence: parsed?.confidence || 0.7,
    };
  }

  /**
   * 검증
   */
  protected async validateTranslation(
    request: TranslationRequest,
    output: TranslationResult['output']
  ): Promise<TranslationResult['validation']> {
    const issues: ValidationIssue[] = [];

    // 정확성 검증
    const accuracyCheck = await this.validateAccuracy(request, output);
    issues.push(...accuracyCheck);

    // 완전성 검증
    const completenessCheck = this.validateCompleteness(request, output);
    issues.push(...completenessCheck);

    // 제안 생성
    const suggestions = await this.generateSuggestions(request, output, issues);

    return {
      checked: true,
      issues,
      suggestions,
    };
  }

  // Abstract methods for subclasses
  protected abstract buildParsePrompt(request: TranslationRequest): string;
  protected abstract buildGeneratePrompt(
    request: TranslationRequest,
    transformation: TranslationResult['transformation']
  ): string;
  protected abstract buildQualityPrompt(
    request: TranslationRequest,
    output: TranslationResult['output'],
    transformation: TranslationResult['transformation']
  ): string;

  // Helper methods
  protected async findWikiReferences(concepts: ExtractedConcept[]): Promise<string[]> {
    // WikiKnowledge 통합
    return [];
  }

  protected async mapConcept(
    concept: ExtractedConcept,
    sourceRole: ExtendedTeamRole,
    targetRole: ExtendedTeamRole
  ): Promise<MappedConcept | null> {
    // 개념 매핑 로직
    return null;
  }

  protected isAmbiguous(concept: ExtractedConcept): boolean {
    return this.domainModel.language.ambiguityIndicators.some((indicator) =>
      concept.text.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  protected async requestClarification(concept: ExtractedConcept): Promise<string> {
    return `"${concept.text}"의 구체적인 의미를 명확히 해주세요.`;
  }

  protected async validateAccuracy(
    request: TranslationRequest,
    output: TranslationResult['output']
  ): Promise<ValidationIssue[]> {
    return [];
  }

  protected validateCompleteness(
    request: TranslationRequest,
    output: TranslationResult['output']
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // 필수 정보 확인
    const targetModel = getDomainModel(request.targetRole);
    for (const required of targetModel.informationNeeds.alwaysRequired) {
      if (!this.hasInformation(output, required)) {
        issues.push({
          type: 'missing-context',
          severity: 'medium',
          message: `필수 정보 누락: ${required}`,
          suggestion: `${required}에 대한 정보를 추가해주세요.`,
        });
      }
    }

    return issues;
  }

  protected async generateSuggestions(
    request: TranslationRequest,
    output: TranslationResult['output'],
    issues: ValidationIssue[]
  ): Promise<string[]> {
    return issues.map((i) => i.suggestion || i.message);
  }

  protected hasInformation(output: TranslationResult['output'], infoType: string): boolean {
    // 정보 존재 여부 확인 로직
    return output.raw.toLowerCase().includes(infoType.toLowerCase());
  }

  protected tryParseStructured(text: string): Record<string, unknown> | undefined {
    try {
      return this.extractJson(text) || undefined;
    } catch {
      return undefined;
    }
  }

  protected extractJson<T>(text: string): T | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as T;
      return null;
    } catch {
      return null;
    }
  }
}

// 도메인 모델 조회
function getDomainModel(role: ExtendedTeamRole): RoleDomainModel {
  // Registry에서 조회
  return {} as RoleDomainModel; // Placeholder
}
```

### 3.2 Specific Adapters

```typescript
// packages/workflow-engine/src/communication/adapters/implementations/pm-adapter.ts

import { BaseRoleAdapter } from '../base-adapter';
import type { TranslationRequest, TranslationResult } from '@rtb-ai-hub/shared';

export class PMAdapter extends BaseRoleAdapter {
  constructor() {
    super('pm', pmDomainModel);
  }

  protected buildParsePrompt(request: TranslationRequest): string {
    return `
      당신은 PM의 요구사항을 분석하는 전문가입니다.
      
      입력: "${request.input.raw}"
      
      다음을 JSON 형식으로 분석하세요:
      {
        "intent": "주요 의도 (기능요청/버그리포트/질문/기타)",
        "concepts": [
          {
            "conceptId": "개념 ID",
            "text": "원문 텍스트",
            "category": "business|process|technical"
          }
        ],
        "confidence": 0.0-1.0
      }
      
      PM 언어 패턴:
      - 사용자 스토리: "~할 수 있어야 한다", "~가 필요하다"
      - 비즈니스 가치: "~를 통해 ~를 달성"
      - 우선순위: "급하게", "P0", "~까지 필요"
      - 범위: "~만", "~까지", "최소한"
    `;
  }

  protected buildGeneratePrompt(
    request: TranslationRequest,
    transformation: TranslationResult['transformation']
  ): string {
    const targetRole = request.targetRole;

    let roleSpecificInstructions = '';
    if (targetRole === 'backend-developer' || targetRole === 'ui-developer') {
      roleSpecificInstructions = `
        개발자에게 다음 형식으로 번역:
        - 구현할 기능 요약
        - API 엔드포인트 (필요한 경우)
        - 데이터 모델 변경사항
        - 인증/권한 요구사항
        - 의존성/선행조건
        - 예상되는 기술적 고려사항
      `;
    } else if (targetRole === 'ux-planner') {
      roleSpecificInstructions = `
        UX 기획자에게 다음 형식으로 번역:
        - 사용자 흐름
        - 핵심 인터랙션
        - 화면 구성 요소
        - 접근성 고려사항
      `;
    }

    return `
      PM의 요구사항을 ${targetRole} 언어로 번역하세요.
      
      원문: "${request.input.raw}"
      
      추출된 개념:
      ${transformation.mappedConcepts.map((c) => `- ${c.sourceConceptId} → ${c.targetConceptId}`).join('\n')}
      
      추가 컨텍스트:
      ${transformation.addedContext.join('\n')}
      
      ${roleSpecificInstructions}
      
      번역 규칙:
      1. 비즈니스 목표를 기술적 요구사항으로 변환
      2. 모호한 용어는 구체화하거나 질문 추가
      3. wiki 참조가 있으면 인용
      4. 필요한 정보가 부족하면 명시적으로 요청
    `;
  }

  protected buildQualityPrompt(
    request: TranslationRequest,
    output: TranslationResult['output'],
    transformation: TranslationResult['transformation']
  ): string {
    return `
      번역 품질을 평가하세요.
      
      원문: "${request.input.raw}"
      번역: "${output.raw}"
      
      다음을 0.0-1.0 사이로 평가:
      {
        "accuracy": "의미 보존 정도",
        "completeness": "정보 완전성",
        "clarity": "명확성",
        "confidence": "전반적 신뢰도"
      }
    `;
  }
}
```

```typescript
// packages/workflow-engine/src/communication/adapters/implementations/developer-adapter.ts

import { BaseRoleAdapter } from '../base-adapter';

export class DeveloperAdapter extends BaseRoleAdapter {
  constructor(role: 'backend-developer' | 'ui-developer') {
    super(role, developerDomainModel);
  }

  protected buildParsePrompt(request: TranslationRequest): string {
    return `
      당신은 개발자의 기술적 설명을 분석하는 전문가입니다.
      
      입력: "${request.input.raw}"
      
      다음을 JSON 형식으로 분석하세요:
      {
        "intent": "주요 의도 (구현설명/기술제안/이슈보고/질문)",
        "concepts": [
          {
            "conceptId": "개념 ID",
            "text": "원문 텍스트",
            "category": "technical|process"
          }
        ],
        "technicalDetails": {
          "apiEndpoints": [],
          "databaseChanges": [],
          "dependencies": [],
          "technologies": []
        },
        "confidence": 0.0-1.0
      }
    `;
  }

  protected buildGeneratePrompt(
    request: TranslationRequest,
    transformation: TranslationResult['transformation']
  ): string {
    return `
      개발자의 기술적 설명을 비즈니스 언어로 번역하세요.
      
      원문: "${request.input.raw}"
      
      번역 규칙:
      1. 기술 용어를 비즈니스 영향으로 변환
      2. "~가 필요하다" → "~를 위해 ~가 필요합니다"
      3. 구체적인 기술 세부사항은 옵션으로 제공
      4. 사용자/비즈니스 관점에서 설명
      5. 리스크/영향도 명시
      
      예시:
      - "DB 스키마 변경" → "사용자 데이터 구조 확장"
      - "API 엔드포인트 추가" → "새로운 기능을 위한 서버 인터페이스 생성"
      - "OAuth2 연동" → "소셜 로그인 기능 활성화"
    `;
  }

  protected buildQualityPrompt(
    request: TranslationRequest,
    output: TranslationResult['output'],
    transformation: TranslationResult['transformation']
  ): string {
    return `
      개발→비즈니스 번역 품질을 평가하세요.
      
      원문: "${request.input.raw}"
      번역: "${output.raw}"
      
      비즈니스 담당자가 이해할 수 있는지 평가:
      {
        "accuracy": "기술적 정확성 유지",
        "completeness": "중요 정보 누락 여부",
        "clarity": "비즈니스 언어로의 변환 성공도",
        "confidence": "전반적 신뢰도"
      }
    `;
  }
}
```

---

## 4. Adapter Registry

```typescript
// packages/workflow-engine/src/communication/adapters/adapter-registry.ts

import type { ExtendedTeamRole, AdapterConfig } from '@rtb-ai-hub/shared';
import { BaseRoleAdapter } from './base-adapter';
import { PMAdapter } from './implementations/pm-adapter';
import { DeveloperAdapter } from './implementations/developer-adapter';
// ... other adapters

export class AdapterRegistry {
  private adapters: Map<ExtendedTeamRole, BaseRoleAdapter> = new Map();
  private configs: Map<string, AdapterConfig> = new Map(); // "source→target" -> config

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    this.register(new PMAdapter());
    this.register(new DeveloperAdapter('backend-developer'));
    this.register(new DeveloperAdapter('ui-developer'));
    // ... register other adapters
  }

  register(adapter: BaseRoleAdapter): void {
    this.adapters.set(adapter.role, adapter);
  }

  get(role: ExtendedTeamRole): BaseRoleAdapter | undefined {
    return this.adapters.get(role);
  }

  /**
   * 번역 요청 처리
   */
  async translate(
    sourceRole: ExtendedTeamRole,
    targetRole: ExtendedTeamRole,
    content: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    const sourceAdapter = this.get(sourceRole);
    const targetAdapter = this.get(targetRole);

    if (!sourceAdapter || !targetAdapter) {
      throw new Error(`Adapter not found for ${sourceRole} or ${targetRole}`);
    }

    const request: TranslationRequest = {
      id: generateId('trans'),
      sourceRole,
      targetRole,
      input: {
        raw: content,
        format: 'text',
        source: (context?.source as string) || 'manual',
      },
      context: {
        jiraKey: context?.jiraKey as string,
        projectContext: context?.projectContext as string,
      },
      options: {
        detailLevel: 'medium',
        includeAlternatives: false,
        includeJustification: true,
        preserveIntent: true,
      },
    };

    const result = await sourceAdapter.translate(request);

    // 품질 확인
    if (result.quality.confidence < 0.6) {
      console.warn('Low confidence translation:', result.validation.issues);
    }

    return result.output.raw;
  }

  /**
   * 양방향 번역
   */
  async translateBidirectional(
    role1: ExtendedTeamRole,
    role2: ExtendedTeamRole,
    content: string,
    from: ExtendedTeamRole
  ): Promise<{ to: string; back: string }> {
    const to = await this.translate(from, from === role1 ? role2 : role1, content);
    const back = await this.translate(from === role1 ? role2 : role1, from, to);

    return { to, back };
  }

  /**
   * 설정 조회
   */
  getConfig(sourceRole: ExtendedTeamRole, targetRole: ExtendedTeamRole): AdapterConfig | undefined {
    return this.configs.get(`${sourceRole}→${targetRole}`);
  }

  /**
   * 설정 저장
   */
  setConfig(
    sourceRole: ExtendedTeamRole,
    targetRole: ExtendedTeamRole,
    config: AdapterConfig
  ): void {
    this.configs.set(`${sourceRole}→${targetRole}`, config);
  }
}

// 싱글톤
export const adapterRegistry = new AdapterRegistry();
```

---

## 다음 단계

1. **Active Wiki Facilitation** 설계
2. **Onboarding Coordination** 설계
3. **통합 및 API** 설계

계속 진행하시겠습니까?
