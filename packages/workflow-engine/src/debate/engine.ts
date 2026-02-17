/**
 * Debate Engine — 핵심 토론 오케스트레이션
 *
 * 알고리즘:
 * 1. 중재자(PM)가 문제 프레이밍 + 성공 기준 제시
 * 2. 각 참여 에이전트가 순서대로 자기 역할의 관점으로 제안
 * 3. 합의 감지 → 미합의 시 반론/보완 라운드 반복
 * 4. 교착 상태 감지 → 중재자가 최종 결정
 * 5. 합의 도달 → 중재자가 요약 + 아티팩트 추출
 * 6. 전체 토론 내용 DB 저장 (의사결정 추적)
 */

import type {
  AgentPersona,
  DebateConfig,
  DebateSession,
  DebateTurn,
  DebateTurnType,
} from '@rtb-ai-hub/shared';
import { generateId, createLogger } from '@rtb-ai-hub/shared';
import { AnthropicClient } from '../clients/anthropic';
import { ExecutionGuard, createExecutionGuard } from '../harness/execution-guard';
import { Observer, createObserver } from '../harness/observer';
import { ConsensusDetector, createConsensusDetector } from './consensus-detector';
import { executeTurn } from './turn-executor';
import { DebateStore } from './debate-store';

const logger = createLogger('debate-engine');

export type DebateEngineOptions = {
  aiClient: AnthropicClient;
  store?: DebateStore;
  onTurnComplete?: (turn: DebateTurn, session: DebateSession) => void;
};

export class DebateEngine {
  private aiClient: AnthropicClient;
  private store?: DebateStore;
  private onTurnComplete?: (turn: DebateTurn, session: DebateSession) => void;

  constructor(options: DebateEngineOptions) {
    this.aiClient = options.aiClient;
    this.store = options.store;
    this.onTurnComplete = options.onTurnComplete;
  }

  /** Run a full debate session */
  async run(config: DebateConfig, workflowExecutionId: string): Promise<DebateSession> {
    const sessionId = generateId('debate');
    const startTime = Date.now();

    // Initialize harness
    const guard = createExecutionGuard(sessionId, {
      maxTotalCostUsd: config.budgetUsd ?? 5,
      maxDebateTurns: config.maxTurns,
    });
    const observer = createObserver(
      sessionId,
      config.budgetUsd ?? 5,
      guard.getState().budget.debateTimeoutMs
    );
    const consensusDetector = createConsensusDetector();

    // Initialize session
    const session: DebateSession = {
      id: sessionId,
      workflowExecutionId,
      config,
      turns: [],
      totalTokens: { input: 0, output: 0 },
      totalCostUsd: 0,
      durationMs: 0,
      createdAt: new Date().toISOString(),
    };

    // Save initial session
    if (this.store) {
      await this.store.save(session);
    }

    logger.info(
      {
        sessionId,
        topic: config.topic,
        participants: config.participants,
        moderator: config.moderator,
        maxTurns: config.maxTurns,
      },
      'Debate started'
    );

    try {
      // Phase 1: Moderator frames the problem
      const framingTurn = await this.executeTurnWithGuard(
        {
          turnNumber: 1,
          agent: config.moderator,
          turnType: 'proposal',
          context: config.context,
          previousTurns: [],
          topic: config.topic,
        },
        guard,
        observer,
        session
      );
      session.turns.push(framingTurn);

      // Phase 2: Each participant proposes
      const otherParticipants = config.participants.filter((p) => p !== config.moderator);
      for (const agent of otherParticipants) {
        const turn = await this.executeTurnWithGuard(
          {
            turnNumber: session.turns.length + 1,
            agent,
            turnType: 'proposal',
            context: config.context,
            previousTurns: session.turns,
            topic: config.topic,
          },
          guard,
          observer,
          session
        );
        session.turns.push(turn);

        // Check guard violations
        const guardViolation = this.checkGuardViolations(guard);
        if (guardViolation) {
          session.outcome = {
            status: guardViolation === 'budget' ? 'budget-exceeded' : 'max-turns-reached',
            decision: 'Debate stopped due to guard violation',
            artifacts: this.collectArtifacts(session.turns),
          };
          break;
        }
      }

      // Phase 3: Iteration rounds (counter/supplement until consensus)
      if (!session.outcome) {
        await this.iterateUntilConsensus(
          session,
          config,
          guard,
          observer,
          consensusDetector,
          otherParticipants
        );
      }

      // Finalize
      session.durationMs = Date.now() - startTime;
      if (this.store && session.outcome) {
        await this.store.complete(sessionId, session.outcome, session.durationMs);
      }

      logger.info(
        {
          sessionId,
          status: session.outcome?.status,
          turns: session.turns.length,
          cost: session.totalCostUsd.toFixed(4),
          durationMs: session.durationMs,
        },
        'Debate completed'
      );
    } catch (error) {
      session.durationMs = Date.now() - startTime;
      session.outcome = {
        status: 'error',
        decision: 'Debate failed due to an error',
        artifacts: this.collectArtifacts(session.turns),
        error: error instanceof Error ? error.message : String(error),
      };

      if (this.store) {
        await this.store.complete(sessionId, session.outcome, session.durationMs);
      }

      logger.error({ error, sessionId }, 'Debate failed');
    }

    return session;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private async iterateUntilConsensus(
    session: DebateSession,
    config: DebateConfig,
    guard: ExecutionGuard,
    observer: Observer,
    consensusDetector: ConsensusDetector,
    participants: AgentPersona[]
  ): Promise<void> {
    let roundNumber = 0;
    const maxRounds = Math.ceil((config.maxTurns - session.turns.length) / participants.length);

    while (roundNumber < maxRounds) {
      roundNumber++;

      // Check consensus before each round
      const consensus = consensusDetector.analyze(session.turns, config.participants);

      if (consensus.status === 'consensus') {
        // Moderator summarizes
        const consensusTurn = await this.executeTurnWithGuard(
          {
            turnNumber: session.turns.length + 1,
            agent: config.moderator,
            turnType: 'consensus',
            context: config.context,
            previousTurns: session.turns,
            topic: config.topic,
          },
          guard,
          observer,
          session
        );
        session.turns.push(consensusTurn);

        session.outcome = {
          status: 'consensus',
          decision: consensusTurn.content,
          artifacts: this.collectArtifacts(session.turns),
        };
        return;
      }

      if (consensus.isStalemate) {
        // Moderator makes final decision
        const decisionTurn = await this.executeTurnWithGuard(
          {
            turnNumber: session.turns.length + 1,
            agent: config.moderator,
            turnType: 'decision',
            context: config.context,
            previousTurns: session.turns,
            topic: config.topic,
          },
          guard,
          observer,
          session
        );
        session.turns.push(decisionTurn);

        const dissentingViews = Object.entries(consensus.stances)
          .filter(([, stance]) => stance === 'disagree')
          .map(([agent]) => {
            const lastTurn = session.turns
              .filter((t) => t.agent === agent)
              .pop();
            return { agent: agent as AgentPersona, view: lastTurn?.content.slice(0, 500) ?? '' };
          });

        session.outcome = {
          status: 'moderator-decided',
          decision: decisionTurn.content,
          artifacts: this.collectArtifacts(session.turns),
          dissentingViews,
        };
        return;
      }

      // Each participant supplements or counters
      for (const agent of participants) {
        const turnType: DebateTurnType =
          consensus.stances[agent] === 'disagree' ? 'counter' : 'supplement';

        const turn = await this.executeTurnWithGuard(
          {
            turnNumber: session.turns.length + 1,
            agent,
            turnType,
            context: config.context,
            previousTurns: session.turns,
            topic: config.topic,
          },
          guard,
          observer,
          session
        );
        session.turns.push(turn);

        // Check guard violations after each turn
        const guardViolation = this.checkGuardViolations(guard);
        if (guardViolation) {
          session.outcome = {
            status: guardViolation === 'budget' ? 'budget-exceeded' : 'max-turns-reached',
            decision: `Debate stopped: ${guardViolation}`,
            artifacts: this.collectArtifacts(session.turns),
          };
          return;
        }
      }
    }

    // Max turns reached without consensus
    session.outcome = {
      status: 'max-turns-reached',
      decision: 'Maximum debate turns reached without full consensus',
      artifacts: this.collectArtifacts(session.turns),
    };
  }

  private async executeTurnWithGuard(
    input: {
      turnNumber: number;
      agent: AgentPersona;
      turnType: DebateTurnType;
      context: DebateConfig['context'];
      previousTurns: DebateTurn[];
      topic: string;
    },
    guard: ExecutionGuard,
    observer: Observer,
    session: DebateSession
  ): Promise<DebateTurn> {
    // Check timeout
    const timeoutViolation = guard.checkDebateTimeout();
    if (timeoutViolation) {
      throw new Error(timeoutViolation.message);
    }

    observer.onTurnStart(input.agent, input.turnNumber);

    const turn = await executeTurn(input, { aiClient: this.aiClient });

    // Record with guard
    const costUsd = this.aiClient.calculateCost(
      turn.tokensUsed.input,
      turn.tokensUsed.output,
      turn.model
    );
    guard.recordTurn(turn.tokensUsed, costUsd);

    // Update session totals
    session.totalTokens.input += turn.tokensUsed.input;
    session.totalTokens.output += turn.tokensUsed.output;
    session.totalCostUsd += costUsd;

    // Observer detects anomalies
    observer.onTurnEnd(turn, session.totalCostUsd);

    // Persist turns incrementally
    if (this.store) {
      await this.store.updateTurns(
        session.id,
        [...session.turns, turn],
        session.totalTokens,
        session.totalCostUsd
      );
    }

    // Callback
    if (this.onTurnComplete) {
      this.onTurnComplete(turn, session);
    }

    return turn;
  }

  private checkGuardViolations(guard: ExecutionGuard): 'budget' | 'turns' | null {
    const remaining = guard.getRemainingBudget();
    if (remaining.costRemaining <= 0) return 'budget';
    if (remaining.turnsRemaining <= 0) return 'turns';
    return null;
  }

  private collectArtifacts(turns: DebateTurn[]) {
    return turns.flatMap((t) => t.artifacts);
  }
}

export function createDebateEngine(options: DebateEngineOptions): DebateEngine {
  return new DebateEngine(options);
}
