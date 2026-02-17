import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMcpServers, buildMcpJsonContent, buildAllowedTools } from '../mcp-config-builder';

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<typeof import('@rtb-ai-hub/shared')>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    getNativeMcpEndpoint: (service: string, env: string) =>
      `https://mcp.example.com/${service.toLowerCase()}/${env}`,
  };
});

describe('buildMcpServers', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_TOKEN', 'gh-test-token');
    vi.stubEnv('JIRA_API_TOKEN', 'jira-test-token');
    vi.stubEnv('FIGMA_ACCESS_TOKEN', '');
  });

  it('builds servers for allowed services with tokens', () => {
    const servers = buildMcpServers({
      env: 'int',
      allowedServices: ['GITHUB', 'JIRA'],
    });

    expect(servers.length).toBe(2);
    expect(servers[0].name).toBe('github');
    expect(servers[1].name).toBe('jira');
  });

  it('skips services without tokens', () => {
    vi.stubEnv('FIGMA_ACCESS_TOKEN', '');
    vi.unstubAllEnvs();
    // Clear all tokens
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('NATIVE_MCP_GITHUB_TOKEN', '');
    vi.stubEnv('JIRA_API_TOKEN', '');
    vi.stubEnv('NATIVE_MCP_JIRA_TOKEN', '');
    vi.stubEnv('FIGMA_ACCESS_TOKEN', '');
    vi.stubEnv('NATIVE_MCP_FIGMA_TOKEN', '');

    const servers = buildMcpServers({
      env: 'int',
      allowedServices: ['GITHUB', 'FIGMA'],
    });

    expect(servers.length).toBe(0);
  });

  it('includes additional servers', () => {
    const servers = buildMcpServers({
      env: 'int',
      allowedServices: ['GITHUB'],
      additionalServers: [
        { name: 'custom-server', command: 'node', args: ['server.js'] },
      ],
    });

    const customServer = servers.find((s) => s.name === 'custom-server');
    expect(customServer).toBeDefined();
    expect(customServer!.command).toBe('node');
  });

  it('uses npx with @anthropic-ai/mcp-proxy command', () => {
    const servers = buildMcpServers({
      env: 'int',
      allowedServices: ['GITHUB'],
    });

    if (servers.length > 0) {
      expect(servers[0].command).toBe('npx');
      expect(servers[0].args).toContain('-y');
      expect(servers[0].args).toContain('@anthropic-ai/mcp-proxy');
    }
  });
});

describe('buildMcpJsonContent', () => {
  it('generates valid JSON', () => {
    const servers = [
      {
        name: 'github',
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-proxy', 'https://mcp.example.com/github'],
        env: { GITHUB_TOKEN: 'test' },
      },
    ];

    const json = buildMcpJsonContent(servers);
    const parsed = JSON.parse(json);

    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).toBeDefined();
    expect(parsed.mcpServers.github.command).toBe('npx');
    expect(parsed.mcpServers.github.env.GITHUB_TOKEN).toBe('test');
  });

  it('handles multiple servers', () => {
    const servers = [
      { name: 'github', command: 'npx', args: [], env: {} },
      { name: 'jira', command: 'npx', args: [], env: {} },
    ];

    const json = buildMcpJsonContent(servers);
    const parsed = JSON.parse(json);

    expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
  });

  it('handles empty server list', () => {
    const json = buildMcpJsonContent([]);
    const parsed = JSON.parse(json);

    expect(parsed.mcpServers).toEqual({});
  });
});

describe('buildAllowedTools', () => {
  it('always includes filesystem tools', () => {
    const tools = buildAllowedTools([]);

    expect(tools).toContain('Read');
    expect(tools).toContain('Write');
    expect(tools).toContain('Edit');
    expect(tools).toContain('Glob');
    expect(tools).toContain('Grep');
    expect(tools).toContain('Bash');
  });

  it('adds MCP tool prefixes for services', () => {
    const tools = buildAllowedTools(['GITHUB', 'JIRA']);

    expect(tools).toContain('mcp__github');
    expect(tools).toContain('mcp__jira');
  });

  it('includes additional tools', () => {
    const tools = buildAllowedTools(['GITHUB'], ['CustomTool']);

    expect(tools).toContain('CustomTool');
    expect(tools).toContain('mcp__github');
  });

  it('lowercases service names for MCP prefix', () => {
    const tools = buildAllowedTools(['FIGMA', 'DATADOG']);

    expect(tools).toContain('mcp__figma');
    expect(tools).toContain('mcp__datadog');
  });
});
