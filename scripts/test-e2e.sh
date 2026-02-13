#!/bin/bash

# End-to-End Test Runner
# Usage: ./scripts/test-e2e.sh [--quick|--full|--scenario=<n>]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="full"
SCENARIO=""
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --quick)
      MODE="quick"
      shift
      ;;
    --full)
      MODE="full"
      shift
      ;;
    --scenario=*)
      MODE="scenario"
      SCENARIO="${1#*=}"
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --quick          Quick connectivity test only"
      echo "  --full           Full E2E test suite (default)"
      echo "  --scenario=<n>   Run specific scenario (1, 2, or 3)"
      echo "  --verbose        Verbose output"
      echo "  --help           Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}RTB AI Hub E2E Test Runner${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Health check function
check_service() {
  local name=$1
  local url=$2
  local max_retries=${3:-30}
  local retry_delay=${4:-1}
  
  echo -n "Checking $name... "
  
  for i in $(seq 1 $max_retries); do
    if curl -s "$url" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ OK${NC}"
      return 0
    fi
    sleep $retry_delay
  done
  
  echo -e "${RED}✗ FAILED${NC}"
  return 1
}

# Quick mode - just connectivity tests
if [ "$MODE" = "quick" ]; then
  echo -e "${YELLOW}Running quick connectivity tests...${NC}"
  echo ""
  
  check_service "OpenClaw Gateway" "${OPENCLAW_GATEWAY_URL:-http://localhost:3000}/health" 5 1
  check_service "RTB Hub Webhook" "${RTB_HUB_URL:-http://localhost:4000}/health" 5 1
  check_service "RTB Workflow Engine" "${RTB_HUB_URL:-http://localhost:4000}/api/health/workflow" 5 1
  
  echo ""
  echo -e "${GREEN}All services are healthy!${NC}"
  exit 0
fi

# Full mode - comprehensive tests
if [ "$MODE" = "full" ]; then
  echo -e "${YELLOW}Running full E2E test suite...${NC}"
  echo ""
  
  # Pre-test checks
  echo "Step 1: Pre-test checks"
  echo "======================="
  check_service "OpenClaw Gateway" "${OPENCLAW_GATEWAY_URL:-http://localhost:3000}/health"
  check_service "RTB Hub" "${RTB_HUB_URL:-http://localhost:4000}/health"
  
  # Check agent availability
  echo -n "Checking agents... "
  AGENT_COUNT=$(curl -s "${OPENCLAW_GATEWAY_URL:-http://localhost:3000}/agents" | grep -o '"id"' | wc -l)
  if [ "$AGENT_COUNT" -eq 7 ]; then
    echo -e "${GREEN}✓ All 7 agents available${NC}"
  else
    echo -e "${YELLOW}⚠ Only $AGENT_COUNT agents available (expected 7)${NC}"
  fi
  
  echo ""
  
  # Run integration tests
  echo "Step 2: Running integration tests"
  echo "================================="
  if [ "$VERBOSE" = true ]; then
    pnpm test:integration -- --reporter=verbose
  else
    pnpm test:integration
  fi
  
  echo ""
  
  # Run scenario tests
  echo "Step 3: Running scenario tests"
  echo "=============================="
  if [ "$VERBOSE" = true ]; then
    pnpm test:e2e -- --reporter=verbose
  else
    pnpm test:e2e
  fi
  
  echo ""
  echo -e "${GREEN}================================${NC}"
  echo -e "${GREEN}All E2E tests completed!${NC}"
  echo -e "${GREEN}================================${NC}"
  
  exit 0
fi

# Scenario mode - run specific scenario
if [ "$MODE" = "scenario" ]; then
  echo -e "${YELLOW}Running Scenario $SCENARIO...${NC}"
  echo ""
  
  case $SCENARIO in
    1)
      pnpm test:e2e -- --testNamePattern="Scenario 1"
      ;;
    2)
      pnpm test:e2e -- --testNamePattern="Scenario 2"
      ;;
    3)
      pnpm test:e2e -- --testNamePattern="Scenario 3"
      ;;
    *)
      echo -e "${RED}Invalid scenario number: $SCENARIO${NC}"
      echo "Valid scenarios: 1, 2, 3"
      exit 1
      ;;
  esac
  
  exit 0
fi
