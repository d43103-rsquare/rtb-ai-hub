import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMCPClient } from '../mcp-client-interface';

const {
  mockCallTool,
  mockListTools,
  mockConnect,
  mockClose,
  mockClientConstructor,
  mockTransportConstructor,
  MockSdkClient,
  MockTransport,
} = vi.hoisted(() => {
  const mockCallTool = vi.fn();
  const mockListTools = vi.fn();
  const mockConnect = vi.fn();
  const mockClose = vi.fn();
  const mockClientConstructor = vi.fn();

  class MockSdkClient {
    name: string;
    version: string;
    constructor(info: { name: string; version: string }) {
      mockClientConstructor(info);
      this.name = info.name;
      this.version = info.version;
    }
    connect = mockConnect;
    callTool = mockCallTool;
    listTools = mockListTools;
    close = mockClose;
  }

  const mockTransportConstructor = vi.fn();

  class MockTransport {
    url: URL;
    opts?: Record<string, unknown>;
    constructor(url: URL, opts?: Record<string, unknown>) {
      mockTransportConstructor(url, opts);
      this.url = url;
      this.opts = opts;
    }
  }

  return {
    mockCallTool,
    mockListTools,
    mockConnect,
    mockClose,
    mockClientConstructor,
    mockTransportConstructor,
    MockSdkClient,
    MockTransport,
  };
});

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

vi.mock('../mcp-sdk-loader', () => ({
  loadMcpSdk: vi.fn(() => ({
    Client: MockSdkClient,
    StreamableHTTPClientTransport: MockTransport,
  })),
}));

import { NativeMCPClient } from '../native-mcp-client';

describe('NativeMCPClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
  });

  it('satisfies IMCPClient interface', () => {
    const client: IMCPClient = new NativeMCPClient('http://localhost:3000', 'test', 'GITHUB');
    expect(client.callTool).toBeDefined();
    expect(client.listTools).toBeDefined();
    expect(client.healthCheck).toBeDefined();
  });

  describe('connect', () => {
    it('creates SDK client and connects', async () => {
      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.connect();

      expect(mockClientConstructor).toHaveBeenCalledWith({ name: 'test-server', version: '1.0.0' });
      expect(mockConnect).toHaveBeenCalled();
    });

    it('does not reconnect if already connected', async () => {
      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.connect();
      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('callTool', () => {
    it('maps tool name and calls SDK client', async () => {
      mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: '{"ok":true}' }] });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      const result = await client.callTool('createBranch', {
        owner: 'org',
        repo: 'repo',
        branch: 'feat',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'create_branch',
        arguments: { owner: 'org', repo: 'repo', branch: 'feat' },
      });
      expect(result.toolName).toBe('createBranch');
      expect(result.output).toEqual({ content: [{ type: 'text', text: '{"ok":true}' }] });
      expect(result.error).toBeUndefined();
    });

    it('maps Jira complex tool call (createEpic)', async () => {
      mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: '{"key":"PROJ-1"}' }] });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'JIRA');
      const result = await client.callTool('createEpic', {
        projectKey: 'PROJ',
        summary: 'Epic',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'jira_post',
        arguments: {
          path: '/rest/api/3/issue',
          body: {
            fields: {
              project: { key: 'PROJ' },
              issuetype: { name: 'Epic' },
              summary: 'Epic',
            },
          },
        },
      });
      expect(result.toolName).toBe('createEpic');
      expect(result.error).toBeUndefined();
    });

    it('auto-connects if not connected', async () => {
      mockCallTool.mockResolvedValue({ result: 'ok' });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.callTool('createBranch', { owner: 'org', repo: 'repo', branch: 'feat' });

      expect(mockConnect).toHaveBeenCalled();
    });

    it('returns error in MCPToolCall on SDK failure (does not throw)', async () => {
      mockCallTool.mockRejectedValue(new Error('Connection refused'));

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      const result = await client.callTool('createBranch', {
        owner: 'org',
        repo: 'repo',
        branch: 'feat',
      });

      expect(result.error).toBe('Connection refused');
      expect(result.toolName).toBe('createBranch');
      expect(result.output).toBeUndefined();
    });

    it('returns error when tool name mapping fails', async () => {
      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      const result = await client.callTool('nonExistentTool', {});

      expect(result.error).toContain('Unknown tool');
      expect(result.toolName).toBe('nonExistentTool');
    });

    it('preserves original toolName in result (transparent to callers)', async () => {
      mockCallTool.mockResolvedValue({ ok: true });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      const result = await client.callTool('createPullRequest', { title: 'PR' });

      expect(result.toolName).toBe('createPullRequest');
    });
  });

  describe('listTools', () => {
    it('returns mapped MCPTool array', async () => {
      mockListTools.mockResolvedValue({
        tools: [{ name: 'create_branch', description: 'Create a branch' }, { name: 'push_files' }],
      });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.connect();
      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 'create_branch',
        description: 'Create a branch',
        inputSchema: {},
      });
      expect(tools[1].description).toBe('');
    });

    it('auto-connects if not connected', async () => {
      mockListTools.mockResolvedValue({ tools: [] });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.listTools();

      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('returns true when server is reachable', async () => {
      mockListTools.mockResolvedValue({ tools: [] });

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      const healthy = await client.healthCheck();

      expect(healthy).toBe(true);
    });

    it('returns false when connection fails', async () => {
      mockConnect.mockRejectedValue(new Error('Connection refused'));

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('closes the SDK client', async () => {
      mockClose.mockResolvedValue(undefined);

      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.connect();
      await client.close();

      expect(mockClose).toHaveBeenCalled();
    });

    it('does nothing if not connected', async () => {
      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.close();

      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('authToken', () => {
    it('passes auth headers via transport opts when token is provided', async () => {
      const client = new NativeMCPClient(
        'https://api.githubcopilot.com/mcp/',
        'github-native',
        'GITHUB',
        'ghp_test_token_123'
      );
      await client.connect();

      expect(mockTransportConstructor).toHaveBeenCalledWith(
        new URL('https://api.githubcopilot.com/mcp/'),
        {
          requestInit: {
            headers: { Authorization: 'Bearer ghp_test_token_123' },
          },
        }
      );
    });

    it('passes empty opts when no token is provided', async () => {
      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'GITHUB');
      await client.connect();

      expect(mockTransportConstructor).toHaveBeenCalledWith(new URL('http://localhost:3000'), {});
    });

    it('passes empty opts when token is undefined', async () => {
      const client = new NativeMCPClient('http://localhost:3000', 'test-server', 'JIRA', undefined);
      await client.connect();

      expect(mockTransportConstructor).toHaveBeenCalledWith(new URL('http://localhost:3000'), {});
    });
  });
});
