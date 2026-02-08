FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY config.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 3000

ENV MCP_SERVER_PORT=3000
ENV MCP_TRANSPORT=http

CMD ["node", "dist/index.js"]
