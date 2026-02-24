/**
 * Turn Executor — 단일 토론 턴 실행
 *
 * - 페르소나 시스템 프롬프트 + 이전 턴 히스토리 + 턴 지시문 조합
 * - 응답에서 아티팩트 파싱
 * - 하네스 예산 체크
 */

import type { AgentPersona, DebateArtifact, DebateContext, DebateTurn, DebateTurnType } from '@rtb-ai-hub/shared';
import { AIProviderRouter } from '../clients/provider-router';
import { getPersona } from './persona-registry';
import { buildSystemPrompt } from './prompts/base-prompt';
import { buildTurnInstruction } from './prompts/debate-instruction';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('turn-executor');

export type TurnExecutorOptions = {
  router: AIProviderRouter;
  temperature?: number;
};

export type TurnInput = {
  turnNumber: number;
  agent: AgentPersona;
  turnType: DebateTurnType;
  context: DebateContext;
  previousTurns: DebateTurn[];
  topic: string;
};

export async function executeTurn(
  input: TurnInput,
  options: TurnExecutorOptions
): Promise<DebateTurn> {
  const persona = getPersona(input.agent);
  const startTime = Date.now();

  // Build system prompt from persona
  const systemPrompt = buildSystemPrompt(persona, input.context);

  // Build turn instruction
  const turnInstruction = buildTurnInstruction({
    turnType: input.turnType,
    turnNumber: input.turnNumber,
    topic: input.topic,
    previousTurns: input.previousTurns,
    persona,
  });

  logger.info(
    { agent: input.agent, turnNumber: input.turnNumber, turnType: input.turnType },
    'Executing debate turn'
  );

  const { adapter } = options.router.getAdapterForAgent(input.agent);
  const aiResponse = await adapter.complete(turnInstruction, {
    systemPrompt,
    maxTokens: persona.maxTokensPerTurn,
    temperature: options.temperature ?? 0.7,
  });

  // Parse artifacts from response
  const artifacts = parseArtifacts(aiResponse.text);

  const turn: DebateTurn = {
    turnNumber: input.turnNumber,
    agent: input.agent,
    content: aiResponse.text,
    type: input.turnType,
    artifacts,
    tokensUsed: aiResponse.tokensUsed,
    model: aiResponse.model,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  logger.info(
    {
      agent: input.agent,
      turnNumber: input.turnNumber,
      tokens: aiResponse.tokensUsed,
      artifacts: artifacts.length,
      durationMs: turn.durationMs,
    },
    'Debate turn completed'
  );

  return turn;
}

/** Parse <artifact> tags from response text */
function parseArtifacts(text: string): DebateArtifact[] {
  const artifacts: DebateArtifact[] = [];
  const regex = /<artifact\s+type="([^"]+)"\s+title="([^"]+)"(?:\s+format="([^"]+)")?\s*>([\s\S]*?)<\/artifact>/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const [, type, title, format, content] = match;
    artifacts.push({
      type: type as DebateArtifact['type'],
      title,
      content: content.trim(),
      format: (format as DebateArtifact['format']) || 'markdown',
    });
  }

  return artifacts;
}
