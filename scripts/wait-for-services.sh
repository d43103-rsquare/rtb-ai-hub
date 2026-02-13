#!/bin/bash

# Wait for services to be ready
# Usage: ./scripts/wait-for-services.sh [--timeout=300]

set -e

TIMEOUT=300
INTERVAL=5

while [[ $# -gt 0 ]]; do
  case $1 in
    --timeout=*)
      TIMEOUT="${1#*=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

SERVICES=(
  "PostgreSQL:localhost:5432"
  "Redis:localhost:6379"
  "OpenClaw Gateway:${OPENCLAW_GATEWAY_URL:-http://localhost:3000}/health"
  "RTB Hub:${RTB_HUB_URL:-http://localhost:4000}/health"
)

echo "Waiting for services to be ready..."
echo "Timeout: ${TIMEOUT}s"
echo ""

START_TIME=$(date +%s)

for service in "${SERVICES[@]}"; do
  IFS=':' read -r name url <<< "$service"
  
  echo -n "Waiting for $name... "
  
  while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    if [ $ELAPSED -gt $TIMEOUT ]; then
      echo "TIMEOUT"
      exit 1
    fi
    
    if [[ "$url" == http* ]]; then
      if curl -s "$url" > /dev/null 2>&1; then
        echo "✓ Ready (${ELAPSED}s)"
        break
      fi
    else
      host="${url%%:*}"
      port="${url##*:}"
      if nc -z "$host" "$port" 2>/dev/null; then
        echo "✓ Ready (${ELAPSED}s)"
        break
      fi
    fi
    
    sleep $INTERVAL
  done
done

echo ""
echo "All services are ready!"
