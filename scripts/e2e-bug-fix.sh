#!/bin/bash
# RTB AI Hub — E2E Bug-Fix Workflow Test
# Tests the full loop: Mock Jira -> webhook-listener -> workflow-engine
#
# Prerequisites:
#   - mock-jira running on :3001
#   - webhook-listener running on :4000
#
# Usage: bash scripts/e2e-bug-fix.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MOCK_JIRA="http://localhost:3001"
WEBHOOK_LISTENER="http://localhost:4000"
ISSUE_KEY="PROJ-1"
POLL_INTERVAL=3
POLL_TIMEOUT=30

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

pass()  { echo -e "${GREEN}[PASS]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }
info()  { echo -e "${YELLOW}[INFO]${NC} $*"; }
wait_() { echo -e "${YELLOW}[WAIT]${NC} $*"; }

# ---------------------------------------------------------------------------
# Step 1 — Check prerequisites
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  E2E Bug-Fix Workflow Test"
echo "============================================"
echo ""

info "Checking prerequisites..."

# Check mock-jira
if ! curl -sf "${MOCK_JIRA}/rest/api/3/search" -o /dev/null 2>/dev/null; then
  fail "mock-jira is not running on :3001"
  echo "     Start it with: pnpm dev:mock-jira"
  exit 1
fi
pass "mock-jira is running on :3001"

# Check webhook-listener
if ! curl -sf "${WEBHOOK_LISTENER}/health" -o /dev/null 2>/dev/null; then
  fail "webhook-listener is not running on :4000"
  echo "     Start it with: pnpm dev:webhook"
  exit 1
fi
pass "webhook-listener is running on :4000"

echo ""

# ---------------------------------------------------------------------------
# Step 2 — Seed mock Jira if empty
# ---------------------------------------------------------------------------
info "Checking mock Jira data..."

SEARCH_RESP=$(curl -sf "${MOCK_JIRA}/rest/api/3/search" 2>/dev/null || echo '{"issues":[]}')
ISSUE_COUNT=$(echo "${SEARCH_RESP}" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('issues',[])))" 2>/dev/null || echo "0")

if [ "${ISSUE_COUNT}" -eq 0 ]; then
  info "No issues found. Seeding mock Jira..."
  (cd "$(dirname "$0")/.." && pnpm --filter @rtb-ai-hub/mock-jira run seed)
  echo ""
  info "Seed complete. Re-checking..."
  SEARCH_RESP=$(curl -sf "${MOCK_JIRA}/rest/api/3/search" 2>/dev/null || echo '{"issues":[]}')
  ISSUE_COUNT=$(echo "${SEARCH_RESP}" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('issues',[])))" 2>/dev/null || echo "0")
fi

pass "Mock Jira has ${ISSUE_COUNT} issue(s)"
echo ""

# ---------------------------------------------------------------------------
# Step 3 — Verify PROJ-1 exists
# ---------------------------------------------------------------------------
info "Fetching issue ${ISSUE_KEY}..."

ISSUE_RESP=$(curl -sf "${MOCK_JIRA}/rest/api/3/issue/${ISSUE_KEY}" 2>/dev/null || echo "")

if [ -z "${ISSUE_RESP}" ]; then
  fail "Issue ${ISSUE_KEY} not found in mock Jira"
  exit 1
fi

ISSUE_SUMMARY=$(echo "${ISSUE_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin)['fields']['summary'])" 2>/dev/null)
ISSUE_TYPE=$(echo "${ISSUE_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin)['fields']['issuetype']['name'])" 2>/dev/null)
pass "Found ${ISSUE_KEY}: [${ISSUE_TYPE}] ${ISSUE_SUMMARY}"
echo ""

# ---------------------------------------------------------------------------
# Step 4 — Record initial state
# ---------------------------------------------------------------------------
info "Recording initial state..."

INITIAL_STATUS=$(echo "${ISSUE_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin)['fields']['status']['name'])" 2>/dev/null)
INITIAL_COMMENTS=$(echo "${ISSUE_RESP}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['fields']['comment']['comments']))" 2>/dev/null)

info "  Status:   ${INITIAL_STATUS}"
info "  Comments: ${INITIAL_COMMENTS}"
echo ""

# ---------------------------------------------------------------------------
# Step 5 — Fire webhook via mock trigger
# ---------------------------------------------------------------------------
info "Firing webhook: POST ${MOCK_JIRA}/mock/trigger"
info "  issueKey: ${ISSUE_KEY}, event: issue_created"

TRIGGER_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST "${MOCK_JIRA}/mock/trigger" \
  -H "Content-Type: application/json" \
  -d "{\"issueKey\":\"${ISSUE_KEY}\",\"event\":\"issue_created\"}")

TRIGGER_HTTP=$(echo "${TRIGGER_RESP}" | tail -1)
TRIGGER_BODY=$(echo "${TRIGGER_RESP}" | sed '$d')

if [ "${TRIGGER_HTTP}" != "200" ]; then
  fail "Trigger endpoint returned HTTP ${TRIGGER_HTTP}"
  echo "     Response: ${TRIGGER_BODY}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 6 — Verify trigger response
# ---------------------------------------------------------------------------
TRIGGERED=$(echo "${TRIGGER_BODY}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('triggered', False))" 2>/dev/null)
WEBHOOK_STATUS=$(echo "${TRIGGER_BODY}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('webhookStatus', 0))" 2>/dev/null)

if [ "${TRIGGERED}" != "True" ]; then
  fail "Trigger response has triggered=${TRIGGERED} (expected True)"
  echo "     Response: ${TRIGGER_BODY}"
  exit 1
fi

if [ "${WEBHOOK_STATUS}" != "202" ]; then
  fail "Webhook status is ${WEBHOOK_STATUS} (expected 202)"
  echo "     Response: ${TRIGGER_BODY}"
  exit 1
fi

pass "Webhook triggered successfully (webhookStatus: 202)"
echo ""

# ---------------------------------------------------------------------------
# Step 7 — Poll for changes
# ---------------------------------------------------------------------------
info "Polling ${ISSUE_KEY} for changes (timeout: ${POLL_TIMEOUT}s, interval: ${POLL_INTERVAL}s)..."

ELAPSED=0
CHANGED=false

while [ "${ELAPSED}" -lt "${POLL_TIMEOUT}" ]; do
  wait_ "Checking after ${ELAPSED}s..."

  POLL_RESP=$(curl -sf "${MOCK_JIRA}/rest/api/3/issue/${ISSUE_KEY}" 2>/dev/null || echo "")

  if [ -n "${POLL_RESP}" ]; then
    CURRENT_STATUS=$(echo "${POLL_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin)['fields']['status']['name'])" 2>/dev/null)
    CURRENT_COMMENTS=$(echo "${POLL_RESP}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['fields']['comment']['comments']))" 2>/dev/null)

    if [ "${CURRENT_STATUS}" != "${INITIAL_STATUS}" ] || [ "${CURRENT_COMMENTS}" -gt "${INITIAL_COMMENTS}" ]; then
      CHANGED=true
      break
    fi
  fi

  sleep "${POLL_INTERVAL}"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo ""

# ---------------------------------------------------------------------------
# Step 8 — Report results
# ---------------------------------------------------------------------------
echo "============================================"
echo "  Results"
echo "============================================"
echo ""

if [ "${CHANGED}" = true ]; then
  pass "Changes detected on ${ISSUE_KEY}!"
  echo ""
  if [ "${CURRENT_STATUS}" != "${INITIAL_STATUS}" ]; then
    pass "  Status changed: ${INITIAL_STATUS} -> ${CURRENT_STATUS}"
  fi
  if [ "${CURRENT_COMMENTS}" -gt "${INITIAL_COMMENTS}" ]; then
    NEW_COUNT=$((CURRENT_COMMENTS - INITIAL_COMMENTS))
    pass "  New comments: +${NEW_COUNT} (total: ${CURRENT_COMMENTS})"
  fi
  echo ""
  pass "E2E Bug-Fix Workflow Test PASSED"
  echo ""
  exit 0
else
  fail "No changes detected after ${POLL_TIMEOUT}s timeout"
  echo ""
  info "  Status:   ${INITIAL_STATUS} (unchanged)"
  info "  Comments: ${INITIAL_COMMENTS} (unchanged)"
  echo ""
  info "Troubleshooting:"
  echo "     - Is workflow-engine running? (pnpm dev:workflow)"
  echo "     - Check workflow-engine logs for errors"
  echo "     - Check pg-boss queue for pending jobs"
  echo ""
  fail "E2E Bug-Fix Workflow Test FAILED"
  echo ""
  exit 1
fi
