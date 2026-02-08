import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';
import {
  createIssueTool,
  updateIssueTool,
  transitionIssueTool,
  addCommentTool,
  searchIssuesTool,
  getIssueTool,
  createEpicTool,
  createSubtaskTool,
} from './tools/index.js';

const server = new McpServer(
  { name: 'rtb-mcp-jira', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const allTools = [
  createIssueTool,
  updateIssueTool,
  transitionIssueTool,
  addCommentTool,
  searchIssuesTool,
  getIssueTool,
  createEpicTool,
  createSubtaskTool,
];

for (const tool of allTools) {
  server.tool(tool.name, tool.description, tool.schema, tool.handler);
}

type ToolEntry = (typeof allTools)[number];
const toolMap = new Map<string, ToolEntry>(allTools.map((t) => [t.name, t]));

function startHttpServer(port: number) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', server: 'rtb-mcp-jira' });
  });

  app.get('/tools', (_req, res) => {
    res.json(
      allTools.map((t) => ({
        name: t.name,
        description: t.description,
      }))
    );
  });

  app.post('/tools/:name/call', async (req, res) => {
    const tool = toolMap.get(req.params.name);
    if (!tool) {
      res.status(404).json({ error: `Tool ${req.params.name} not found` });
      return;
    }
    try {
      const result = await tool.handler(req.body);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`Jira MCP HTTP server listening on port ${port}`);
  });
}

async function main() {
  const transport = process.env.MCP_TRANSPORT || 'http';

  if (transport === 'stdio') {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
  } else {
    const port = parseInt(process.env.MCP_SERVER_PORT || '3000', 10);
    startHttpServer(port);
  }
}

main().catch(console.error);
