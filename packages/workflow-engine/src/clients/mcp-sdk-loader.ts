export type SdkClient = {
  connect: (transport: unknown) => Promise<void>;
  callTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
  listTools: () => Promise<{ tools: Array<{ name: string; description?: string }> }>;
  close: () => Promise<void>;
};

export type SdkClientConstructor = new (info: { name: string; version: string }) => SdkClient;
export type SdkTransportConstructor = new (url: URL, opts?: Record<string, unknown>) => unknown;

export type SdkModules = {
  Client: SdkClientConstructor;
  StreamableHTTPClientTransport: SdkTransportConstructor;
};

export function loadMcpSdk(): SdkModules {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@modelcontextprotocol/sdk/client/index.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const transport = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
    return {
      Client: sdk.Client,
      StreamableHTTPClientTransport: transport.StreamableHTTPClientTransport,
    };
  } catch {
    throw new Error(
      '@modelcontextprotocol/sdk is not installed. ' +
        'Install it with: npm install @modelcontextprotocol/sdk'
    );
  }
}
