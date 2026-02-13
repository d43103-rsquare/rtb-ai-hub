import type { MCPTool, MCPToolCall } from '@rtb-ai-hub/shared';
import { createLogger, TIMEOUTS } from '@rtb-ai-hub/shared';
import type { IMCPClient, McpService } from './mcp-client-interface';
import type { SdkClient } from './mcp-sdk-loader';
import { loadMcpSdk } from './mcp-sdk-loader';
import { mapToolCall } from './tool-name-mapper';

const logger = createLogger('native-mcp-client');

export class NativeMCPClient implements IMCPClient {
  private endpoint: string;
  private serverName: string;
  private service: McpService;
  private client: SdkClient | null = null;
  private connected: boolean = false;

  private authToken?: string;

  constructor(endpoint: string, serverName: string, service: McpService, authToken?: string) {
    this.endpoint = endpoint;
    this.serverName = serverName;
    this.service = service;
    this.authToken = authToken;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const { Client, StreamableHTTPClientTransport } = loadMcpSdk();

    const client = new Client({ name: this.serverName, version: '1.0.0' });
    const transportOpts: Record<string, unknown> = {};
    if (this.authToken) {
      transportOpts.requestInit = {
        headers: { Authorization: `Bearer ${this.authToken}` },
      };
    }
    const transportInstance = new StreamableHTTPClientTransport(
      new URL(this.endpoint),
      transportOpts
    );
    await client.connect(transportInstance);

    this.client = client;
    this.connected = true;
    logger.info(
      { server: this.serverName, endpoint: this.endpoint },
      'Native MCP client connected'
    );
  }

  async callTool(toolName: string, input: Record<string, unknown>): Promise<MCPToolCall> {
    logger.info({ tool: toolName, server: this.serverName }, 'Calling native MCP tool');

    try {
      const mapped = mapToolCall(this.service, toolName, input);

      if (!this.connected) {
        await this.connect();
      }

      const result = await Promise.race([
        this.client!.callTool({ name: mapped.toolName, arguments: mapped.input }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('MCP tool call timed out')), TIMEOUTS.MCP_TOOL_CALL)
        ),
      ]);

      logger.info({ tool: toolName, server: this.serverName }, 'Native MCP tool call succeeded');

      return {
        toolName,
        input,
        output: result,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ tool: toolName, error: message }, 'Native MCP tool call error');
      return {
        toolName,
        input,
        error: message,
      };
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      await this.connect();
    }

    const result = await this.client!.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: {},
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connected) {
        await this.connect();
      }
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.connected || !this.client) return;

    await this.client.close();
    this.connected = false;
    logger.info({ server: this.serverName }, 'Native MCP client disconnected');
  }
}
