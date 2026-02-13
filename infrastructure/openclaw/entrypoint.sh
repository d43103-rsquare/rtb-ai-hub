#!/bin/sh
set -e

cp /opt/openclaw-init/agents/identities/main-agent.md /home/node/.openclaw/workspace/IDENTITY.md 2>/dev/null || true

if [ -d /opt/openclaw-init/skills ]; then
  cp -r /opt/openclaw-init/skills/* /home/node/.openclaw/workspace/skills/ 2>/dev/null || true
fi

if [ ! -f /home/node/.openclaw/openclaw.json ] || [ "$(cat /home/node/.openclaw/openclaw.json 2>/dev/null)" = "{}" ]; then
  cp /opt/openclaw-init/openclaw.json /home/node/.openclaw/openclaw.json 2>/dev/null || true
fi

cp -r /opt/openclaw-init/agents/* /home/node/.openclaw/agents/ 2>/dev/null || true

mkdir -p /home/node/.mcporter
if [ -n "$ATLASSIAN_SITE_NAME" ] && [ -n "$ATLASSIAN_USER_EMAIL" ] && [ -n "$ATLASSIAN_API_TOKEN" ]; then
  cat > /home/node/.mcporter/mcporter.json <<MCPEOF
{
  "mcpServers": {
    "jira": {
      "command": "mcp-atlassian-jira",
      "args": [],
      "description": "Atlassian Jira MCP server",
      "env": {
        "ATLASSIAN_SITE_NAME": "$ATLASSIAN_SITE_NAME",
        "ATLASSIAN_USER_EMAIL": "$ATLASSIAN_USER_EMAIL",
        "ATLASSIAN_API_TOKEN": "$ATLASSIAN_API_TOKEN"
      }
    }
  },
  "imports": []
}
MCPEOF
  echo "[entrypoint] mcporter Jira MCP configured"
fi

echo "[entrypoint] OpenClaw init complete"

# Start gateway in background first
# IMPORTANT: Use port 18789 (OpenClaw default) so that `openclaw agent` (CLI)
# can connect via ws://127.0.0.1:18789. This enables sessions_spawn to work
# correctly through the Gateway queue instead of falling back to embedded mode.
openclaw gateway \
    --port ${OPENCLAW_GATEWAY_PORT:-18789} \
    --allow-unconfigured \
    --bind lan &
GATEWAY_PID=$!

# Wait for gateway to be ready
echo "[entrypoint] Waiting for gateway to start..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:18789/ > /dev/null 2>&1; then
    echo "[entrypoint] Gateway is ready"
    break
  fi
  sleep 1
done

# Fix model names (add anthropic/ prefix if missing)
echo "[entrypoint] Fixing model names..."
openclaw models set anthropic/claude-sonnet-4-20250514 2>/dev/null || true

# Auto-register subagents
AGENTS="pm-agent developer-agent teamlead-agent ops-agent test-agent"
AGENT_DIRS="pm developer teamlead ops test"

set -- $AGENT_DIRS
for agent_id in $AGENTS; do
  agent_dir=$1
  shift
  # Check if agent already exists
  if ! openclaw agents list 2>/dev/null | grep -q "$agent_id"; then
    echo "[entrypoint] Registering agent: $agent_id"
    openclaw agents add "$agent_id" \
      --workspace "/home/node/.openclaw/workspace/agents/$agent_dir" \
      --model "anthropic/claude-sonnet-4-20250514" \
      --non-interactive 2>/dev/null || true
  else
    echo "[entrypoint] Agent already registered: $agent_id"
  fi

  # Ensure IDENTITY.md and SKILL.md are in workspace
  AGENT_WS="/home/node/.openclaw/workspace/agents/$agent_dir"
  mkdir -p "$AGENT_WS/skills"
  if [ -f "/opt/openclaw-init/agents/identities/${agent_id}.md" ]; then
    cp "/opt/openclaw-init/agents/identities/${agent_id}.md" "$AGENT_WS/IDENTITY.md" 2>/dev/null || true
  fi
  if [ -d /opt/openclaw-init/skills ]; then
    cp -r /opt/openclaw-init/skills/* "$AGENT_WS/skills/" 2>/dev/null || true
  fi
done

echo "[entrypoint] Subagent registration complete"

# Bring gateway to foreground
wait $GATEWAY_PID
