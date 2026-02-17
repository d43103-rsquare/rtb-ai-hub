/**
 * Claude Code Integration — Claude CLI 기반 코드 생성/수정 계층
 */

export {
  executeClaudeCode,
  executeWithGateRetry,
  type ClaudeCodeExecOptions,
} from './executor';

export { buildClaudeMd, type ContextBuildInput } from './context-builder';

export {
  buildMcpServers,
  buildMcpJsonContent,
  buildAllowedTools,
  type McpConfigOptions,
} from './mcp-config-builder';

export { parseAndValidate, extractChangedFiles, type ParsedResult } from './result-parser';
