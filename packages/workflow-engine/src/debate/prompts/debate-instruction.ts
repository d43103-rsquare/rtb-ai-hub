/**
 * Debate Instruction — 턴별 지시문 생성
 *
 * 턴 유형(proposal, counter, supplement, consensus, decision)에 따라
 * 적절한 지시문을 생성한다.
 */

import type { PersonaDefinition, DebateTurn, DebateTurnType } from '@rtb-ai-hub/shared';

export type InstructionInput = {
  turnType: DebateTurnType;
  turnNumber: number;
  topic: string;
  previousTurns: DebateTurn[];
  persona: PersonaDefinition;
};

export function buildTurnInstruction(input: InstructionInput): string {
  const { turnType, turnNumber, topic, previousTurns, persona } = input;

  const sections: string[] = [];

  // Topic
  sections.push(`## 토론 주제\n${topic}`);

  // Previous turns
  if (previousTurns.length > 0) {
    sections.push(`## 이전 토론 내용\n${formatPreviousTurns(previousTurns)}`);
  }

  // Turn-specific instruction
  sections.push(getTurnTypeInstruction(turnType, turnNumber, persona, previousTurns));

  return sections.join('\n\n');
}

function formatPreviousTurns(turns: DebateTurn[]): string {
  return turns
    .map((t) => {
      const artifacts = t.artifacts.length > 0
        ? `\n  [아티팩트: ${t.artifacts.map((a) => a.title).join(', ')}]`
        : '';
      return `### Turn ${t.turnNumber} — ${t.agent} (${t.type})${artifacts}\n${t.content}`;
    })
    .join('\n\n---\n\n');
}

function getTurnTypeInstruction(
  turnType: DebateTurnType,
  turnNumber: number,
  persona: PersonaDefinition,
  previousTurns: DebateTurn[]
): string {
  switch (turnType) {
    case 'proposal':
      return `## 지시: 제안 (Turn ${turnNumber})

당신은 ${persona.role} (${persona.codename})입니다.
위 토론 주제에 대해 당신의 전문 영역 관점에서 **초기 제안**을 하세요.

포함할 내용:
1. 주제에 대한 당신의 분석
2. 구체적인 제안 사항
3. 예상되는 장점과 위험
4. 다른 에이전트가 고려해야 할 사항

당신의 의사결정 프레임워크를 적용하세요: ${persona.decisionFramework}`;

    case 'counter':
      return `## 지시: 반론 (Turn ${turnNumber})

당신은 ${persona.role} (${persona.codename})입니다.
이전 제안들을 검토하고, 당신의 전문 영역 관점에서 **반론 또는 우려사항**을 제시하세요.

포함할 내용:
1. 이전 제안에서 우려되는 점
2. 반대하는 구체적 이유
3. **반드시 대안을 함께 제시**하세요
4. 당신의 대안이 더 나은 이유

주의: 반대만 하지 말고, 건설적인 대안을 제시하세요.`;

    case 'supplement':
      return `## 지시: 보완 (Turn ${turnNumber})

당신은 ${persona.role} (${persona.codename})입니다.
이전 논의를 검토하고, 당신의 전문 영역에서 **보완할 사항**을 추가하세요.

포함할 내용:
1. 동의하는 부분과 그 이유
2. 추가로 고려해야 할 사항
3. 이전 논의에서 놓친 관점
4. 구체적인 구현/실행 제안

합의에 다가가는 방향으로 기여하세요.`;

    case 'consensus': {
      const stanceOverview = summarizeStances(previousTurns);
      return `## 지시: 합의 정리 (Turn ${turnNumber})

당신은 중재자 역할의 ${persona.role} (${persona.codename})입니다.
전체 토론을 정리하고 **합의 사항을 요약**하세요.

${stanceOverview}

포함할 내용:
1. 합의된 사항 목록
2. 남은 이견 (있다면)
3. 최종 결정 사항
4. 다음 단계 (Action Items)
5. 구체적 산출물이 있다면 <artifact> 태그로 작성
6. 아래 형식으로 **사람 리뷰어가 반드시 확인해야 할 판단 포인트**를 3~5개 제시하세요:

## REVIEW_CHECKPOINTS
- [체크포인트 1: AI가 내린 판단 중 비즈니스 로직 검증이 필요한 부분]
- [체크포인트 2: 엣지케이스나 예외 처리 검토가 필요한 부분]
- [체크포인트 3: 보안·성능·운영 관점에서 사람이 판단해야 할 부분]

모든 참여자의 의견을 공정하게 반영하세요.`;
    }

    case 'decision': {
      const stanceOverview = summarizeStances(previousTurns);
      return `## 지시: 최종 결정 (Turn ${turnNumber})

당신은 중재자 역할의 ${persona.role} (${persona.codename})입니다.
토론이 교착 상태에 도달했습니다. **최종 결정**을 내려주세요.

${stanceOverview}

포함할 내용:
1. 각 입장에 대한 공정한 평가
2. 최종 결정과 그 근거
3. 반대 의견에 대한 존중과 설명
4. 실행 계획 (Action Items)
5. 위험 완화 방안
6. 구체적 산출물을 <artifact> 태그로 작성
7. 아래 형식으로 **사람 리뷰어가 반드시 확인해야 할 판단 포인트**를 3~5개 제시하세요:

## REVIEW_CHECKPOINTS
- [체크포인트 1: 이번 결정에서 AI가 트레이드오프를 감수한 부분]
- [체크포인트 2: 반대 의견이 있었던 부분 — 실제로 문제가 없는지 검토]
- [체크포인트 3: 비즈니스·운영 맥락에서 사람만이 판단할 수 있는 부분]

중재자로서 공정하게 판단하되, 프로젝트 성공을 최우선으로 하세요.`;
    }

    default:
      return `## 지시: Turn ${turnNumber}\n토론에 참여하세요.`;
  }
}

function summarizeStances(turns: DebateTurn[]): string {
  if (turns.length === 0) return '';

  const agentViews = new Map<string, string>();
  for (const turn of turns) {
    agentViews.set(turn.agent, `${turn.type}: ${turn.content.slice(0, 200)}...`);
  }

  const lines = Array.from(agentViews.entries()).map(
    ([agent, view]) => `- **${agent}**: ${view}`
  );

  return `### 현재까지의 입장\n${lines.join('\n')}`;
}
