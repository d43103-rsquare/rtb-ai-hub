# Active Wiki Facilitation & Onboarding Coordination Design

## 1. Active Wiki Facilitation

### 1.1 개요

Active Wiki Facilitation은 기존의 **수동적 Wiki 참조**에서 벗어나, **능동적으로 커뮤니케이션을 지원**하는 시스템입니다. 대화/작업의 맥락을 이해하고 적절한 시점에 관련 지식을 제안합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Active Wiki Facilitation System                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Trigger Sources                    Processing Pipeline                     │
│                                                                              │
│   ┌──────────────┐                                                    │
│   │   Slack      │──┐                                              │
│   │   Message    │  │                                              │
│   └──────────────┘  │    ┌─────────────────────────────────────┐   │
│                     │    │      Context Analysis Engine        │   │
│   ┌──────────────┐  │    │                                     │   │
│   │   Jira       │──┼───▶│  - Intent Classification            │   │
│   │   Comment    │  │    │  - Entity Extraction                │   │
│   └──────────────┘  │    │  - Role Identification              │   │
│                     │    │  - Knowledge Gap Detection          │   │
│   ┌──────────────┐  │    └──────────────┬──────────────────────┘   │
│   │   PR Review  │──┘                   │                          │
│   │   Comment    │                      ▼                          │
│   └──────────────┘         ┌──────────────────────────────┐        │
│                            │    Suggestion Engine         │        │
│                            │                              │        │
│                            │  ┌──────────┐ ┌──────────┐  │        │
│                            │  │ Relevance│ │ Priority │  │        │
│                            │  │ Scoring  │ │ Ranking  │  │        │
│                            │  └──────────┘ └──────────┘  │        │
│                            └──────────────┬───────────────┘        │
│                                           │                        │
│                                           ▼                        │
│                            ┌──────────────────────────────┐        │
│                            │   Delivery Strategy          │        │
│                            │                              │        │
│                            │  - Inline suggestion         │        │
│                            │  - Thread reply              │        │
│                            │  - DM notification           │        │
│                            │  - Dashboard widget          │        │
│                            └──────────────┬───────────────┘        │
│                                           │                        │
│                                           ▼                        │
│   Output                         ┌─────────────────┐               │
│                                  │  Wiki Content   │               │
│   💡 "이 대화에서 'JWT 인증'에   │  - Extracts     │               │
│       관련된 wiki 문서를         │  - Summarizes   │               │
│       찾았습니다: auth/jwt.md"   │  - Contextualizes│              │
│                                  └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 타입 정의

```typescript
// packages/shared/src/communication-types.ts (append)

/**
 * Wiki Facilitation Trigger
 */
export interface WikiFacilitationTrigger {
  id: string;
  source: 'slack' | 'jira' | 'github' | 'manual';
  sourceId: string; // message id, issue key, etc.
  content: {
    text: string;
    author: {
      userId: string;
      role: ExtendedTeamRole;
    };
    timestamp: Date;
    threadContext?: string[]; // 이전 대화 맥락
  };
  context: {
    jiraKey?: string;
    project?: string;
    participants: ExtendedTeamRole[];
  };
}

/**
 * Wiki Suggestion
 */
export interface WikiSuggestion {
  id: string;
  triggerId: string;

  // 제안된 문서
  document: {
    path: string;
    title: string;
    summary: string;
    relevanceScore: number; // 0-1
    keySections: WikiSection[];
  };

  // 제안 근거
  reasoning: {
    matchedKeywords: string[];
    matchedConcepts: string[];
    contextGaps: string[]; // 이 지식이 채워주는 격차
    relatedDiscussions: string[];
  };

  // 표시 설정
  presentation: {
    urgency: 'immediate' | 'helpful' | 'reference';
    format: 'inline' | 'sidebar' | 'popup' | 'digest';
    includeFullText: boolean;
    includeSummary: boolean;
    includeLinks: boolean;
  };

  // 메타데이터
  metadata: {
    suggestedAt: Date;
    deliveredAt?: Date;
    acknowledgedAt?: Date;
    feedback?: 'helpful' | 'not-relevant' | 'already-known';
  };
}

/**
 * Wiki Section
 */
export interface WikiSection {
  heading: string;
  content: string;
  relevanceScore: number;
  lineNumbers: { start: number; end: number };
}

/**
 * Knowledge Gap
 */
export interface KnowledgeGap {
  id: string;
  detectedIn: string; // message id, discussion id

  // 격차 내용
  gap: {
    type: 'missing-domain' | 'missing-technical' | 'ambiguous-term' | 'outdated-info';
    description: string;
    affectedRoles: ExtendedTeamRole[];
    severity: 'critical' | 'high' | 'medium' | 'low';
  };

  // 관련 정보
  relatedWikiDocs: string[];
  relatedDiscussions: string[];
  suggestedResolution: string;

  // 상태
  status: 'detected' | 'suggested' | 'acknowledged' | 'resolved' | 'ignored';
}

/**
 * Concept Relationship
 */
export interface ConceptRelationship {
  sourceConcept: string;
  targetConcept: string;
  relationship: 'depends-on' | 'uses' | 'implements' | 'extends' | 'related-to';
  strength: number; // 0-1
  evidence: string[]; // 출처 문서들
}

/**
 * Concept Map
 */
export interface ConceptMap {
  rootConcept: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export interface ConceptNode {
  id: string;
  concept: string;
  category: ConceptCategory;
  wikiPath: string;
  importance: number;
}

export interface ConceptEdge {
  from: string;
  to: string;
  relationship: string;
  strength: number;
}
```

### 1.3 Facilitator Service Implementation

```typescript
// packages/workflow-engine/src/communication/wiki-facilitator/facilitator-service.ts

import { createLogger } from '@rtb-ai-hub/shared';
import type {
  WikiFacilitationTrigger,
  WikiSuggestion,
  KnowledgeGap,
  ConceptMap,
} from '@rtb-ai-hub/shared';
import { WikiKnowledge } from '../../utils/wiki-knowledge';
import { SuggestionEngine } from './suggestion-engine';
import { GapDetector } from './gap-detector';
import { ConceptMapper } from './concept-mapper';

const logger = createLogger('wiki-facilitator');

export class WikiFacilitationService {
  private wikiKnowledge: WikiKnowledge;
  private suggestionEngine: SuggestionEngine;
  private gapDetector: GapDetector;
  private conceptMapper: ConceptMapper;

  constructor(wikiPath: string) {
    this.wikiKnowledge = new WikiKnowledge(wikiPath);
    this.suggestionEngine = new SuggestionEngine(this.wikiKnowledge);
    this.gapDetector = new GapDetector(this.wikiKnowledge);
    this.conceptMapper = new ConceptMapper(this.wikiKnowledge);
  }

  /**
   * 컨텍스트 분석 및 제안 생성
   */
  async analyzeAndSuggest(trigger: WikiFacilitationTrigger): Promise<{
    suggestions: WikiSuggestion[];
    gaps: KnowledgeGap[];
  }> {
    logger.info({ triggerId: trigger.id }, 'Analyzing context for wiki suggestions');

    // 1. 컨텍스트 분석
    const context = await this.analyzeContext(trigger);

    // 2. 관련 문서 검색
    const relevantDocs = await this.findRelevantDocuments(context);

    // 3. 지식 격차 감지
    const gaps = await this.gapDetector.detect(context, relevantDocs);

    // 4. 제안 생성
    const suggestions = await this.suggestionEngine.generate(trigger, context, relevantDocs, gaps);

    // 5. 순위 결정
    const rankedSuggestions = this.rankSuggestions(suggestions, context);

    logger.info(
      {
        triggerId: trigger.id,
        suggestionCount: rankedSuggestions.length,
        gapCount: gaps.length,
      },
      'Wiki analysis completed'
    );

    return {
      suggestions: rankedSuggestions,
      gaps,
    };
  }

  /**
   * 컨텍스트 분석
   */
  private async analyzeContext(trigger: WikiFacilitationTrigger): Promise<AnalyzedContext> {
    const { content, context } = trigger;

    // 키워드 추출
    const keywords = this.extractKeywords(content.text);

    // 도메인 개념 식별
    const concepts = await this.identifyConcepts(content.text);

    // 의도 분류
    const intent = this.classifyIntent(content.text);

    // 참여자별 필요 지식
    const knowledgeNeeds = this.assessKnowledgeNeeds(context.participants, concepts);

    return {
      keywords,
      concepts,
      intent,
      knowledgeNeeds,
      threadContext: content.threadContext || [],
    };
  }

  /**
   * 관련 문서 검색
   */
  private async findRelevantDocuments(context: AnalyzedContext): Promise<RelevantDocument[]> {
    const docs: RelevantDocument[] = [];

    // 키워드 기반 검색
    for (const keyword of context.keywords) {
      const matches = await this.wikiKnowledge.searchByKeyword(keyword);
      docs.push(...matches);
    }

    // 개념 기반 검색
    for (const concept of context.concepts) {
      const matches = await this.wikiKnowledge.searchByConcept(concept.id);
      docs.push(...matches);
    }

    // 중복 제거 및 순위 결정
    const uniqueDocs = this.deduplicateAndRank(docs, context);

    return uniqueDocs.slice(0, 5); // 상위 5개만
  }

  /**
   * 제안 순위 결정
   */
  private rankSuggestions(
    suggestions: WikiSuggestion[],
    context: AnalyzedContext
  ): WikiSuggestion[] {
    return suggestions
      .map((s) => ({
        ...s,
        finalScore: this.calculateFinalScore(s, context),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  private calculateFinalScore(suggestion: WikiSuggestion, context: AnalyzedContext): number {
    const baseScore = suggestion.document.relevanceScore;

    // 긴급도 가중치
    const urgencyMultiplier = {
      immediate: 1.5,
      helpful: 1.0,
      reference: 0.7,
    }[suggestion.presentation.urgency];

    // 이전에 언급된 적 없는지 확인
    const isNew = !context.threadContext.some((ctx) => ctx.includes(suggestion.document.title));
    const noveltyBonus = isNew ? 1.2 : 0.8;

    return baseScore * urgencyMultiplier * noveltyBonus;
  }

  /**
   * 개념 관계맵 생성
   */
  async generateConceptMap(rootConcept: string, depth: number = 2): Promise<ConceptMap> {
    return this.conceptMapper.generateMap(rootConcept, depth);
  }

  /**
   * 실시간 제안 (스트리밍)
   */
  async *streamSuggestions(
    trigger: WikiFacilitationTrigger,
    options: {
      maxSuggestions: number;
      minRelevance: number;
    }
  ): AsyncGenerator<WikiSuggestion, void, unknown> {
    const { suggestions } = await this.analyzeAndSuggest(trigger);

    for (const suggestion of suggestions) {
      if (suggestion.document.relevanceScore >= options.minRelevance) {
        yield suggestion;
      }

      if (options.maxSuggestions-- <= 0) break;
    }
  }

  // Helper methods
  private extractKeywords(text: string): string[] {
    // 키워드 추출 로직
    const tablePattern = /\b(obj|prd|mbr|gtd|com)_[a-z0-9_]+\b/gi;
    const techPattern = /\b(API|JWT|OAuth|DB|SQL|HTTP)\b/gi;

    const keywords = new Set<string>();

    let match;
    while ((match = tablePattern.exec(text)) !== null) {
      keywords.add(match[0].toLowerCase());
    }
    while ((match = techPattern.exec(text)) !== null) {
      keywords.add(match[0].toLowerCase());
    }

    return Array.from(keywords);
  }

  private async identifyConcepts(text: string): Promise<ConceptReference[]> {
    // 개념 식별 로직
    return [];
  }

  private classifyIntent(text: string): ContextIntent {
    // 의도 분류
    if (text.includes('?') || text.includes('어떻게') || text.includes('무엇')) {
      return 'question';
    }
    if (text.includes('구현') || text.includes('개발') || text.includes('만들')) {
      return 'implementation';
    }
    if (text.includes('문제') || text.includes('오류') || text.includes('버그')) {
      return 'troubleshooting';
    }
    return 'discussion';
  }

  private assessKnowledgeNeeds(
    participants: ExtendedTeamRole[],
    concepts: ConceptReference[]
  ): Map<ExtendedTeamRole, string[]> {
    // 역할별 필요 지식 평가
    return new Map();
  }

  private deduplicateAndRank(
    docs: RelevantDocument[],
    context: AnalyzedContext
  ): RelevantDocument[] {
    const seen = new Set<string>();
    return docs
      .filter((d) => {
        if (seen.has(d.path)) return false;
        seen.add(d.path);
        return true;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

// Types
interface AnalyzedContext {
  keywords: string[];
  concepts: ConceptReference[];
  intent: ContextIntent;
  knowledgeNeeds: Map<ExtendedTeamRole, string[]>;
  threadContext: string[];
}

interface RelevantDocument {
  path: string;
  title: string;
  relevanceScore: number;
  matchedKeywords: string[];
}

interface ConceptReference {
  id: string;
  name: string;
  confidence: number;
}

type ContextIntent = 'question' | 'implementation' | 'troubleshooting' | 'discussion';
```

### 1.4 Suggestion Engine

```typescript
// packages/workflow-engine/src/communication/wiki-facilitator/suggestion-engine.ts

import { createLogger } from '@rtb-ai-hub/shared';
import type {
  WikiFacilitationTrigger,
  WikiSuggestion,
  KnowledgeGap,
  RelevantDocument,
} from '@rtb-ai-hub/shared';

const logger = createLogger('suggestion-engine');

export class SuggestionEngine {
  constructor(private wikiKnowledge: WikiKnowledge) {}

  /**
   * 제안 생성
   */
  async generate(
    trigger: WikiFacilitationTrigger,
    context: AnalyzedContext,
    relevantDocs: RelevantDocument[],
    gaps: KnowledgeGap[]
  ): Promise<WikiSuggestion[]> {
    const suggestions: WikiSuggestion[] = [];

    for (const doc of relevantDocs) {
      // 문서 내용 로드
      const content = await this.wikiKnowledge.getTableDoc(
        doc.path.split('/').pop()?.replace('.md', '') || ''
      );

      if (!content) continue;

      // 관련 섹션 추출
      const keySections = this.extractRelevantSections(content, context);

      // 제안 생성
      const suggestion = this.buildSuggestion(trigger, doc, keySections, context, gaps);

      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * 관련 섹션 추출
   */
  private extractRelevantSections(content: string, context: AnalyzedContext): WikiSection[] {
    const sections: WikiSection[] = [];
    const lines = content.split('\n');

    let currentSection: WikiSection | null = null;
    let sectionContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 섹션 헤딩 감지 (##, ###)
      if (line.startsWith('##')) {
        if (currentSection) {
          currentSection.content = sectionContent.join('\n');
          currentSection.relevanceScore = this.calculateSectionRelevance(currentSection, context);
          sections.push(currentSection);
        }

        currentSection = {
          heading: line.replace(/#/g, '').trim(),
          content: '',
          relevanceScore: 0,
          lineNumbers: { start: i, end: i },
        };
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
        currentSection.lineNumbers.end = i;
      }
    }

    // 마지막 섹션 처리
    if (currentSection) {
      currentSection.content = sectionContent.join('\n');
      currentSection.relevanceScore = this.calculateSectionRelevance(currentSection, context);
      sections.push(currentSection);
    }

    // 상위 3개 섹션만 반환
    return sections.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 3);
  }

  /**
   * 섹션 관련성 계산
   */
  private calculateSectionRelevance(section: WikiSection, context: AnalyzedContext): number {
    let score = 0;
    const text = (section.heading + ' ' + section.content).toLowerCase();

    // 키워드 매칭
    for (const keyword of context.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.3;
      }
    }

    // 개념 매칭
    for (const concept of context.concepts) {
      if (text.includes(concept.name.toLowerCase())) {
        score += 0.5;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * 제안 객체 생성
   */
  private buildSuggestion(
    trigger: WikiFacilitationTrigger,
    doc: RelevantDocument,
    keySections: WikiSection[],
    context: AnalyzedContext,
    gaps: KnowledgeGap[]
  ): WikiSuggestion {
    // 긴급도 결정
    const urgency = this.determineUrgency(doc, context, gaps);

    // 표시 형식 결정
    const format = this.determineFormat(trigger, urgency);

    // 요약 생성
    const summary = this.generateSummary(doc, keySections);

    return {
      id: generateId('suggest'),
      triggerId: trigger.id,
      document: {
        path: doc.path,
        title: doc.title,
        summary,
        relevanceScore: doc.relevanceScore,
        keySections,
      },
      reasoning: {
        matchedKeywords: doc.matchedKeywords,
        matchedConcepts: context.concepts.map((c) => c.name),
        contextGaps: gaps.map((g) => g.gap.description),
        relatedDiscussions: [],
      },
      presentation: {
        urgency,
        format,
        includeFullText: false,
        includeSummary: true,
        includeLinks: true,
      },
      metadata: {
        suggestedAt: new Date(),
      },
    };
  }

  /**
   * 긴급도 결정
   */
  private determineUrgency(
    doc: RelevantDocument,
    context: AnalyzedContext,
    gaps: KnowledgeGap[]
  ): WikiSuggestion['presentation']['urgency'] {
    // 중요한 격차를 채우는 문서
    const fillsCriticalGap = gaps.some(
      (g) => g.gap.severity === 'critical' && g.relatedWikiDocs.includes(doc.path)
    );
    if (fillsCriticalGap) return 'immediate';

    // 질문에 직접 관련
    if (context.intent === 'question' && doc.relevanceScore > 0.8) {
      return 'immediate';
    }

    // 구현 관련
    if (context.intent === 'implementation' && doc.relevanceScore > 0.7) {
      return 'helpful';
    }

    return 'reference';
  }

  /**
   * 표시 형식 결정
   */
  private determineFormat(
    trigger: WikiFacilitationTrigger,
    urgency: WikiSuggestion['presentation']['urgency']
  ): WikiSuggestion['presentation']['format'] {
    if (trigger.source === 'slack') {
      return urgency === 'immediate' ? 'inline' : 'thread';
    }
    if (trigger.source === 'jira') {
      return 'sidebar';
    }
    return 'reference';
  }

  /**
   * 요약 생성
   */
  private generateSummary(doc: RelevantDocument, keySections: WikiSection[]): string {
    const sectionSummaries = keySections
      .slice(0, 2)
      .map((s) => `${s.heading}: ${s.content.slice(0, 100)}...`)
      .join('\n');

    return `관련 섹션:\n${sectionSummaries}`;
  }
}
```

---

## 2. Onboarding Coordination

### 2.1 개요

Onboarding Coordination은 신규 팀원이 **효과적으로 적응**할 수 있도록 구조화된 학습 경로, 맥락 기반 도움, 멘토링 시스템을 제공합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Onboarding Coordination System                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Onboarding Journey Map                           │   │
│   │                                                                      │   │
│   │   Day 1-3              Week 1              Week 2-4     Month 1-3   │   │
│   │      │                    │                   │            │         │   │
│   │      ▼                    ▼                   ▼            ▼         │   │
│   │   ┌──────┐            ┌──────┐           ┌──────┐      ┌──────┐     │   │
│   │   │Setup │───────────▶│Domain│──────────▶│Hands-│─────▶│Indep-│     │   │
│   │   │& Env │            │Knowledge        │ on     │      │endent│     │   │
│   │   └──────┘            └──────┘           └──────┘      └──────┘     │   │
│   │      │                    │                   │            │         │   │
│   │      ▼                    ▼                   ▼            ▼         │   │
│   │   - 계정 생성         - 비즈니스 도메인   - 첫 티켓     - 독립적      │   │
│   │   - 개발 환경         - 시스템 아키텍처   - 코드 리뷰   - 프로젝트    │   │
│   │   - 팀 소개          - 코딩 표준         - Pair      - 멘토링       │   │
│   │                      - Git 전략           프로그래밍    - 완료        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Key Components                                   │   │
│   │                                                                      │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│   │  │   Learning   │  │   Contextual │  │   Mentor     │               │   │
│   │  │    Path      │  │     Help     │  │   Matching   │               │   │
│   │  │  Generator   │  │   System     │  │   Engine     │               │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│   │         │                │                │                         │   │
│   │         ▼                ▼                ▼                         │   │
│   │  ┌───────────────────────────────────────────────────────────────┐  │   │
│   │  │                    Progress Tracker                          │  │   │
│   │  └───────────────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 타입 정의

```typescript
// packages/shared/src/communication-types.ts (append)

/**
 * Onboarding Plan
 */
export interface OnboardingPlan {
  id: string;
  userId: string;
  role: ExtendedTeamRole;

  // 기본 정보
  startDate: Date;
  expectedEndDate: Date;

  // 단계별 계획
  phases: OnboardingPhase[];

  // 진행 상황
  progress: {
    completedSteps: number;
    totalSteps: number;
    currentPhase: string;
    overallProgress: number; // 0-100
  };

  // 멘토링
  mentor?: {
    userId: string;
    role: ExtendedTeamRole;
    assignedAt: Date;
  };

  // 설정
  config: {
    pace: 'standard' | 'accelerated' | 'extended';
    focusAreas: string[];
    skipIfKnown: boolean;
  };
}

/**
 * Onboarding Phase
 */
export interface OnboardingPhase {
  id: string;
  name: string;
  order: number;

  // 기간
  durationDays: number;
  startDate?: Date;
  endDate?: Date;

  // 학습 단계
  steps: OnboardingStep[];

  // 완료 기준
  completionCriteria: CompletionCriterion[];

  // 상태
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
}

/**
 * Onboarding Step
 */
export interface OnboardingStep {
  id: string;
  name: string;
  type: 'reading' | 'video' | 'interactive' | 'task' | 'meeting' | 'shadowing';

  // 콘텐츠
  content: {
    title: string;
    description: string;
    resources: ResourceReference[];
    estimatedDurationMinutes: number;
  };

  // 완료 조건
  completion: {
    type: 'self-check' | 'quiz' | 'task-completion' | 'mentor-approval';
    requirements: string[];
  };

  // 상태
  status: 'not-started' | 'in-progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Resource Reference
 */
export interface ResourceReference {
  type: 'wiki' | 'document' | 'video' | 'code' | 'ticket' | 'person';
  title: string;
  url?: string;
  description?: string;
}

/**
 * Contextual Help Request
 */
export interface ContextualHelpRequest {
  id: string;
  userId: string;
  role: ExtendedTeamRole;

  // 컨텍스트
  context: {
    currentTask?: string;
    currentFile?: string;
    currentTicket?: string;
    errorMessage?: string;
    codeSnippet?: string;
  };

  // 질문
  question: string;

  // 긴급도
  urgency: 'blocking' | 'helpful' | 'curiosity';
}

/**
 * Contextual Help Response
 */
export interface ContextualHelpResponse {
  requestId: string;

  // 응답
  answer: string;

  // 관련 리소스
  resources: ResourceReference[];

  // 다음 단계 제안
  nextSteps: string[];

  // 관련 팀원
  suggestedPeople: {
    userId: string;
    role: ExtendedTeamRole;
    reason: string;
  }[];

  // 학습 기회
  learningOpportunity?: {
    concept: string;
    wikiPath: string;
    importance: 'critical' | 'recommended' | 'optional';
  };
}

/**
 * Mentor Profile
 */
export interface MentorProfile {
  userId: string;
  role: ExtendedTeamRole;

  // 전문성
  expertise: {
    domains: string[];
    technologies: string[];
    yearsOfExperience: number;
  };

  // 멘토링 경험
  mentoring: {
    totalMentees: number;
    currentMentees: number;
    averageRating: number;
    preferredMenteeRoles: ExtendedTeamRole[];
  };

  // 가용성
  availability: {
    maxMentees: number;
    preferredMeetingTimes: string[];
    timezone: string;
  };

  // 상태
  isAvailable: boolean;
}

/**
 * Mentorship Match
 */
export interface MentorshipMatch {
  mentorId: string;
  menteeId: string;

  // 매칭 점수
  score: number;

  // 매칭 근거
  reasoning: {
    roleAlignment: number;
    expertiseOverlap: string[];
    availabilityMatch: boolean;
    pastCollaboration?: boolean;
  };

  // 권장 사항
  recommendations: {
    meetingFrequency: string;
    focusAreas: string[];
    suggestedActivities: string[];
  };
}
```

### 2.3 Onboarding Service

```typescript
// packages/workflow-engine/src/communication/onboarding/onboarding-service.ts

import { createLogger } from '@rtb-ai-hub/shared';
import type {
  OnboardingPlan,
  OnboardingPhase,
  OnboardingStep,
  ExtendedTeamRole,
  ContextualHelpRequest,
  ContextualHelpResponse,
} from '@rtb-ai-hub/shared';
import { PathGenerator } from './path-generator';
import { MentorMatcher } from './mentor-matcher';
import { ProgressTracker } from './progress-tracker';
import { WikiKnowledge } from '../../utils/wiki-knowledge';

const logger = createLogger('onboarding-service');

export class OnboardingService {
  private pathGenerator: PathGenerator;
  private mentorMatcher: MentorMatcher;
  private progressTracker: ProgressTracker;
  private wikiKnowledge: WikiKnowledge;

  constructor(wikiPath: string) {
    this.pathGenerator = new PathGenerator(wikiPath);
    this.mentorMatcher = new MentorMatcher();
    this.progressTracker = new ProgressTracker();
    this.wikiKnowledge = new WikiKnowledge(wikiPath);
  }

  /**
   * 온보딩 플랜 생성
   */
  async createOnboardingPlan(
    userId: string,
    role: ExtendedTeamRole,
    options: {
      startDate: Date;
      pace?: 'standard' | 'accelerated' | 'extended';
      priorExperience?: string[];
    }
  ): Promise<OnboardingPlan> {
    logger.info({ userId, role }, 'Creating onboarding plan');

    // 학습 경로 생성
    const phases = await this.pathGenerator.generate(
      role,
      options.pace || 'standard',
      options.priorExperience
    );

    // 멘토 매칭
    const mentorMatch = await this.mentorMatcher.findBestMatch(userId, role);

    // 플랜 생성
    const plan: OnboardingPlan = {
      id: generateId('onboard'),
      userId,
      role,
      startDate: options.startDate,
      expectedEndDate: this.calculateEndDate(options.startDate, phases),
      phases,
      progress: {
        completedSteps: 0,
        totalSteps: phases.reduce((sum, p) => sum + p.steps.length, 0),
        currentPhase: phases[0]?.id || '',
        overallProgress: 0,
      },
      mentor: mentorMatch
        ? {
            userId: mentorMatch.mentorId,
            role,
            assignedAt: new Date(),
          }
        : undefined,
      config: {
        pace: options.pace || 'standard',
        focusAreas: [],
        skipIfKnown: true,
      },
    };

    // DB 저장
    await this.persistPlan(plan);

    logger.info({ planId: plan.id }, 'Onboarding plan created');

    return plan;
  }

  /**
   * 맥락 기반 도움 제공
   */
  async provideContextualHelp(request: ContextualHelpRequest): Promise<ContextualHelpResponse> {
    logger.info({ userId: request.userId }, 'Providing contextual help');

    // 관련 wiki 문서 검색
    const wikiContext = await this.wikiKnowledge.searchForContext(
      `${request.question} ${request.context.currentTask || ''}`,
      3
    );

    // 유사한 과거 질문 검색
    const similarQuestions = await this.findSimilarQuestions(request);

    // 팀원 추천
    const suggestedPeople = await this.suggestPeople(request);

    // 응답 생성
    const response: ContextualHelpResponse = {
      requestId: request.id,
      answer: this.generateAnswer(request, wikiContext, similarQuestions),
      resources: this.extractResources(wikiContext),
      nextSteps: this.suggestNextSteps(request),
      suggestedPeople,
    };

    // 학습 기회 식별
    if (request.urgency !== 'blocking') {
      response.learningOpportunity = await this.identifyLearningOpportunity(request);
    }

    return response;
  }

  /**
   * 진행 상황 업데이트
   */
  async updateProgress(
    planId: string,
    stepId: string,
    status: OnboardingStep['status']
  ): Promise<OnboardingPlan> {
    return this.progressTracker.updateStep(planId, stepId, status);
  }

  /**
   * 다음 단계 추천
   */
  async recommendNextStep(planId: string): Promise<{
    step: OnboardingStep;
    reasoning: string;
  }> {
    const plan = await this.getPlan(planId);

    // 현재 진행 중인 단계 찾기
    const currentPhase = plan.phases.find((p) => p.id === plan.progress.currentPhase);
    if (!currentPhase) throw new Error('Current phase not found');

    // 완료되지 않은 다음 단계 찾기
    const nextStep = currentPhase.steps.find((s) => s.status === 'not-started');
    if (!nextStep) {
      // 다음 페이즈로 이동
      const nextPhase = plan.phases.find((p) => p.order === currentPhase.order + 1);
      if (nextPhase) {
        return {
          step: nextPhase.steps[0],
          reasoning: `다음 단계(${nextPhase.name})로 이동합니다.`,
        };
      }
      throw new Error('All steps completed');
    }

    return {
      step: nextStep,
      reasoning: '현재 단계의 다음 학습 항목입니다.',
    };
  }

  /**
   * 학습 경로 조정
   */
  async adjustPath(
    planId: string,
    adjustment: {
      skipSteps?: string[];
      addSteps?: Partial<OnboardingStep>[];
      extendPhase?: { phaseId: string; extraDays: number };
    }
  ): Promise<OnboardingPlan> {
    const plan = await this.getPlan(planId);

    // skipSteps 처리
    if (adjustment.skipSteps) {
      for (const phase of plan.phases) {
        for (const step of phase.steps) {
          if (adjustment.skipSteps.includes(step.id)) {
            step.status = 'completed';
          }
        }
      }
    }

    // addSteps 처리
    if (adjustment.addSteps) {
      // 특정 페이즈에 추가
      plan.phases[0]?.steps.push(...(adjustment.addSteps as OnboardingStep[]));
    }

    // extendPhase 처리
    if (adjustment.extendPhase) {
      const phase = plan.phases.find((p) => p.id === adjustment.extendPhase!.phaseId);
      if (phase) {
        phase.durationDays += adjustment.extendPhase.extraDays;
      }
    }

    await this.persistPlan(plan);

    return plan;
  }

  // Helper methods
  private calculateEndDate(startDate: Date, phases: OnboardingPhase[]): Date {
    const totalDays = phases.reduce((sum, p) => sum + p.durationDays, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);
    return endDate;
  }

  private async persistPlan(plan: OnboardingPlan): Promise<void> {
    // DB 저장 로직
  }

  private async getPlan(planId: string): Promise<OnboardingPlan> {
    // DB 조회 로직
    return {} as OnboardingPlan;
  }

  private async findSimilarQuestions(
    request: ContextualHelpRequest
  ): Promise<Array<{ question: string; answer: string }>> {
    // 유사 질문 검색 로직
    return [];
  }

  private async suggestPeople(
    request: ContextualHelpRequest
  ): Promise<ContextualHelpResponse['suggestedPeople']> {
    // 팀원 추천 로직
    return [];
  }

  private generateAnswer(
    request: ContextualHelpRequest,
    wikiContext: string,
    similarQuestions: Array<{ question: string; answer: string }>
  ): string {
    // AI를 사용한 답변 생성
    return `Based on wiki content and similar questions...`;
  }

  private extractResources(wikiContext: string): ResourceReference[] {
    // 리소스 추출 로직
    return [];
  }

  private suggestNextSteps(request: ContextualHelpRequest): string[] {
    return [
      '관련 wiki 문서를 읽어보세요',
      '멘토와 15분 티타임을 잡으세요',
      '비슷한 코드를 검색해보세요',
    ];
  }

  private async identifyLearningOpportunity(
    request: ContextualHelpRequest
  ): Promise<ContextualHelpResponse['learningOpportunity']> {
    // 학습 기회 식별 로직
    return undefined;
  }
}
```

### 2.4 Path Generator

```typescript
// packages/workflow-engine/src/communication/onboarding/path-generator.ts

import type {
  OnboardingPhase,
  OnboardingStep,
  ExtendedTeamRole,
  ResourceReference,
} from '@rtb-ai-hub/shared';
import { WikiKnowledge } from '../../utils/wiki-knowledge';

export class PathGenerator {
  constructor(private wikiPath: string) {}

  /**
   * 역할별 학습 경로 생성
   */
  async generate(
    role: ExtendedTeamRole,
    pace: 'standard' | 'accelerated' | 'extended',
    priorExperience?: string[]
  ): Promise<OnboardingPhase[]> {
    const basePhases = this.getBasePhases(role);

    // 페이스에 따른 조정
    const adjustedPhases = this.adjustForPace(basePhases, pace);

    // 사전 경험에 따른 스킵
    if (priorExperience) {
      return this.skipKnownTopics(adjustedPhases, priorExperience);
    }

    return adjustedPhases;
  }

  /**
   * 기본 페이즈 정의
   */
  private getBasePhases(role: ExtendedTeamRole): OnboardingPhase[] {
    const phases: Record<ExtendedTeamRole, OnboardingPhase[]> = {
      pm: [
        {
          id: 'phase-1',
          name: '도메인 이해',
          order: 1,
          durationDays: 3,
          steps: [
            this.createReadingStep('RTB 비즈니스 모델', ['rtb-common/RTB_CONTEXT.md']),
            this.createReadingStep('주요 용어집', ['rtb-common/glossary.md']),
            this.createMeetingStep('PM 팀 소개'),
          ],
          completionCriteria: [],
          status: 'pending',
        },
        {
          id: 'phase-2',
          name: '제품 이해',
          order: 2,
          durationDays: 5,
          steps: [
            this.createReadingStep('제품 로드맵', ['product/roadmap.md']),
            this.createTaskStep('사용자 플로우 따라가기'),
            this.createShadowingStep('스프린트 플래닝 참관'),
          ],
          completionCriteria: [],
          status: 'pending',
        },
      ],
      'backend-developer': [
        {
          id: 'phase-1',
          name: '환경 설정',
          order: 1,
          durationDays: 1,
          steps: [
            this.createInteractiveStep('개발 환경 설정', ['developer/setup-guide.md']),
            this.createTaskStep('첫 커밋'),
          ],
          completionCriteria: [],
          status: 'pending',
        },
        {
          id: 'phase-2',
          name: '아키텍처 이해',
          order: 2,
          durationDays: 3,
          steps: [
            this.createReadingStep('시스템 아키텍처', ['architecture/overview.md']),
            this.createReadingStep('DB 스키마', ['rtb-common/db-schema/manage/_overview.md']),
            this.createCodeReviewStep('코드베이스 둘러보기'),
          ],
          completionCriteria: [],
          status: 'pending',
        },
        {
          id: 'phase-3',
          name: '첫 기여',
          order: 3,
          durationDays: 5,
          steps: [
            this.createTaskStep('good-first-issue 해결'),
            this.createShadowingStep('코드 리뷰 참여'),
            this.createTaskStep('첫 PR 머지'),
          ],
          completionCriteria: [],
          status: 'pending',
        },
      ],
      // ... 다른 역할들
    };

    return phases[role] || phases['backend-developer'];
  }

  /**
   * 페이스에 따른 조정
   */
  private adjustForPace(
    phases: OnboardingPhase[],
    pace: 'standard' | 'accelerated' | 'extended'
  ): OnboardingPhase[] {
    const multiplier = {
      standard: 1,
      accelerated: 0.7,
      extended: 1.5,
    }[pace];

    return phases.map((phase) => ({
      ...phase,
      durationDays: Math.ceil(phase.durationDays * multiplier),
    }));
  }

  /**
   * 알고 있는 주제 스킵
   */
  private skipKnownTopics(phases: OnboardingPhase[], priorExperience: string[]): OnboardingPhase[] {
    return phases.map((phase) => ({
      ...phase,
      steps: phase.steps.map((step) => {
        const shouldSkip = priorExperience.some((exp) =>
          step.name.toLowerCase().includes(exp.toLowerCase())
        );
        return {
          ...step,
          status: shouldSkip ? 'completed' : step.status,
        };
      }),
    }));
  }

  // Helper methods for creating steps
  private createReadingStep(name: string, wikiPaths: string[]): OnboardingStep {
    return {
      id: generateId('step'),
      name,
      type: 'reading',
      content: {
        title: name,
        description: `${name}에 대해 학습합니다`,
        resources: wikiPaths.map((path) => ({
          type: 'wiki',
          title: path.split('/').pop() || '',
          url: path,
        })),
        estimatedDurationMinutes: 60,
      },
      completion: {
        type: 'self-check',
        requirements: ['문서를 읽고 이해했는지 확인'],
      },
      status: 'not-started',
    };
  }

  private createTaskStep(name: string): OnboardingStep {
    return {
      id: generateId('step'),
      name,
      type: 'task',
      content: {
        title: name,
        description: `${name}을(를) 완료합니다`,
        resources: [],
        estimatedDurationMinutes: 120,
      },
      completion: {
        type: 'task-completion',
        requirements: ['작업 완료'],
      },
      status: 'not-started',
    };
  }

  private createMeetingStep(name: string): OnboardingStep {
    return {
      id: generateId('step'),
      name,
      type: 'meeting',
      content: {
        title: name,
        description: `${name} 미팅`,
        resources: [],
        estimatedDurationMinutes: 30,
      },
      completion: {
        type: 'self-check',
        requirements: ['미팅 참석'],
      },
      status: 'not-started',
    };
  }

  private createInteractiveStep(name: string, wikiPaths: string[]): OnboardingStep {
    return {
      id: generateId('step'),
      name,
      type: 'interactive',
      content: {
        title: name,
        description: `${name}을(를) 직접 실습합니다`,
        resources: wikiPaths.map((path) => ({
          type: 'wiki',
          title: path.split('/').pop() || '',
          url: path,
        })),
        estimatedDurationMinutes: 90,
      },
      completion: {
        type: 'task-completion',
        requirements: ['실습 완료'],
      },
      status: 'not-started',
    };
  }

  private createCodeReviewStep(name: string): OnboardingStep {
    return {
      id: generateId('step'),
      name,
      type: 'interactive',
      content: {
        title: name,
        description: '코드베이스를 탐색하고 주요 패턴을 이해합니다',
        resources: [],
        estimatedDurationMinutes: 120,
      },
      completion: {
        type: 'mentor-approval',
        requirements: ['코드 투어 완료'],
      },
      status: 'not-started',
    };
  }

  private createShadowingStep(name: string): OnboardingStep {
    return {
      id: generateId('step'),
      name,
      type: 'shadowing',
      content: {
        title: name,
        description: '경험 있는 팀원의 업무를 관찰합니다',
        resources: [],
        estimatedDurationMinutes: 120,
      },
      completion: {
        type: 'self-check',
        requirements: ['쉐도잉 완료'],
      },
      status: 'not-started',
    };
  }
}
```

---

## 3. 데이터베이스 스키마

```sql
-- Wiki Facilitation 테이블
CREATE TABLE wiki_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id VARCHAR(100) NOT NULL,
  document_path VARCHAR(500) NOT NULL,
  document_title VARCHAR(500),
  summary TEXT,
  relevance_score DECIMAL(3,2),

  -- reasoning
  matched_keywords TEXT[],
  matched_concepts TEXT[],
  context_gaps TEXT[],

  -- presentation
  urgency VARCHAR(50),
  format VARCHAR(50),

  -- metadata
  suggested_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  feedback VARCHAR(50),

  -- 관계
  user_id VARCHAR(200),
  jira_key VARCHAR(50)
);

CREATE INDEX idx_wiki_suggestions_user ON wiki_suggestions(user_id);
CREATE INDEX idx_wiki_suggestions_relevance ON wiki_suggestions(relevance_score);

-- Knowledge Gaps 테이블
CREATE TABLE knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_in VARCHAR(200) NOT NULL,
  gap_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  affected_roles TEXT[],
  severity VARCHAR(50),
  related_wiki_docs TEXT[],
  suggested_resolution TEXT,
  status VARCHAR(50) DEFAULT 'detected',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Onboarding Plans 테이블
CREATE TABLE onboarding_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  expected_end_date TIMESTAMPTZ,
  phases JSONB DEFAULT '[]',
  progress JSONB DEFAULT '{}',
  mentor_id VARCHAR(200),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding Progress 테이블
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES onboarding_plans(id) ON DELETE CASCADE,
  step_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(plan_id, step_id)
);

-- Mentor Profiles 테이블
CREATE TABLE mentor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  expertise JSONB DEFAULT '{}',
  mentoring_stats JSONB DEFAULT '{}',
  availability JSONB DEFAULT '{}',
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contextual Help History 테이블
CREATE TABLE contextual_help_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(200) NOT NULL,
  question TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  answer TEXT,
  resources JSONB DEFAULT '[]',
  helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contextual_help_user ON contextual_help_history(user_id);
```

---

## 4. 통합 예시

```typescript
// 사용 예시

// 1. 온보딩 시작
const onboarding = new OnboardingService('/path/to/wiki');
const plan = await onboarding.createOnboardingPlan(
  'new-developer@company.com',
  'backend-developer',
  {
    startDate: new Date(),
    pace: 'standard',
    priorExperience: ['nodejs', 'postgresql'],
  }
);

// 2. 실시간 도움 요청
const help = await onboarding.provideContextualHelp({
  id: 'help-1',
  userId: 'new-developer@company.com',
  role: 'backend-developer',
  context: {
    currentTask: '로그인 API 구현',
    currentFile: 'src/auth/controller.ts',
  },
  question: 'JWT 토큰은 어디에 저장해야 하나요?',
  urgency: 'blocking',
});

// 3. Wiki 제안
const facilitator = new WikiFacilitationService('/path/to/wiki');
const { suggestions } = await facilitator.analyzeAndSuggest({
  id: 'trigger-1',
  source: 'slack',
  sourceId: 'msg-123',
  content: {
    text: 'obj_bld_mst 테이블에 새 컬럼을 추가해야 합니다',
    author: { userId: 'dev@company.com', role: 'backend-developer' },
    timestamp: new Date(),
  },
  context: {
    jiraKey: 'PROJ-123',
    participants: ['backend-developer', 'pm'],
  },
});
```

---

다음 단계:

1. **데이터 모델 및 API 설계** - 통합 REST/GraphQL API 정의
2. **통합 및 확장 전략** - 기존 시스템과의 통합 방안

계속 진행하시겠습니까?
