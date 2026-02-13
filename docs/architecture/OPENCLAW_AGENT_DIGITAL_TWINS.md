# OpenClaw Agent 기반 직무자 디지털 트윈 아키텍처

> 💡 **7개 AI 에이전트가 팀원처럼 협업하는 시스템**  
> 쉬운 설명이 필요하다면: **[개념 설명서 - 개념 2: 7-Agent Digital Twin](../CONCEPTS.md#개념-2-7-agent-digital-twin-디지털-트윈)**

---

## 개요

각 직무자(PM, 개발자, 디자이너 등)를 대신하는 **전용 OpenClaw Agent**를 구성하여:

- 실시간 협업 시뮬레이션
- 24/7 커뮤니케이션 조율
- 결정 사항의 자동 문서화

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Digital Twin Agents via OpenClaw                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Real Team                          Digital Twins                           │
│                                                                              │
│   👤 PM ────────┐                    🤖 PM Agent                             │
│                 │                         │                                  │
│   👤 System     │                    🤖 System Planner Agent                 │
│      Planner ───┼─────────────────────────┤                                  │
│                 │                         │         OpenClaw                 │
│   👤 UX         │                    🤖 UX Designer Agent    Gateway        │
│      Designer ──┼─────────────────────────┤            │                     │
│                 │                         │            │                     │
│   👤 UI Dev ────┤                    🤖 UI Developer Agent ───┐              │
│                 │                         │                   │              │
│   👤 Backend    │                    🤖 Backend Developer      │              │
│      Dev ───────┤                         │      Agent         │              │
│                 │                         │                   ▼              │
│   👤 QA ────────┤                    🤖 QA Agent ───────▶ Simulation        │
│                 │                         │         & Collaboration          │
│   👤 Ops ───────┘                    🤖 Ops Agent                            │
│                                                                              │
│                                          │                                   │
│                                          ▼                                   │
│   Real Team ◀────────────────────── Proposal/Result                          │
│   (Review & Confirm)                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. OpenClaw Agent 설정

### 1.1 Agent Configuration

```json
// infrastructure/openclaw/openclaw-agents.json

{
  "agents": {
    "pm-agent": {
      "enabled": true,
      "name": "Product Manager Agent",
      "role": "pm",
      "model": "claude-sonnet",
      "systemPrompt": "당신은 경험 많은 프로덕트 매니저입니다. 비즈니스 가치, 사용자 니즈, 우선순위를 고려하여 의사결정을 내립니다. 기술적 세부사항보다는 '왜'와 '무엇을'에 집중하세요.",
      "capabilities": [
        "requirement-analysis",
        "priority-setting",
        "scope-management",
        "stakeholder-communication"
      ],
      "triggers": ["new-feature-request", "requirement-clarification-needed", "scope-change"],
      "handoff": {
        "to": ["system-planner-agent", "ux-designer-agent"],
        "conditions": ["technical-feasibility-required", "user-flow-needed"]
      }
    },

    "system-planner-agent": {
      "enabled": true,
      "name": "System Architect Agent",
      "role": "system-planner",
      "model": "claude-sonnet",
      "systemPrompt": "당신은 시스템 아키텍트입니다. 기술적 제약, 확장성, 통합 포인트를 고려하여 아키텍처를 설계합니다. 가능한 한 단순하고 유지보수 가능한 솔루션을 선호하세요.",
      "capabilities": [
        "architecture-design",
        "integration-planning",
        "technical-feasibility",
        "db-schema-design"
      ],
      "triggers": ["architecture-decision-needed", "integration-required", "performance-concern"],
      "handoff": {
        "to": ["backend-dev-agent", "ops-agent"],
        "conditions": ["implementation-ready", "deployment-plan-needed"]
      }
    },

    "ux-designer-agent": {
      "enabled": true,
      "name": "UX Designer Agent",
      "role": "ux-planner",
      "model": "claude-sonnet",
      "systemPrompt": "당신은 UX 디자이너입니다. 사용자 중심 사고, 직관적인 인터랙션, 접근성을 고려합니다. Figma 컴포넌트와 디자인 시스템을 잘 알고 있습니다.",
      "capabilities": [
        "user-flow-design",
        "wireframe-creation",
        "usability-review",
        "accessibility-check"
      ],
      "triggers": ["user-flow-needed", "design-review-requested", "interaction-design-required"],
      "handoff": {
        "to": ["ui-dev-agent"],
        "conditions": ["design-ready-for-dev"]
      }
    },

    "ui-dev-agent": {
      "enabled": true,
      "name": "UI Developer Agent",
      "role": "ui-developer",
      "model": "claude-sonnet",
      "systemPrompt": "당신은 UI 개발자입니다. React, TypeScript, Tailwind CSS 전문가입니다. 디자인 시스템을 준수하고, 성능과 접근성을 고려하여 구현합니다.",
      "capabilities": [
        "component-development",
        "responsive-implementation",
        "design-system-compliance",
        "frontend-testing"
      ],
      "triggers": ["design-handoff-received", "component-implementation-needed", "ui-bug-fix"],
      "handoff": {
        "to": ["qa-agent"],
        "conditions": ["ui-implementation-complete"]
      }
    },

    "backend-dev-agent": {
      "enabled": true,
      "name": "Backend Developer Agent",
      "role": "backend-developer",
      "model": "claude-sonnet",
      "systemPrompt": "당신은 백엔드 개발자입니다. Node.js, PostgreSQL, API 설계 전문가입니다. 확장 가능하고 안전한 서버 사이드 코드를 작성합니다. RTB 도메인(빌딩, 매물, 딜)을 잘 이해합니다.",
      "capabilities": [
        "api-development",
        "db-schema-implementation",
        "integration-development",
        "backend-testing"
      ],
      "triggers": ["api-spec-received", "backend-implementation-needed", "db-migration-required"],
      "handoff": {
        "to": ["qa-agent", "ops-agent"],
        "conditions": ["api-implementation-complete", "deployment-ready"]
      }
    },

    "qa-agent": {
      "enabled": true,
      "name": "QA Engineer Agent",
      "role": "qa",
      "model": "claude-haiku",
      "systemPrompt": "당신은 QA 엔지니어입니다. 테스트 케이스 설계, 버그 리포팅, 품질 보증에 능숙합니다. edge case를 찾아내고 사용자 관점에서 테스트합니다.",
      "capabilities": [
        "test-case-design",
        "regression-testing",
        "bug-reporting",
        "acceptance-criteria-validation"
      ],
      "triggers": ["dev-handoff-received", "test-planning-needed", "bug-found"],
      "handoff": {
        "to": ["pm-agent"],
        "conditions": ["qa-approved"]
      }
    },

    "ops-agent": {
      "enabled": true,
      "name": "DevOps Engineer Agent",
      "role": "ops",
      "model": "claude-haiku",
      "systemPrompt": "당신은 DevOps 엔지니어입니다. CI/CD, 인프라, 모니터링 전문가입니다. 안전한 배포와 시스템 안정성을 최우선으로 합니다.",
      "capabilities": [
        "deployment-automation",
        "infrastructure-management",
        "monitoring-setup",
        "incident-response"
      ],
      "triggers": ["deployment-requested", "infrastructure-change-needed", "incident-detected"],
      "handoff": {
        "to": ["pm-agent"],
        "conditions": ["deployment-complete", "incident-resolved"]
      }
    }
  },

  "collaboration": {
    "mode": "orchestrated",
    "coordinator": "pm-agent",
    "timeout": 3600,
    "maxRounds": 5
  }
}
```

---

## 2. Agent 간 협업 프로토콜

### 2.1 메시지 형식

```typescript
// Agent 간 통신 메시지

interface AgentMessage {
  id: string;
  timestamp: string;

  // 발신/수신
  from: {
    agentId: string;
    role: ExtendedTeamRole;
  };
  to: {
    agentId: string;
    role: ExtendedTeamRole;
  };

  // 메시지 내용
  type: 'request' | 'response' | 'proposal' | 'question' | 'decision';
  content: {
    subject: string;
    body: string;
    attachments?: Attachment[];
  };

  // 컨텍스트
  context: {
    jiraKey?: string;
    patternInstanceId?: string;
    conversationId: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  };

  // 승인/검토
  requiresApproval: boolean;
  approvedBy?: string;

  // 메타데이터
  metadata: {
    estimatedTime: number;
    actualTime?: number;
    tokensUsed: number;
  };
}

interface Attachment {
  type: 'spec' | 'design' | 'code' | 'test' | 'log';
  format: 'markdown' | 'json' | 'yaml' | 'url';
  content: string;
  description: string;
}
```

### 2.2 협업 시나리오: 로그인 기능 개발

```
┌──────────────────────────────────────────────────────────────────────┐
│              Agent Collaboration: Login Feature Implementation       │
└──────────────────────────────────────────────────────────────────────┘

Trigger: "로그인 기능 개발 필요" (Jira PROJ-123)

Step 1: PM Agent 분석
─────────────────────
🤖 PM Agent → System
"PROJ-123 분석 완료:
• 비즈니스 목표: 사용자 참여도 20% 향상
• MVP 범위: 이메일/비밀번호 로그인
• OUT OF SCOPE: 소셜 로그인 (Phase 2)
• 우선순위: P1
• 타임라인: 1주일"

Step 2: 아키텍처 설계
─────────────────────
🤖 PM Agent → System Planner Agent
"PROJ-123 기술 검토 요청"

🤖 System Planner Agent → PM Agent
"아키텍처 제안:
• Auth: JWT (Access + Refresh Token)
• DB: users 테이블 컬럼 추가
• API: POST /api/v1/auth/login
• Security: bcrypt 해싱, rate limiting
• Est: 3 SP"

Step 3: UX 설계
───────────────
🤖 PM Agent → UX Designer Agent
"로그인 UX 요청"

🤖 UX Designer Agent → PM Agent
"UX Flow 제안:
• 3단계: 이메일 입력 → 비밀번호 입력 → 성공/실패
• Error: inline validation + 토스트 메시지
• Remember me 옵션
• Mobile-first 디자인"

Step 4: 개발
────────────
🤖 System Planner Agent → Backend Dev Agent
"API 구현 요청: auth/login"

🤖 Backend Dev Agent
"[코드 구현 중...]
✅ API 구현 완료
✅ DB 마이그레이션 생성
✅ 단위 테스트 작성"

🤖 UX Designer Agent → UI Dev Agent
"디자인 핸드오프"

🤖 UI Dev Agent
"[코드 구현 중...]
✅ 로그인 폼 구현
✅ Validation 로직
✅ API 연동"

Step 5: QA
──────────
🤖 Backend Dev Agent + UI Dev Agent → QA Agent
"테스트 요청"

🤖 QA Agent
"테스트 결과:
✅ Happy path 통과
⚠️ Edge case 발견:
  - 특수문자 이메일 처리
  - 비밀번호 50자 이상 입력 시 오류
🔧 수정 요청"

Step 6: 배포
────────────
🤖 QA Agent → Ops Agent
"배포 승인 (int 환경)"

🤖 Ops Agent
"✅ int 환경 배포 완료
📊 모니터링 대시보드: [링크]"

Step 7: 완료
────────────
🤖 All Agents → Real Team
─────────────────────────
📋 PROJ-123 완료 보고서

완료된 작업:
✅ 로그인 API (Backend Dev Agent)
✅ 로그인 UI (UI Dev Agent)
✅ 테스트 (QA Agent)
✅ int 배포 (Ops Agent)

문서:
• API 명세
• DB 스키마 변경사항
• 테스트 케이스

검토 필요:
⚠️ 실제 팀원 승인 필요
[승인 버튼] [수정 요청]
```

---

## 3. 구현 방법

### 3.1 OpenClaw Agent 설정

```yaml
# infrastructure/openclaw/agents/pm-agent.yml

name: pm-agent
role: product-manager
model: anthropic/claude-3-sonnet

system_prompt: |
  당신은 RTB(부동산 테크) 회사의 프로덕트 매니저입니다.

  핵심 책임:
  1. 비즈니스 가치 극대화
  2. 사용자 니즈 이해
  3. 우선순위 설정
  4. 이해관계자 커뮤니케이션

  의사결정 기준:
  - ROI (Return on Investment)
  - 사용자 영향도
  - 기술적 위험
  - 시장 타이밍

  RTB 도메인 지식:
  - 빌딩(obj), 매물(prd), 딜(gtd) 도메인
  - 부동산 업계 특성
  - B2B/B2C 사용자 구분

actions:
  - name: analyze_requirement
    description: 요구사항 분석

  - name: set_priority
    description: 우선순위 설정

  - name: define_scope
    description: 범위 정의

  - name: request_clarification
    description: 명확화 요청

triggers:
  - type: jira_issue_created
    filter: "labels contains 'needs-pm-review'"

  - type: slack_mention
    filter: '@pm-agent'

collaboration:
  handoff:
    - to: system-planner-agent
      when: 'technical-feasibility-needed'

    - to: ux-designer-agent
      when: 'user-flow-required'

memory:
  context_window: 10
  persist_conversations: true

integrations:
  - jira
  - slack
  - notion
```

### 3.2 Agent Orchestrator

```typescript
// packages/workflow-engine/src/agents/openclaw-orchestrator.ts

import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('openclaw-orchestrator');

/**
 * OpenClaw Agent Orchestrator
 * Agent 간 협업을 조율
 */
export class OpenClawAgentOrchestrator {
  private agents: Map<string, OpenClawAgent> = new Map();
  private activeConversations: Map<string, AgentConversation> = new Map();

  /**
   * 에이전트 등록
   */
  registerAgent(agent: OpenClawAgent): void {
    this.agents.set(agent.id, agent);
    logger.info({ agentId: agent.id, role: agent.role }, 'Agent registered');
  }

  /**
   * 협업 세션 시작
   */
  async startCollaboration(
    initiatorAgentId: string,
    context: {
      jiraKey: string;
      objective: string;
      involvedRoles: ExtendedTeamRole[];
    }
  ): Promise<AgentConversation> {
    const conversationId = generateId('conv');

    // 관련 에이전트 찾기
    const involvedAgents = context.involvedRoles
      .map((role) => this.findAgentByRole(role))
      .filter(Boolean) as OpenClawAgent[];

    const conversation: AgentConversation = {
      id: conversationId,
      jiraKey: context.jiraKey,
      objective: context.objective,
      participants: involvedAgents.map((a) => a.id),
      messages: [],
      status: 'active',
      startedAt: new Date(),
    };

    this.activeConversations.set(conversationId, conversation);

    // 초기 메시지 브로드캐스트
    await this.broadcastMessage(conversationId, {
      from: initiatorAgentId,
      type: 'init',
      content: {
        subject: `Collaboration started: ${context.objective}`,
        body: context.objective,
      },
      context: {
        conversationId,
        jiraKey: context.jiraKey,
        priority: 'medium',
      },
      requiresApproval: false,
    });

    return conversation;
  }

  /**
   * 메시지 전송
   */
  async sendMessage(conversationId: string, message: AgentMessage): Promise<void> {
    const conversation = this.activeConversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // 메시지 저장
    conversation.messages.push(message);

    // 수신 에이전트에게 전달
    const targetAgent = this.agents.get(message.to.agentId);
    if (targetAgent) {
      await targetAgent.receiveMessage(message);
    }

    // 승인이 필요한 경우 실제 사용자에게 알림
    if (message.requiresApproval) {
      await this.requestHumanApproval(conversationId, message);
    }
  }

  /**
   * 브로드캐스트
   */
  async broadcastMessage(conversationId: string, message: Omit<AgentMessage, 'to'>): Promise<void> {
    const conversation = this.activeConversations.get(conversationId);
    if (!conversation) return;

    for (const agentId of conversation.participants) {
      await this.sendMessage(conversationId, {
        ...message,
        to: {
          agentId,
          role: this.agents.get(agentId)!.role,
        },
      });
    }
  }

  /**
   * 협업 완료
   */
  async completeCollaboration(conversationId: string, summary: string): Promise<void> {
    const conversation = this.activeConversations.get(conversationId);
    if (!conversation) return;

    conversation.status = 'completed';
    conversation.completedAt = new Date();
    conversation.summary = summary;

    // 결과를 실제 팀원에게 알림
    await this.notifyRealTeam(conversation);

    logger.info({ conversationId, summary }, 'Collaboration completed');
  }

  /**
   * 인간 승인 요청
   */
  private async requestHumanApproval(conversationId: string, message: AgentMessage): Promise<void> {
    // Slack DM 또는 이메일로 승인 요청
    await notifyOpenClaw({
      eventType: 'agent_approval_needed',
      context: {
        conversationId,
        message: message.content,
        fromAgent: message.from.agentId,
      },
    });
  }

  /**
   * 실제 팀원에게 결과 알림
   */
  private async notifyRealTeam(conversation: AgentConversation): Promise<void> {
    const report = this.generateReport(conversation);

    await notifyOpenClaw({
      eventType: 'agent_collaboration_complete',
      context: {
        jiraKey: conversation.jiraKey,
        summary: conversation.summary,
        report,
        approvalUrl: `${DASHBOARD_URL}/agent-collaboration/${conversation.id}`,
      },
    });
  }

  private findAgentByRole(role: ExtendedTeamRole): OpenClawAgent | undefined {
    return Array.from(this.agents.values()).find((a) => a.role === role);
  }

  private generateReport(conversation: AgentConversation): string {
    // 대화 내용을 보고서로 정리
    return conversation.messages
      .map((m) => `[${m.from.agentId}] ${m.content.subject}\n${m.content.body}`)
      .join('\n\n---\n\n');
  }
}
```

---

## 4. 사용 예시

### 4.1 Slack에서 Agent 호출

```
#agent-collab PROJ-123

[Slack Thread]
👤 사용자: "@openclaw #agent-collab PROJ-123"

🤖 OpenClaw: "PROJ-123에 대해 Agent 협업을 시작합니다..."

[내부적으로 Agent들이 협업 진행]

🤖 OpenClaw (30분 후):
"✅ Agent 협업 완료

📋 결과 요약:
• PM Agent: MVP 범위 확정 (이메일 로그인만)
• System Planner Agent: JWT 인증 아키텍처 제안
• UX Agent: 3단계 로그인 플로우 설계
• Backend Agent: API 명세 및 DB 스키마
• Frontend Agent: 컴포넌트 구조 제안

📊 예상 작업량: 3 SP
⏱️ 예상 소요: 3일

상세 보고서: [링크]

승인하시겠습니까?
[✅ 승인] [✏️ 수정] [❌ 거부]"
```

### 4.2 Jira 자동화

```yaml
# Jira Automation Rule

when: issue created
if: label contains "agent-collab"
then:
  - call-webhook:
      url: '${RTB_WEBHOOK_URL}/api/agents/collaboration'
      body: |
        {
          "jiraKey": "{{issue.key}}",
          "summary": "{{issue.summary}}",
          "description": "{{issue.description}}",
          "involvedRoles": ["pm", "system-planner", "developer"]
        }
  - add-comment:
      text: '🤖 Agent 협업이 시작되었습니다. 결과를 기다려주세요...'
```

---

## 5. 이점

### 5.1 실제 팀원 입장

| 이전                         | 이후                           |
| ---------------------------- | ------------------------------ |
| 2시간 미팅으로 요구사항 정리 | Agent가 30분 내 제안, 5분 리뷰 |
| 모든 팀원 동시 참여 필요     | 각자 편한 시간에 검토          |
| 밤늦게까지 회의              | Agent가 24/7 작업              |
| 커뮤니케이션 비용            | 문서화된 제안서로 시작         |

### 5.2 Agent 협업 결과물

````markdown
# PROJ-123: 로그인 기능

## 🤖 Agent 협업 결과

### PM Agent 분석

- 비즈니스 목표: 사용자 참여도 20% 향상
- MVP 범위: 이메일/비밀번호 로그인
- 타임라인: 1주일

### System Planner Agent 설계

```yaml
Auth: JWT (Access + Refresh)
API: POST /api/v1/auth/login
DB: ALTER TABLE users ADD COLUMN password_hash
Security: bcrypt, rate limiting
```
````

### UX Agent 설계

[와이어프레임 이미지]

### Dev Agents 구현

[코드 링크]

---

## ✅ 실제 팀원 승인

- [x] PM: @real-pm
- [x] Tech Lead: @real-tech-lead
- [ ] QA: @real-qa (pending)

[수정 요청] [승인]

```

---

이 방식이면 어떨까요? 실제 팀원들이 "의사결정을 위한 준비"를 Agent가 대신하고, 사람들은 "검토와 승인"에만 집중할 수 있습니다.
```
