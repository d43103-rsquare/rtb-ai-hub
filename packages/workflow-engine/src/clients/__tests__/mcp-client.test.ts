import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MockNativeMCPClient, mockGetNativeMcpToken, mockGetNativeMcpEndpoint } = vi.hoisted(() => {
  const mockGetNativeMcpToken = vi.fn<(service: string, env?: string) => string | undefined>();
  const mockGetNativeMcpEndpoint = vi.fn<(service: string, env?: string) => string>();

  class MockNativeMCPClient {
    endpoint: string;
    serverName: string;
    service: string;
    authToken?: string;
    _isNative = true;
    constructor(endpoint: string, name: string, service: string, authToken?: string) {
      this.endpoint = endpoint;
      this.serverName = name;
      this.service = service;
      this.authToken = authToken;
    }
    callTool = vi.fn();
    listTools = vi.fn();
    healthCheck = vi.fn();
  }

  return {
    MockNativeMCPClient,
    mockGetNativeMcpToken,
    mockGetNativeMcpEndpoint,
  };
});

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@rtb-ai-hub/shared');
  return {
    ...actual,
    getNativeMcpToken: (...args: unknown[]) =>
      mockGetNativeMcpToken(args[0] as string, args[1] as string | undefined),
    getNativeMcpEndpoint: (...args: unknown[]) =>
      mockGetNativeMcpEndpoint(args[0] as string, args[1] as string | undefined),
    DEFAULT_ENVIRONMENT: 'int',
  };
});

vi.mock('../native-mcp-client', () => ({
  NativeMCPClient: MockNativeMCPClient,
}));

import { getMcpClient } from '../mcp-client';
import type { IMCPClient } from '../mcp-client-interface';

describe('getMcpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNativeMcpEndpoint.mockImplementation((service: string) => {
      const defaults: Record<string, string> = {
        GITHUB: 'https://api.githubcopilot.com/mcp/',
        JIRA: 'http://localhost:3000',
        FIGMA: 'https://mcp.figma.com/mcp',
        DATADOG: 'http://localhost:3000',
      };
      return defaults[service] ?? '';
    });
  });

  it('always returns NativeMCPClient', () => {
    const client = getMcpClient('GITHUB', 'int');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;
    expect(mock._isNative).toBe(true);
    expect(mock.endpoint).toBe('https://api.githubcopilot.com/mcp/');
    expect(mock.serverName).toBe('github-native');
    expect(mock.service).toBe('GITHUB');
  });

  it('returns NativeMCPClient for all services', () => {
    const services = ['GITHUB', 'JIRA', 'FIGMA', 'DATADOG'] as const;
    for (const service of services) {
      const client = getMcpClient(service, 'int');
      const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;
      expect(mock._isNative).toBe(true);
      expect(mock.serverName).toBe(`${service.toLowerCase()}-native`);
    }
  });

  it('returns IMCPClient type', () => {
    const client: IMCPClient = getMcpClient('GITHUB', 'int');
    expect(client).toBeDefined();
  });

  it('uses default environment when env is not specified', () => {
    const client = getMcpClient('GITHUB');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;
    expect(mock._isNative).toBe(true);
    expect(mockGetNativeMcpToken).toHaveBeenCalledWith('GITHUB', 'int');
    expect(mockGetNativeMcpEndpoint).toHaveBeenCalledWith('GITHUB', 'int');
  });

  it('passes auth token from getNativeMcpToken to NativeMCPClient', () => {
    mockGetNativeMcpToken.mockReturnValue('ghp_test_token');

    const client = getMcpClient('GITHUB', 'int');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;

    expect(mockGetNativeMcpToken).toHaveBeenCalledWith('GITHUB', 'int');
    expect(mock.authToken).toBe('ghp_test_token');
  });

  it('passes undefined token when getNativeMcpToken returns undefined', () => {
    mockGetNativeMcpToken.mockReturnValue(undefined);

    const client = getMcpClient('GITHUB', 'int');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;

    expect(mock.authToken).toBeUndefined();
  });

  it('passes env-specific token for different environments', () => {
    mockGetNativeMcpToken.mockReturnValue('stg_token');

    const client = getMcpClient('GITHUB', 'stg');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;

    expect(mockGetNativeMcpToken).toHaveBeenCalledWith('GITHUB', 'stg');
    expect(mock.authToken).toBe('stg_token');
  });

  it('calls getNativeMcpEndpoint with service and env', () => {
    mockGetNativeMcpEndpoint.mockReturnValue('http://mcp-jira-native-int:3000');

    const client = getMcpClient('JIRA', 'int');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;

    expect(mockGetNativeMcpEndpoint).toHaveBeenCalledWith('JIRA', 'int');
    expect(mock.endpoint).toBe('http://mcp-jira-native-int:3000');
  });

  it('resolves env-specific endpoint for stg environment', () => {
    mockGetNativeMcpEndpoint.mockReturnValue('http://mcp-datadog-native-stg:3000');

    const client = getMcpClient('DATADOG', 'stg');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;

    expect(mockGetNativeMcpEndpoint).toHaveBeenCalledWith('DATADOG', 'stg');
    expect(mock.endpoint).toBe('http://mcp-datadog-native-stg:3000');
  });

  it('uses default endpoint when no env-specific override exists', () => {
    const client = getMcpClient('FIGMA', 'int');
    const mock = client as unknown as InstanceType<typeof MockNativeMCPClient>;

    expect(mockGetNativeMcpEndpoint).toHaveBeenCalledWith('FIGMA', 'int');
    expect(mock.endpoint).toBe('https://mcp.figma.com/mcp');
  });
});
