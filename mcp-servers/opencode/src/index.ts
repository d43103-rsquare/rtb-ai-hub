import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express, { type Express, type Request, type Response } from 'express';
import { createRTBWorkflowClient } from './client.js';
import {
  triggerJiraWorkflowSchema,
  triggerJiraWorkflow,
  triggerFigmaWorkflowSchema,
  triggerFigmaWorkflow,
  getWorkflowStatusSchema,
  getWorkflowStatus,
} from './tools/index.js';

const PORT = Number(process.env.MCP_SERVER_PORT) || 3000;

const server = new Server(
  {
    name: 'rtb-opencode-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const client = createRTBWorkflowClient();

const tools: Tool[] = [
  triggerJiraWorkflowSchema as Tool,
  triggerFigmaWorkflowSchema as Tool,
  getWorkflowStatusSchema as Tool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'trigger_jira_workflow':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await triggerJiraWorkflow(client, args as any), null, 2),
            },
          ],
        };

      case 'trigger_figma_workflow':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await triggerFigmaWorkflow(client, args as any), null, 2),
            },
          ],
        };

      case 'get_workflow_status':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await getWorkflowStatus(client, args as any), null, 2),
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('RTB OpenCode MCP server running on stdio');
}

async function startHttpServer() {
  const app: Express = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', server: 'rtb-opencode-mcp' });
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const result = await server.handleRequest(req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`RTB OpenCode MCP server running on http://localhost:${PORT}`);
  });
}

const mode = process.env.MCP_TRANSPORT || 'http';

if (mode === 'stdio') {
  startStdioServer().catch(console.error);
} else {
  startHttpServer().catch(console.error);
}
