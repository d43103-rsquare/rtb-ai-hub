import type { MCPTool, MCPToolCall } from '@rtb-ai-hub/shared';

export type McpService = 'JIRA' | 'FIGMA' | 'GITHUB' | 'DATADOG';

export interface IMCPClient {
  /** Returns error inside MCPToolCall on failure — never throws. */
  callTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolCall>;
  listTools(): Promise<MCPTool[]>;
  healthCheck(): Promise<boolean>;
}
