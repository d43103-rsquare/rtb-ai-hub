# OpenClaw Gateway 연동 가이드

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway 연동                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐          ┌──────────────────────────────┐    │
│  │   Slack      │◀────────▶│      OpenClaw Gateway        │    │
│  │   (User)     │  events  │      (Port: 3000)            │    │
│  └──────────────┘          └──────────────┬───────────────┘    │
│                                            │                    │
│                          ┌─────────────────┼─────────────────┐  │
│                          │                 │                 │  │
│                    hooks │                 │ skills          │  │
│                          │                 │ (exec curl)     │  │
│                          ▼                 ▼                 │  │
│  ┌─────────────────────────────────────────────────────────┐ │  │
│  │                   RTB AI Hub                            │ │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │  │
│  │  │  webhook     │  │  Coordinator│  │  Workflow    │   │ │  │
│  │  │  listener    │  │  API        │  │  Engine      │   │ │  │
│  │  │  :4000       │  │  :4000      │  │              │   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │ │  │
│  │                                                         │ │  │
│  │  1. Pattern 완료 ──▶ OpenClac hooks (Slack 알림)      │ │  │
│  │  2. Translation 완료 ──▶ OpenClaw hooks (DM 전송)     │ │  │
│  │  3. Wiki 제안 ──▶ OpenClaw hooks (Thread 답장)        │ │  │
│  └─────────────────────────────────────────────────────────┘ │  │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Gateway 설정

### 1.1 openclaw.json 업데이트

```json
{
  "gateway": {
    "mode": "http",
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "mode": "token"
    }
  },
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "handlers": {
      "rtb-pattern-completed": {
        "channel": "slack",
        "template": "pattern-completed"
      },
      "rtb-translation-ready": {
        "channel": "slack",
        "template": "translation-ready"
      },
      "rtb-wiki-suggested": {
        "channel": "slack",
        "template": "wiki-suggested"
      }
    }
  },
  "channels": {
    "slack": {
      "enabled": true,
      "token": "${SLACK_BOT_TOKEN}",
      "dm": {
        "enabled": true,
        "policy": "pairing"
      }
    }
  },
  "skills": {
    "entries": {
      "rtb-hub": {
        "enabled": true,
        "env": {
          "RTB_WEBHOOK_URL": "http://webhook-listener:4000",
          "OPENCLAW_GATEWAY_URL": "http://openclaw-gateway:3000"
        }
      }
    }
  }
}
```

### 1.2 환경 변수

```bash
# .env
OPENCLAW_HOOKS_TOKEN=rtb-ai-hub-openclaw-hooks-token-2026
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
OPENCLAW_GATEWAY_URL=http://localhost:3000
```

## 2. RTB Hub → OpenClaw Gateway 연동

### 2.1 Gateway Client 구현

```typescript
// packages/workflow-engine/src/utils/openclaw-gateway.ts

import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('openclaw-gateway');

export interface OpenClawGatewayConfig {
  baseUrl: string;
  hooksToken: string;
}

export interface GatewayHookPayload {
  event: string;
  channel: string;
  target?: {
    userId?: string;
    channelId?: string;
    threadTs?: string;
  };
  data: Record<string, unknown>;
}

export class OpenClawGatewayClient {
  private config: OpenClawGatewayConfig;

  constructor(config: OpenClawGatewayConfig) {
    this.config = config;
  }

  /**
   * Gateway hooks로 이벤트 전송
   */
  async sendHook(payload: GatewayHookPayload): Promise<void> {
    const url = `${this.config.baseUrl}/hooks`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.hooksToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gateway hook failed: ${response.status}`);
      }

      logger.info({ event: payload.event }, 'Gateway hook sent successfully');
    } catch (error) {
      logger.error({ error, event: payload.event }, 'Failed to send gateway hook');
      throw error;
    }
  }

  /**
   * 패턴 완료 알림
   */
  async notifyPatternCompleted(
    patternInstance: PatternInstance,
    targetUserId: string
  ): Promise<void> {
    await this.sendHook({
      event: 'rtb-pattern-completed',
      channel: 'slack',
      target: { userId: targetUserId },
      data: {
        patternId: patternInstance.patternId,
        patternName: this.getPatternName(patternInstance.patternId),
        status: patternInstance.status,
        outputs: patternInstance.outputs,
        participants: patternInstance.participants,
      },
    });
  }

  /**
   * 번역 완료 알림
   */
  async notifyTranslationReady(
    translation: TranslationResult,
    targetUserId: string,
    options: { showOriginal?: boolean } = {}
  ): Promise<void> {
    await this.sendHook({
      event: 'rtb-translation-ready',
      channel: 'slack',
      target: { userId: targetUserId },
      data: {
        sourceRole: translation.sourceRole,
        targetRole: translation.targetRole,
        originalText: translation.input.raw,
        translatedText: translation.output.raw,
        quality: translation.quality,
        showOriginal: options.showOriginal ?? true,
      },
    });
  }

  /**
   * Wiki 제안 알림
   */
  async notifyWikiSuggested(
    suggestion: WikiSuggestion,
    targetChannelId: string,
    threadTs?: string
  ): Promise<void> {
    await this.sendHook({
      event: 'rtb-wiki-suggested',
      channel: 'slack',
      target: {
        channelId: targetChannelId,
        threadTs,
      },
      data: {
        documentTitle: suggestion.document.title,
        summary: suggestion.document.summary,
        relevanceScore: suggestion.document.relevanceScore,
        urgency: suggestion.presentation.urgency,
        keySections: suggestion.document.keySections,
        reasoning: suggestion.reasoning,
      },
    });
  }

  /**
   * 온보딩 진행 알림
   */
  async notifyOnboardingProgress(
    plan: OnboardingPlan,
    stepCompleted: OnboardingStep
  ): Promise<void> {
    await this.sendHook({
      event: 'rtb-onboarding-progress',
      channel: 'slack',
      target: { userId: plan.userId },
      data: {
        planId: plan.id,
        stepName: stepCompleted.name,
        stepType: stepCompleted.type,
        overallProgress: plan.progress.overallProgress,
        nextStep: plan.phases.flatMap((p) => p.steps).find((s) => s.status === 'not-started')?.name,
      },
    });
  }

  private getPatternName(patternId: string): string {
    const names: Record<string, string> = {
      'requirement-clarification': '요구사항 명확화',
      'design-review': '디자인 리뷰',
      'implementation-sync': '구현 동기화',
      'testing-handoff': '테스트 핸드오프',
    };
    return names[patternId] || patternId;
  }
}

// 싱글톤 인스턴스
export const openclawGateway = new OpenClawGatewayClient({
  baseUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3000',
  hooksToken: process.env.OPENCLAW_HOOKS_TOKEN || '',
});
```

### 2.2 Pattern Engine 통합

```typescript
// packages/workflow-engine/src/communication/patterns/pattern-engine.ts

import { openclawGateway } from '../../utils/openclaw-gateway';

export class PatternEngine {
  // ... 기존 코드

  /**
   * 단계 완료 시 Gateway 알림
   */
  private async notifyPhaseCompletion(
    instance: PatternInstance,
    participant: PatternParticipant
  ): Promise<void> {
    if (!participant.userId) return;

    try {
      await openclawGateway.notifyPatternCompleted(instance, participant.userId);
    } catch (error) {
      logger.warn({ error }, 'Failed to send gateway notification');
      // Gateway 실패해도 패턴 진행은 계속
    }
  }

  /**
   * 최종 완료 시 모든 참여자에게 알림
   */
  private async notifyCompletion(instance: PatternInstance): Promise<void> {
    for (const participant of instance.participants) {
      if (participant.userId) {
        await this.notifyPhaseCompletion(instance, participant);
      }
    }
  }
}
```

## 3. 사용 예시

### 3.1 Slack에서 패턴 시작

**사용자:** "@openclaw PROJ-123 요구사항 정리해줘"

**OpenClaw Skill 동작:**

```bash
# 1. 패턴 인스턴스 생성
curl -X POST "${RTB_WEBHOOK_URL}/api/coordinator/patterns/instances" \
  -d '{
    "patternId": "requirement-clarification",
    "context": {
      "jiraKey": "PROJ-123",
      "slackChannelId": "C123456",
      "slackThreadTs": "1234567890.123456"
    }
  }'

# 응답: { "id": "pattern_xxx", "status": "initiated" }
```

**RTB Hub 후속 동작:**

```typescript
// 패턴 단계 진행 시 Gateway로 알림
await openclawGateway.notifyPatternCompleted(patternInstance, 'pm@company.com');
```

**Slack 결과:**

```
🎯 요구사항 명확화 패턴 완료

📋 결과 요약:
• 비즈니스 목표: 사용자 로그인률 20% 향상
• 기술 명세: JWT 인증, OAuth2 연동
• 작업량: 3 SP

👥 다음 단계:
@developer 개발 시작 준비해주세요!
```

### 3.2 실시간 번역

**사용자 (PM):** "@openclaw 개발자한테 이 내용 전달해줘: 로그인 기능 MVP 범위로 이메일만 지원"

**OpenClaw Skill:**

```bash
curl -X POST "${RTB_WEBHOOK_URL}/api/coordinator/translate" \
  -d '{
    "sourceRole": "pm",
    "targetRole": "backend-developer",
    "content": "로그인 기능 MVP 범위로 이메일만 지원"
  }'
```

**RTB Hub → Gateway:**

```typescript
await openclawGateway.notifyTranslationReady(translationResult, 'dev@company.com', {
  showOriginal: true,
});
```

**개발자 DM:**

```
🔄 PM 메시지 번역

💬 원문:
"로그인 기능 MVP 범위로 이메일만 지원"

📝 개발자용 번역:
"로그인 MVP 구현:
• 인증 방식: JWT (email/password only)
• 소셜 로그인: OUT OF SCOPE (향후 고려)
• API: POST /api/v1/auth/login
• 데이터: users 테이블 (email, password_hash)
• 예상 작업량: 2-3 SP"

📊 번역 품질: 92%
```

## 4. 로컬 개발 설정

### 4.1 Docker Compose 추가

```yaml
# docker-compose.yml (기존에 openclaw가 있다면 수정)

services:
  openclaw-gateway:
    image: openclaw/gateway:latest
    ports:
      - '3000:3000'
    environment:
      - OPENCLAW_CONFIG=/config/openclaw.json
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - OPENCLAW_HOOKS_TOKEN=${OPENCLAW_HOOKS_TOKEN}
    volumes:
      - ./infrastructure/openclaw:/config:ro
      - ./infrastructure/openclaw/skills:/skills:ro
    networks:
      - rtb-network
    depends_on:
      - webhook-listener

  webhook-listener:
    # 기존 설정
    environment:
      - OPENCLAW_GATEWAY_URL=http://openclaw-gateway:3000
      - OPENCLAW_HOOKS_TOKEN=${OPENCLAW_HOOKS_TOKEN}
```

### 4.2 테스트

```bash
# 1. Gateway hooks 테스트
curl -X POST http://localhost:3000/hooks \
  -H "Authorization: Bearer ${OPENCLAW_HOOKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "rtb-test",
    "channel": "slack",
    "target": {"userId": "test@company.com"},
    "data": {"message": "Hello from RTB Hub!"}
  }'

# 2. RTB Hub API 테스트
curl -X POST http://localhost:4000/api/coordinator/translate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceRole": "pm",
    "targetRole": "backend-developer",
    "content": "로그인 기능 만들어주세요"
  }'
```

## 5. 모니터링

### 5.1 Gateway 로그

```bash
# Gateway 로그 확인
docker-compose logs -f openclaw-gateway

# Hooks 전송 성공률 확인
docker-compose exec openclaw-gateway \
  curl -s http://localhost:3000/metrics | grep rtb_hooks
```

### 5.2 메트릭

```
# Prometheus 메트릭 (Gateway가 노출)
rtb_hooks_sent_total{event="rtb-pattern-completed"} 42
rtb_hooks_sent_total{event="rtb-translation-ready"} 128
rtb_hooks_failed_total 3
rtb_hook_latency_seconds 0.234
```

## 요약

Gateway를 활용하면:

1. **실시간 양방향 통신**: RTB Hub → OpenClaw → Slack
2. **템플릿 기반 메시지**: 일관된 형식의 알림
3. **DM/Channel 모두 지원**: 개인별 알림 + 채널 공유
4. **Threading 지원**: 대화 맥락 유지
5. **실패 격리**: Gateway 실패해도 RTB Hub 동작 unaffected

시작하시겠습니까? Gateway 설정부터 도와드릴 수 있습니다.
