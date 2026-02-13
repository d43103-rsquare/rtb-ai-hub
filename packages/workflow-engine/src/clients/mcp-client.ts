import { DEFAULT_ENVIRONMENT, getNativeMcpToken, getNativeMcpEndpoint } from '@rtb-ai-hub/shared';
import type { Environment } from '@rtb-ai-hub/shared';
import type { IMCPClient, McpService } from './mcp-client-interface';
import { NativeMCPClient } from './native-mcp-client';

export function getMcpClient(
  service: McpService,
  env: Environment = DEFAULT_ENVIRONMENT
): IMCPClient {
  const token = getNativeMcpToken(service, env);
  return new NativeMCPClient(
    getNativeMcpEndpoint(service, env),
    `${service.toLowerCase()}-native`,
    service,
    token
  );
}
