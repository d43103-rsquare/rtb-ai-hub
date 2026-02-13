FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

ENV MCP_SERVER_PORT=3000
ENV MCP_TRANSPORT=http
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
