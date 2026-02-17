/**
 * Debate Engine — 7개 직무별 에이전트 페르소나 기반 턴제 토론 시스템
 */

export { DebateEngine, createDebateEngine, type DebateEngineOptions } from './engine';
export { getPersona, getAllPersonas, getPersonaByCodename } from './persona-registry';
export { ConsensusDetector, createConsensusDetector, type ConsensusResult, type AgentStance } from './consensus-detector';
export { executeTurn, type TurnExecutorOptions, type TurnInput } from './turn-executor';
export { DebateStore, createDebateStore } from './debate-store';
export { buildSystemPrompt } from './prompts/base-prompt';
export { buildTurnInstruction, type InstructionInput } from './prompts/debate-instruction';
