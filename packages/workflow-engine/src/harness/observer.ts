/**
 * Observer — 에이전트 실행 관찰 및 비정상 패턴 감지
 *
 * - 구조화 로깅
 * - 토큰 사용량 추적
 * - 비정상 패턴 감지 (무한 루프, 토큰 급증, 타임아웃 접근)
 * - WebSocket 브로드캐스트
 */

import type {
  AgentPersona,
  ObserverEvent,
  AnomalyType,
  DebateTurn,
} from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('observer');

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AnomalyAlert = {
  type: AnomalyType;
  sessionId: string;
  message: string;
  severity: 'warning' | 'critical';
  data: Record<string, unknown>;
  timestamp: string;
};

export type EventListener = (event: ObserverEvent) => void;
export type AnomalyListener = (alert: AnomalyAlert) => void;

// ─── Observer ──────────────────────────────────────────────────────────────────

export class Observer {
  private sessionId: string;
  private events: ObserverEvent[] = [];
  private turnHistory: Array<{ agent: AgentPersona; contentHash: string; tokens: number }> = [];
  private eventListeners: EventListener[] = [];
  private anomalyListeners: AnomalyListener[] = [];
  private budgetTotalUsd: number;
  private timeoutMs: number;
  private startedAt: number;

  constructor(sessionId: string, budgetTotalUsd: number, timeoutMs: number) {
    this.sessionId = sessionId;
    this.budgetTotalUsd = budgetTotalUsd;
    this.timeoutMs = timeoutMs;
    this.startedAt = Date.now();
  }

  /** Register a listener for all events */
  onEvent(listener: EventListener): void {
    this.eventListeners.push(listener);
  }

  /** Register a listener for anomaly alerts */
  onAnomaly(listener: AnomalyListener): void {
    this.anomalyListeners.push(listener);
  }

  /** Emit an event */
  private emit(event: ObserverEvent): void {
    this.events.push(event);
    logger.info({ event }, 'Observer event');
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ err }, 'Event listener error');
      }
    }
  }

  /** Emit an anomaly alert */
  private emitAnomaly(alert: AnomalyAlert): void {
    logger.warn({ alert }, 'Anomaly detected');
    for (const listener of this.anomalyListeners) {
      try {
        listener(alert);
      } catch (err) {
        logger.error({ err }, 'Anomaly listener error');
      }
    }
  }

  /** Record turn start */
  onTurnStart(agent: AgentPersona, turnNumber: number): void {
    this.emit({
      type: 'turn_start',
      sessionId: this.sessionId,
      agent,
      data: { turnNumber },
      timestamp: new Date().toISOString(),
    });
  }

  /** Record turn end and detect anomalies */
  onTurnEnd(turn: DebateTurn, accumulatedCostUsd: number): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];

    this.emit({
      type: 'turn_end',
      sessionId: this.sessionId,
      agent: turn.agent,
      data: {
        turnNumber: turn.turnNumber,
        type: turn.type,
        tokensUsed: turn.tokensUsed,
        durationMs: turn.durationMs,
        model: turn.model,
      },
      timestamp: new Date().toISOString(),
    });

    // Track for anomaly detection
    const contentHash = simpleHash(turn.content);
    const totalTokens = turn.tokensUsed.input + turn.tokensUsed.output;
    this.turnHistory.push({ agent: turn.agent, contentHash, tokens: totalTokens });

    // Detect: infinite loop (same content 3+ times)
    const loopAlert = this.detectInfiniteLoop(contentHash, turn.agent);
    if (loopAlert) alerts.push(loopAlert);

    // Detect: token spike (> 2x average)
    const spikeAlert = this.detectTokenSpike(totalTokens);
    if (spikeAlert) alerts.push(spikeAlert);

    // Detect: timeout approaching (> 80%)
    const timeoutAlert = this.detectTimeoutApproaching();
    if (timeoutAlert) alerts.push(timeoutAlert);

    // Detect: cost spike (> 80% of budget)
    const costAlert = this.detectCostSpike(accumulatedCostUsd);
    if (costAlert) alerts.push(costAlert);

    for (const alert of alerts) {
      this.emitAnomaly(alert);
    }

    return alerts;
  }

  /** Record gate result */
  onGateResult(gate: string, passed: boolean, durationMs: number): void {
    this.emit({
      type: 'gate_result',
      sessionId: this.sessionId,
      data: { gate, passed, durationMs },
      timestamp: new Date().toISOString(),
    });
  }

  /** Emit budget warning */
  onBudgetWarning(message: string, data: Record<string, unknown>): void {
    this.emit({
      type: 'budget_warning',
      sessionId: this.sessionId,
      data: { message, ...data },
      timestamp: new Date().toISOString(),
    });
  }

  /** Get all recorded events */
  getEvents(): readonly ObserverEvent[] {
    return this.events;
  }

  // ─── Anomaly Detection ───────────────────────────────────────────────────────

  private detectInfiniteLoop(contentHash: string, agent: AgentPersona): AnomalyAlert | null {
    const recentSame = this.turnHistory
      .filter((t) => t.agent === agent && t.contentHash === contentHash);

    if (recentSame.length >= 3) {
      return {
        type: 'infinite-loop',
        sessionId: this.sessionId,
        message: `Agent ${agent} has repeated the same content ${recentSame.length} times`,
        severity: 'critical',
        data: { agent, repetitions: recentSame.length },
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  private detectTokenSpike(currentTokens: number): AnomalyAlert | null {
    if (this.turnHistory.length < 3) return null;

    const previousTokens = this.turnHistory.slice(0, -1).map((t) => t.tokens);
    const avg = previousTokens.reduce((sum, t) => sum + t, 0) / previousTokens.length;

    if (currentTokens > avg * 2) {
      return {
        type: 'token-spike',
        sessionId: this.sessionId,
        message: `Token spike detected: ${currentTokens} tokens (avg: ${Math.round(avg)})`,
        severity: 'warning',
        data: { current: currentTokens, average: Math.round(avg), ratio: currentTokens / avg },
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  private detectTimeoutApproaching(): AnomalyAlert | null {
    const elapsed = Date.now() - this.startedAt;
    const ratio = elapsed / this.timeoutMs;

    if (ratio >= 0.8) {
      return {
        type: 'timeout-approaching',
        sessionId: this.sessionId,
        message: `Timeout approaching: ${Math.round(ratio * 100)}% of ${this.timeoutMs}ms elapsed`,
        severity: ratio >= 0.95 ? 'critical' : 'warning',
        data: { elapsed, timeout: this.timeoutMs, percent: Math.round(ratio * 100) },
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  private detectCostSpike(accumulatedCostUsd: number): AnomalyAlert | null {
    const ratio = accumulatedCostUsd / this.budgetTotalUsd;

    if (ratio >= 0.8) {
      return {
        type: 'cost-spike',
        sessionId: this.sessionId,
        message: `Cost at ${Math.round(ratio * 100)}% of budget ($${accumulatedCostUsd.toFixed(4)} / $${this.budgetTotalUsd})`,
        severity: ratio >= 0.95 ? 'critical' : 'warning',
        data: { accumulated: accumulatedCostUsd, budget: this.budgetTotalUsd, percent: Math.round(ratio * 100) },
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }
}

/** Simple string hash for content comparison */
function simpleHash(str: string): string {
  let hash = 0;
  const trimmed = str.slice(0, 500); // only compare first 500 chars
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

export function createObserver(
  sessionId: string,
  budgetTotalUsd: number,
  timeoutMs: number
): Observer {
  return new Observer(sessionId, budgetTotalUsd, timeoutMs);
}
