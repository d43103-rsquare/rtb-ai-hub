/**
 * MCP Config Builder — Claude Code .mcp.json 설정 생성
 *
 * 환경별 MCP 서버 설정을 Claude Code .mcp.json 형식으로 변환.
 * 하네스 Tool Allowlist를 반영하여 에이전트별 도구 접근 제한.
 */

import type { McpServerConfig, Environment } from '@rtb-ai-hub/shared';
import {
  getNativeMcpEndpoint,
  type McpServiceKey,
} from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('mcp-config-builder');

export type McpConfigOptions = {
  env: Environment;
  allowedServices?: McpServiceKey[];
  additionalServers?: McpServerConfig[];
};

/** Build MCP server configs for Claude Code */
export function buildMcpServers(options: McpConfigOptions): McpServerConfig[] {
  const servers: McpServerConfig[] = [];

  const services: McpServiceKey[] = options.allowedServices ?? ['JIRA', 'GITHUB', 'FIGMA'];

  for (const service of services) {
    const endpoint = getNativeMcpEndpoint(service, options.env);
    const token = getServiceToken(service);

    if (!token) {
      logger.warn({ service }, 'No token configured for MCP service, skipping');
      continue;
    }

    servers.push({
      name: service.toLowerCase(),
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-proxy', endpoint],
      env: {
        [`${service}_TOKEN`]: token,
      },
    });
  }

  // Add any additional custom servers
  if (options.additionalServers) {
    servers.push(...options.additionalServers);
  }

  logger.info(
    { env: options.env, servers: servers.map((s) => s.name) },
    'MCP servers configured'
  );

  return servers;
}

/** Build .mcp.json file content */
export function buildMcpJsonContent(servers: McpServerConfig[]): string {
  const config: Record<string, unknown> = {
    mcpServers: {} as Record<string, unknown>,
  };

  for (const server of servers) {
    (config.mcpServers as Record<string, unknown>)[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env ?? {},
    };
  }

  return JSON.stringify(config, null, 2);
}

/** Get allowed tools for a Claude Code task */
export function buildAllowedTools(
  services: McpServiceKey[],
  additionalTools?: string[]
): string[] {
  const tools: string[] = [
    // Always allow filesystem tools
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
  ];

  // Add MCP tool prefixes
  for (const service of services) {
    tools.push(`mcp__${service.toLowerCase()}`);
  }

  if (additionalTools) {
    tools.push(...additionalTools);
  }

  return tools;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function getServiceToken(service: McpServiceKey): string | undefined {
  switch (service) {
    case 'GITHUB':
      return process.env.GITHUB_TOKEN || process.env.NATIVE_MCP_GITHUB_TOKEN;
    case 'JIRA':
      return process.env.JIRA_API_TOKEN || process.env.NATIVE_MCP_JIRA_TOKEN;
    case 'FIGMA':
      return process.env.FIGMA_ACCESS_TOKEN || process.env.NATIVE_MCP_FIGMA_TOKEN;
    case 'DATADOG':
      return process.env.DATADOG_API_KEY || process.env.NATIVE_MCP_DATADOG_TOKEN;
    default:
      return undefined;
  }
}
