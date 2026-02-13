#!/bin/bash

# Test Validation Script
# Validates OpenClaw Gateway and RTB Hub integration

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:3000}"
RTB_HUB_URL="${RTB_HUB_URL:-http://localhost:4000}"
HOOKS_TOKEN="${OPENCLAW_HOOKS_TOKEN:-rtb-ai-hub-openclaw-hooks-token-2026}"

PASSED=0
FAILED=0

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((FAILED++))
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

check_gateway_health() {
  log_info "Checking Gateway Health..."
  
  if curl -s "${GATEWAY_URL}/health" | grep -q '"status":"ok"'; then
    log_pass "Gateway is healthy"
  else
    log_fail "Gateway health check failed"
    return 1
  fi
}

check_agents() {
  log_info "Checking Agent Registration..."
  
  AGENT_RESPONSE=$(curl -s "${GATEWAY_URL}/agents")
  AGENT_COUNT=$(echo "$AGENT_RESPONSE" | grep -o '"id"' | wc -l)
  
  if [ "$AGENT_COUNT" -eq 7 ]; then
    log_pass "All 7 agents registered"
  else
    log_fail "Expected 7 agents, found $AGENT_COUNT"
    return 1
  fi
  
  # Check specific agents
  for agent in pm-agent system-planner-agent ux-designer-agent ui-dev-agent backend-dev-agent qa-agent ops-agent; do
    if echo "$AGENT_RESPONSE" | grep -q "\"id\":\"$agent\""; then
      log_pass "Agent $agent registered"
    else
      log_fail "Agent $agent not found"
    fi
  done
}

check_pm_agent() {
  log_info "Checking PM Agent (Coordinator)..."
  
  PM_RESPONSE=$(curl -s "${GATEWAY_URL}/agents/pm-agent")
  
  if echo "$PM_RESPONSE" | grep -q '"role":"PM Agent"'; then
    log_pass "PM Agent has correct role"
  else
    log_fail "PM Agent role mismatch"
  fi
  
  if echo "$PM_RESPONSE" | grep -q '"name":"VisionKeeper"'; then
    log_pass "PM Agent has correct name"
  else
    log_fail "PM Agent name mismatch"
  fi
}

check_rtb_hub() {
  log_info "Checking RTB Hub Connection..."
  
  if curl -s "${RTB_HUB_URL}/health" | grep -q '"status":"ok"'; then
    log_pass "RTB Hub is healthy"
  else
    log_fail "RTB Hub health check failed"
    return 1
  fi
}

check_webhook_endpoint() {
  log_info "Checking Webhook Endpoint..."
  
  # Test without token (should fail)
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    "${GATEWAY_URL}/webhooks/rtb-hub" \
    -d '{"eventType":"test"}')
  
  if [ "$HTTP_STATUS" -eq 401 ]; then
    log_pass "Webhook rejects unauthorized requests"
  else
    log_fail "Webhook should reject requests without token"
  fi
  
  # Test with token
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Webhook-Token: $HOOKS_TOKEN" \
    "${GATEWAY_URL}/webhooks/rtb-hub" \
    -d '{"eventType":"test","timestamp":"2026-01-01T00:00:00Z","source":"validation","data":{}}')
  
  if [ "$HTTP_STATUS" -eq 202 ]; then
    log_pass "Webhook accepts valid requests"
  else
    log_fail "Webhook rejected valid request (status: $HTTP_STATUS)"
  fi
}

check_slack_tokens() {
  log_info "Checking Slack Token Validity..."
  
  if [ -z "$SLACK_BOT_TOKEN" ]; then
    log_warn "SLACK_BOT_TOKEN not set"
  else
    TOKEN_TEST=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      https://slack.com/api/auth.test)
    
    if echo "$TOKEN_TEST" | grep -q '"ok":true'; then
      log_pass "Slack Bot Token is valid"
    else
      log_fail "Slack Bot Token is invalid"
    fi
  fi
  
  if [ -z "$SLACK_APP_TOKEN" ]; then
    log_warn "SLACK_APP_TOKEN not set"
  else
    if [[ "$SLACK_APP_TOKEN" == xapp-* ]]; then
      log_pass "Slack App Token format is correct"
    else
      log_fail "Slack App Token format is incorrect"
    fi
  fi
}

check_environment() {
  log_info "Checking Environment Variables..."
  
  REQUIRED_VARS=(
    "OPENCLAW_GATEWAY_URL"
    "OPENCLAW_HOOKS_TOKEN"
    "ANTHROPIC_API_KEY"
  )
  
  for var in "${REQUIRED_VARS[@]}"; do
    if [ -n "${!var}" ]; then
      log_pass "Environment variable $var is set"
    else
      log_fail "Environment variable $var is not set"
    fi
  done
}

check_agent_communication() {
  log_info "Checking Agent Communication..."
  
  # Test PM Agent
  RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $HOOKS_TOKEN" \
    "${GATEWAY_URL}/agents/pm-agent/message" \
    -d '{"message":"Hello","context":{"test":true}}' 2>/dev/null)
  
  if echo "$RESPONSE" | grep -q '"response"'; then
    log_pass "PM Agent responds to messages"
  else
    log_fail "PM Agent communication failed"
  fi
}

run_all_validations() {
  echo "================================"
  echo "OpenClaw Integration Validation"
  echo "================================"
  echo ""
  
  check_environment
  check_gateway_health
  check_agents
  check_pm_agent
  check_rtb_hub
  check_webhook_endpoint
  check_slack_tokens
  check_agent_communication
  
  echo ""
  echo "================================"
  echo "Validation Complete"
  echo "================================"
  echo -e "${GREEN}Passed: $PASSED${NC}"
  echo -e "${RED}Failed: $FAILED${NC}"
  
  if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All validations passed! Ready for testing.${NC}"
    exit 0
  else
    echo -e "${RED}Some validations failed. Please fix before continuing.${NC}"
    exit 1
  fi
}

# Parse arguments
case "${1:-all}" in
  env)
    check_environment
    ;;
  gateway)
    check_gateway_health
    check_agents
    check_pm_agent
    ;;
  slack)
    check_slack_tokens
    ;;
  webhook)
    check_webhook_endpoint
    ;;
  all|*)
    run_all_validations
    ;;
esac
