#!/bin/bash
# RTB AI Hub — Bug Fix Workflow Demo
# Prerequisites: webhook-listener running on :4000, workflow-engine running
#
# Usage: ./scripts/demo-bug-fix.sh [env]
#   env: int (default), stg, prd

set -euo pipefail

ENV="${1:-int}"
WEBHOOK_URL="http://localhost:4000/webhooks/jira?env=${ENV}"

echo ""
echo "🐛 RTB AI Hub — Bug Fix Workflow Demo"
echo "======================================="
echo ""
echo "Target: ${WEBHOOK_URL}"
echo "Environment: ${ENV}"
echo ""

# Simulated Jira webhook payload
PAYLOAD=$(cat <<'ENDJSON'
{
  "webhookEvent": "issue_created",
  "issue": {
    "key": "DEMO-BUG-001",
    "fields": {
      "issuetype": {
        "name": "Bug"
      },
      "status": {
        "name": "To Do"
      },
      "summary": "API returns 500 on empty payload",
      "description": "## Bug Report\n### Steps to reproduce\n1. Send POST /api/data with empty body\n2. Observe 500 Internal Server Error\n\n### Expected\n400 Bad Request with validation error\n\n### Actual\n500 with stack trace:\n```\nTypeError: Cannot destructure property 'name' of undefined\n  at processData (src/handlers/data.ts:42)\n```\n\n### Environment\n- Server: int\n- Endpoint: POST /api/data",
      "project": {
        "key": "DEMO"
      },
      "labels": ["bug", "api", "critical"],
      "components": [
        { "id": "10001", "name": "Backend API" }
      ],
      "priority": {
        "name": "Critical"
      }
    }
  }
}
ENDJSON
)

echo "📤 Sending Jira Bug webhook..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Env: ${ENV}" \
  -d "${PAYLOAD}")

HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [ "${HTTP_CODE}" = "202" ]; then
  echo "✅ Webhook accepted (HTTP ${HTTP_CODE})"
  echo "   Response: ${BODY}"
  echo ""
  echo "📋 Next steps:"
  echo "   1. Check workflow-engine logs for bug-fix workflow execution"
  echo "   2. Monitor pg-boss queue: SELECT * FROM pgboss.job WHERE name='jira-queue' ORDER BY createdon DESC LIMIT 5;"
  echo "   3. Watch for PR creation on the target repository"
  echo ""
  echo "🔍 Useful commands:"
  echo "   # Check workflow status"
  echo "   psql \$DATABASE_URL -c \"SELECT id, type, status, jira_key FROM workflow_executions ORDER BY started_at DESC LIMIT 5;\""
  echo ""
  echo "   # Check pg-boss job status"
  echo "   psql \$DATABASE_URL -c \"SELECT id, name, state, createdon FROM pgboss.job WHERE name='jira-queue' ORDER BY createdon DESC LIMIT 5;\""
else
  echo "❌ Webhook failed (HTTP ${HTTP_CODE})"
  echo "   Response: ${BODY}"
  echo ""
  echo "💡 Troubleshooting:"
  echo "   - Is webhook-listener running? (pnpm dev:webhook)"
  echo "   - Is PostgreSQL running? (docker compose up -d postgres)"
  echo "   - Check webhook-listener logs for errors"
  exit 1
fi
