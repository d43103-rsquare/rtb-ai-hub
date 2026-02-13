FROM node:22-bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    jq \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI + mcporter (MCP tool runner) globally
RUN npm config set strict-ssl false && npm install -g openclaw@latest mcporter

# Pre-install Jira MCP server to avoid npx download delay on first call
RUN npm install -g @aashari/mcp-server-atlassian-jira

# Configure git identity for agent operations
RUN git config --global user.email "ai-agent@rtb-ai-hub.local" \
    && git config --global user.name "RTB AI Agent"

# Create non-root user
USER node
WORKDIR /home/node

# Create OpenClaw directory structure
RUN mkdir -p /home/node/.openclaw/workspace/skills \
    /home/node/.openclaw/agents/main/sessions \
    /home/node/.openclaw/credentials \
    /home/node/.openclaw/canvas \
    /home/node/.openclaw/config \
    /home/node/.openclaw/data \
    && chmod 700 /home/node/.openclaw

COPY --chown=node:node openclaw.json /opt/openclaw-init/openclaw.json
COPY --chown=node:node agents/ /opt/openclaw-init/agents/
COPY --chown=node:node skills/ /opt/openclaw-init/skills/
COPY --chown=node:node entrypoint.sh /opt/openclaw-init/entrypoint.sh

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:18789/ > /dev/null || exit 1

ENTRYPOINT ["/opt/openclaw-init/entrypoint.sh"]
