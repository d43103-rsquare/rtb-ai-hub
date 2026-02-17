import { describe, it, expect, beforeEach } from 'vitest';
import { ConsensusDetector } from '../consensus-detector';
import { AgentPersona } from '@rtb-ai-hub/shared';
import type { DebateTurn } from '@rtb-ai-hub/shared';

function makeTurn(agent: AgentPersona, content: string, turnNumber = 1): DebateTurn {
  return {
    turnNumber,
    agent,
    content,
    type: 'proposal',
    artifacts: [],
    tokensUsed: { input: 100, output: 200 },
    model: 'test-model',
    durationMs: 1000,
    timestamp: new Date().toISOString(),
  };
}

const participants = [
  AgentPersona.PM,
  AgentPersona.SYSTEM_PLANNER,
  AgentPersona.BACKEND_DEVELOPER,
  AgentPersona.QA,
];

describe('ConsensusDetector', () => {
  let detector: ConsensusDetector;

  beforeEach(() => {
    detector = new ConsensusDetector();
  });

  describe('Korean keyword detection', () => {
    it('detects agreement with Korean keywords', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '이 접근 방식에 동의합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '좋습니다. 이 방향이 좋아 보입니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '찬성합니다.'),
        makeTurn(AgentPersona.QA, '이견 없습니다.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.status).toBe('consensus');
      expect(result.consensusRate).toBeGreaterThanOrEqual(0.8);
    });

    it('detects disagreement with Korean keywords', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '이 방식을 제안합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '반대합니다. 대안을 제안합니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의하지 않습니다. 우려됩니다.'),
        makeTurn(AgentPersona.QA, '다시 생각할 필요가 있습니다.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.status).toBe('disagreement');
      expect(result.consensusRate).toBeLessThan(0.5);
    });

    it('detects partial agreement with Korean keywords', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '부분적으로 동의하지만 일부 수정이 필요합니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '찬성합니다.'),
        makeTurn(AgentPersona.QA, '조건부 동의합니다.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.consensusRate).toBeGreaterThanOrEqual(0.5);
      expect(result.consensusRate).toBeLessThan(1);
    });
  });

  describe('English keyword detection', () => {
    it('detects agreement with English keywords', () => {
      const turns = [
        makeTurn(AgentPersona.PM, 'I agree with this approach.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, 'Sounds good to me.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, 'LGTM'),
        makeTurn(AgentPersona.QA, 'No objection here.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.status).toBe('consensus');
      expect(result.consensusRate).toBeGreaterThanOrEqual(0.8);
    });

    it('detects disagreement with English keywords', () => {
      const turns = [
        makeTurn(AgentPersona.PM, 'Lets go with this plan.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, 'I disagree with this approach.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, 'Concerned about scalability.'),
        makeTurn(AgentPersona.QA, 'Not convinced this will work.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.status).toBe('disagreement');
    });
  });

  describe('latest turn behavior', () => {
    it('uses only the latest turn per agent', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '반대합니다.', 1),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '반대합니다.', 1),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '반대합니다.', 1),
        makeTurn(AgentPersona.QA, '반대합니다.', 1),
        // Second round: all agree
        makeTurn(AgentPersona.PM, '동의합니다.', 2),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '동의합니다.', 2),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의합니다.', 2),
        makeTurn(AgentPersona.QA, '동의합니다.', 2),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.status).toBe('consensus');
    });
  });

  describe('neutral stance', () => {
    it('returns neutral for agents with no turns', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.stances[AgentPersona.SYSTEM_PLANNER]).toBe('neutral');
      expect(result.stances[AgentPersona.BACKEND_DEVELOPER]).toBe('neutral');
      expect(result.stances[AgentPersona.QA]).toBe('neutral');
    });

    it('returns neutral for content without keywords', () => {
      const turns = [
        makeTurn(AgentPersona.PM, 'Let me explain the architecture.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.stances[AgentPersona.PM]).toBe('neutral');
    });
  });

  describe('stalemate detection', () => {
    it('detects stalemate after 3 rounds with same rate', () => {
      // Run analyze 3 times with same consensus result
      const sameTurns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '반대합니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의합니다.'),
        makeTurn(AgentPersona.QA, '반대합니다.'),
      ];

      detector.analyze(sameTurns, participants);
      detector.analyze(sameTurns, participants);
      const result = detector.analyze(sameTurns, participants);

      expect(result.isStalemate).toBe(true);
      expect(result.status).toBe('stalemate');
    });

    it('does not detect stalemate before 3 rounds', () => {
      const sameTurns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '반대합니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의합니다.'),
        makeTurn(AgentPersona.QA, '반대합니다.'),
      ];

      const result1 = detector.analyze(sameTurns, participants);
      const result2 = detector.analyze(sameTurns, participants);

      expect(result1.isStalemate).toBe(false);
      expect(result2.isStalemate).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears stalemate history on reset', () => {
      const sameTurns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '반대합니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의합니다.'),
        makeTurn(AgentPersona.QA, '반대합니다.'),
      ];

      detector.analyze(sameTurns, participants);
      detector.analyze(sameTurns, participants);
      detector.reset();
      const result = detector.analyze(sameTurns, participants);

      expect(result.isStalemate).toBe(false);
    });
  });

  describe('mixed language', () => {
    it('handles agreement in both Korean and English', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '동의합니다. This looks good.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, 'I agree with the proposal.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '찬성합니다. Makes sense.'),
        makeTurn(AgentPersona.QA, '좋습니다.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.status).toBe('consensus');
    });
  });

  describe('consensus rate calculation', () => {
    it('counts partial agreement as 0.5', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),      // agree = 1
        makeTurn(AgentPersona.SYSTEM_PLANNER, '부분적으로 동의하지만 수정 필요'), // partial = 0.5
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의합니다.'), // agree = 1
        makeTurn(AgentPersona.QA, '부분적으로 동의합니다.'),    // partial = 0.5
      ];

      const result = detector.analyze(turns, participants);
      // (1 + 0.5 + 1 + 0.5) / 4 = 0.75
      expect(result.consensusRate).toBe(0.75);
    });
  });

  describe('summary generation', () => {
    it('generates summary in Korean', () => {
      const turns = [
        makeTurn(AgentPersona.PM, '동의합니다.'),
        makeTurn(AgentPersona.SYSTEM_PLANNER, '동의합니다.'),
        makeTurn(AgentPersona.BACKEND_DEVELOPER, '동의합니다.'),
        makeTurn(AgentPersona.QA, '동의합니다.'),
      ];

      const result = detector.analyze(turns, participants);
      expect(result.summary).toContain('합의 도달');
      expect(result.summary).toContain('100%');
    });
  });
});
