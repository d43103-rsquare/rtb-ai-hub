import { MCP_ENDPOINTS, TIMEOUTS, createLogger } from '@rtb-ai-hub/shared';
import type { MCPTool, MCPToolCall } from '@rtb-ai-hub/shared';

const logger = createLogger('mcp-client');

export class MCPClient {
  private endpoint: string;
  private serverName: string;

  constructor(endpoint: string, serverName: string) {
    this.endpoint = endpoint;
    this.serverName = serverName;
  }

  async listTools(): Promise<MCPTool[]> {
    const response = await fetch(`${this.endpoint}/tools`, {
      signal: AbortSignal.timeout(TIMEOUTS.MCP_TOOL_CALL),
    });

    if (!response.ok) {
      throw new Error(`Failed to list tools from ${this.serverName}: ${response.status}`);
    }

    const tools = (await response.json()) as Array<{ name: string; description: string }>;
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {},
    }));
  }

  async callTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolCall> {
    logger.info({ tool: toolName, server: this.serverName }, 'Calling MCP tool');

    try {
      const response = await fetch(`${this.endpoint}/tools/${toolName}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(TIMEOUTS.MCP_TOOL_CALL),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          { tool: toolName, status: response.status, error: errorBody },
          'MCP tool call failed'
        );
        return {
          toolName,
          input,
          error: `HTTP ${response.status}: ${errorBody}`,
        };
      }

      const result = await response.json();
      logger.info({ tool: toolName, server: this.serverName }, 'MCP tool call succeeded');

      return {
        toolName,
        input,
        output: result,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ tool: toolName, error: message }, 'MCP tool call error');
      return {
        toolName,
        input,
        error: message,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const githubMcp = new MCPClient(MCP_ENDPOINTS.GITHUB, 'github');
export const jiraMcp = new MCPClient(MCP_ENDPOINTS.JIRA, 'jira');
export const figmaMcp = new MCPClient(MCP_ENDPOINTS.FIGMA, 'figma');
export const datadogMcp = new MCPClient(MCP_ENDPOINTS.DATADOG, 'datadog');
