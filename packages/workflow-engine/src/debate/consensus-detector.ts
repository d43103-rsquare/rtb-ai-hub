/**
 * Consensus Detector — 토론 합의 감지
 *
 * - 명시적 동의/반대 키워드 감지 (한국어 + 영어)
 * - 합의율 계산
 * - 교착 상태 감지
 */

import type { AgentPersona, ConsensusStatus, DebateTurn } from '@rtb-ai-hub/shared';

// ─── Constants ─────────────────────────────────────────────────────────────────

const AGREEMENT_KEYWORDS = [
  // Korean
  '동의합니다',
  '동의해요',
  '찬성합니다',
  '찬성해요',
  '좋습니다',
  '좋은 방향',
  '적절합니다',
  '맞습니다',
  '수긍합니다',
  '합의합니다',
  '이 방향이 좋',
  '이견 없습니다',
  '이견없습니다',
  '문제 없습니다',
  '문제없습니다',
  '지지합니다',
  '동의하며',
  '찬성하며',
  // English
  'i agree',
  'agreed',
  'sounds good',
  'makes sense',
  'i support',
  'no objection',
  'looks good',
  'well aligned',
  'consensus',
  'on board',
  'approve',
  'lgtm',
];

const DISAGREEMENT_KEYWORDS = [
  // Korean
  '반대합니다',
  '반대해요',
  '동의하지 않',
  '동의할 수 없',
  '우려됩니다',
  '우려가 있',
  '재고가 필요',
  '다시 생각',
  '문제가 있',
  '위험합니다',
  '대안을 제안',
  '다른 접근',
  '부적절합니다',
  '수정이 필요',
  // English
  'i disagree',
  'i object',
  'concerned about',
  'not convinced',
  'alternative approach',
  'reconsider',
  'push back',
  'not ideal',
  'risky',
  'problem with',
];

const PARTIAL_AGREEMENT_KEYWORDS = [
  // Korean
  '부분적으로 동의',
  '조건부 동의',
  '일부 동의',
  '대체로 좋지만',
  '기본적으로 찬성하지만',
  '방향은 좋으나',
  '동의하지만 다만',
  // English
  'partially agree',
  'mostly agree but',
  'agree with reservations',
  'conditionally agree',
  'generally supportive but',
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AgentStance = 'agree' | 'partial' | 'disagree' | 'neutral';

export type ConsensusResult = {
  status: ConsensusStatus;
  consensusRate: number;
  stances: Record<string, AgentStance>;
  isStalemate: boolean;
  summary: string;
};

// ─── Consensus Detector ────────────────────────────────────────────────────────

export class ConsensusDetector {
  private previousRates: number[] = [];

  /** Analyze the latest turn and compute consensus among all participants */
  analyze(
    turns: DebateTurn[],
    participants: AgentPersona[]
  ): ConsensusResult {
    const stances: Record<string, AgentStance> = {};

    // Get the latest turn for each participant
    for (const agent of participants) {
      const agentTurns = turns.filter((t) => t.agent === agent);
      if (agentTurns.length === 0) {
        stances[agent] = 'neutral';
        continue;
      }

      const latestTurn = agentTurns[agentTurns.length - 1];
      stances[agent] = this.detectStance(latestTurn.content);
    }

    const agreeCount = Object.values(stances).filter((s) => s === 'agree').length;
    const partialCount = Object.values(stances).filter((s) => s === 'partial').length;
    const totalVoters = participants.length;
    const consensusRate = totalVoters > 0
      ? (agreeCount + partialCount * 0.5) / totalVoters
      : 0;

    // Detect stalemate: 3+ rounds with same consensus rate
    this.previousRates.push(Math.round(consensusRate * 100));
    const isStalemate = this.detectStalemate();

    const status = this.determineStatus(consensusRate, isStalemate);

    return {
      status,
      consensusRate,
      stances,
      isStalemate,
      summary: this.buildSummary(status, consensusRate, stances, isStalemate),
    };
  }

  /** Reset detector state for a new debate */
  reset(): void {
    this.previousRates = [];
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private detectStance(content: string): AgentStance {
    const lower = content.toLowerCase();

    // Check partial first (it contains agreement keywords)
    const hasPartial = PARTIAL_AGREEMENT_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasPartial) return 'partial';

    const hasAgreement = AGREEMENT_KEYWORDS.some((kw) => lower.includes(kw));
    const hasDisagreement = DISAGREEMENT_KEYWORDS.some((kw) => lower.includes(kw));

    if (hasAgreement && !hasDisagreement) return 'agree';
    if (hasDisagreement && !hasAgreement) return 'disagree';
    if (hasAgreement && hasDisagreement) return 'partial';

    return 'neutral';
  }

  private detectStalemate(): boolean {
    if (this.previousRates.length < 3) return false;

    const recent = this.previousRates.slice(-3);
    return recent[0] === recent[1] && recent[1] === recent[2];
  }

  private determineStatus(rate: number, isStalemate: boolean): ConsensusStatus {
    if (isStalemate) return 'stalemate';
    if (rate >= 0.8) return 'consensus';
    if (rate >= 0.5) return 'partial';
    return 'disagreement';
  }

  private buildSummary(
    status: ConsensusStatus,
    rate: number,
    stances: Record<string, AgentStance>,
    isStalemate: boolean
  ): string {
    const pct = Math.round(rate * 100);

    if (isStalemate) {
      return `교착 상태 감지 (합의율 ${pct}%). 중재자 결정이 필요합니다.`;
    }

    switch (status) {
      case 'consensus':
        return `합의 도달 (합의율 ${pct}%). 모든 참여자가 동의합니다.`;
      case 'partial': {
        const dissenters = Object.entries(stances)
          .filter(([, s]) => s === 'disagree')
          .map(([a]) => a);
        return `부분 합의 (합의율 ${pct}%). 이견 에이전트: ${dissenters.join(', ') || '없음'}. 추가 논의가 필요합니다.`;
      }
      case 'disagreement': {
        const dissenters = Object.entries(stances)
          .filter(([, s]) => s === 'disagree')
          .map(([a]) => a);
        return `이견 상태 (합의율 ${pct}%). 반대 에이전트: ${dissenters.join(', ')}. 반론/보완이 필요합니다.`;
      }
      default:
        return `상태: ${status}, 합의율: ${pct}%`;
    }
  }
}

export function createConsensusDetector(): ConsensusDetector {
  return new ConsensusDetector();
}
