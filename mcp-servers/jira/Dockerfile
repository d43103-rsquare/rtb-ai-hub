FROM node:20-alpine

WORKDIR /app

RUN npm install -g @modelcontextprotocol/server-jira

COPY config.json /app/config.json

EXPOSE 3000

ENV MCP_SERVER_PORT=3000

CMD ["mcp-server-jira"]
