#!/bin/bash

# =============================================================================
# RTB AI Hub — Local CD (Rolling Deploy)
# =============================================================================
# docker-compose.test.yml 기준으로 서비스를 순차적으로 교체합니다.
# 각 서비스마다: rebuild → restart → health check → 다음 서비스
# health check 실패 시 해당 서비스를 이전 이미지로 롤백합니다.
#
# 사용법:
#   pnpm deploy                        # 전체 서비스 순차 배포
#   pnpm deploy -- --service webhook-listener  # 특정 서비스만
#   pnpm deploy -- --skip-ci           # CI 검증 스킵
#   pnpm deploy -- --with-opencode     # OpenCode 서비스 포함
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.test.yml"
COMPOSE="docker compose -f $COMPOSE_FILE"

INFRA_SERVICES=("postgres" "redis")
APP_SERVICES=("auth-service" "workflow-engine" "webhook-listener" "dashboard")
OPENCODE_SERVICES=("opencode-cli" "opencode-server")

HEALTH_TIMEOUT=60
HEALTH_INTERVAL=3
SKIP_CI=false
TARGET_SERVICE=""
WITH_OPENCODE=false
DRY_RUN=false
START_TIME=$(date +%s)

for arg in "$@"; do
  case "$arg" in
    --skip-ci)       SKIP_CI=true ;;
    --with-opencode) WITH_OPENCODE=true ;;
    --dry-run)       DRY_RUN=true ;;
    --service)       shift_next=true ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "  --service <name>   Deploy specific service only"
      echo "  --skip-ci          Skip CI verification before deploy"
      echo "  --with-opencode    Include OpenCode services"
      echo "  --dry-run          Show what would happen without executing"
      exit 0
      ;;
    *)
      if [ "${shift_next:-false}" = true ]; then
        TARGET_SERVICE="$arg"
        shift_next=false
      fi
      ;;
  esac
done

log()  { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }
err()  { echo -e "${RED}  ✗${NC} $1"; }

get_image_id() {
  local service="$1"
  docker inspect --format='{{.Image}}' "rtb-${service}" 2>/dev/null || echo ""
}

wait_for_health() {
  local service="$1"
  local container="rtb-${service}"
  local elapsed=0

  while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")

    case "$health" in
      healthy)
        ok "$service is healthy (${elapsed}s)"
        return 0
        ;;
      unhealthy)
        err "$service is unhealthy"
        return 1
        ;;
      missing)
        if [ $elapsed -gt 10 ]; then
          err "$service container not found"
          return 1
        fi
        ;;
    esac

    sleep $HEALTH_INTERVAL
    elapsed=$((elapsed + HEALTH_INTERVAL))
    printf "\r  ${DIM}Waiting for %s... %ds/${HEALTH_TIMEOUT}s${NC}" "$service" "$elapsed"
  done

  printf "\n"
  err "$service health check timed out (${HEALTH_TIMEOUT}s)"
  return 1
}

rollback_service() {
  local service="$1"
  local prev_image="$2"

  if [ -z "$prev_image" ]; then
    warn "No previous image for $service — cannot rollback"
    return 1
  fi

  warn "Rolling back $service..."
  $COMPOSE up -d --no-build "$service" 2>/dev/null
  if wait_for_health "$service"; then
    ok "Rollback successful for $service"
    return 0
  else
    err "Rollback also failed for $service"
    return 1
  fi
}

deploy_service() {
  local service="$1"
  log "${BOLD}Deploying $service${NC}"

  if $DRY_RUN; then
    ok "[dry-run] Would rebuild and restart $service"
    return 0
  fi

  local prev_image
  prev_image=$(get_image_id "$service")

  log "Building $service..."
  if ! $COMPOSE build --no-cache "$service" 2>&1; then
    err "Build failed for $service"
    return 1
  fi

  log "Replacing $service..."
  if ! $COMPOSE up -d --no-deps "$service" 2>&1; then
    err "Start failed for $service"
    rollback_service "$service" "$prev_image"
    return 1
  fi

  printf "\n"
  if ! wait_for_health "$service"; then
    rollback_service "$service" "$prev_image"
    return 1
  fi

  return 0
}

ensure_infra() {
  log "Ensuring infrastructure is running..."

  for svc in "${INFRA_SERVICES[@]}"; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "rtb-${svc}" 2>/dev/null || echo "missing")

    if [ "$status" = "healthy" ]; then
      ok "$svc is already healthy"
    else
      log "Starting $svc..."
      $COMPOSE up -d "$svc"
      if ! wait_for_health "$svc"; then
        err "Infrastructure service $svc failed to start. Aborting."
        exit 1
      fi
    fi
  done
}

echo ""
echo -e "${BOLD}RTB AI Hub — Local Rolling Deploy${NC}"
echo -e "$(printf '%.0s═' {1..60})"
echo -e "Compose:  ${DIM}$COMPOSE_FILE${NC}"
echo -e "Target:   ${DIM}${TARGET_SERVICE:-all app services}${NC}"
$WITH_OPENCODE && echo -e "OpenCode: ${GREEN}included${NC}"
$DRY_RUN && echo -e "Mode:     ${YELLOW}DRY RUN${NC}"
echo ""

if ! $SKIP_CI && ! $DRY_RUN; then
  log "Running CI checks first..."
  if bash "$(dirname "$0")/ci-local.sh" --quick; then
    ok "CI checks passed"
  else
    err "CI checks failed. Fix issues before deploying."
    echo -e "  ${DIM}Use --skip-ci to bypass (not recommended)${NC}"
    exit 1
  fi
  echo ""
fi

if ! $DRY_RUN; then
  ensure_infra
  echo ""
fi

DEPLOY_TARGETS=()
if [ -n "$TARGET_SERVICE" ]; then
  DEPLOY_TARGETS+=("$TARGET_SERVICE")
else
  DEPLOY_TARGETS=("${APP_SERVICES[@]}")
  if $WITH_OPENCODE; then
    DEPLOY_TARGETS+=("${OPENCODE_SERVICES[@]}")
  fi
fi

DEPLOYED=()
FAILED=()

for service in "${DEPLOY_TARGETS[@]}"; do
  if deploy_service "$service"; then
    DEPLOYED+=("$service")
  else
    FAILED+=("$service")
    err "Stopping deploy pipeline — $service failed"
    break
  fi
  echo ""
done

ELAPSED=$(( $(date +%s) - START_TIME ))
echo -e "$(printf '%.0s═' {1..60})"

if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ Deploy complete${NC} (${ELAPSED}s)"
  echo -e "  Deployed: ${DEPLOYED[*]}"
else
  echo -e "${RED}${BOLD}✗ Deploy failed${NC} (${ELAPSED}s)"
  echo -e "  ${GREEN}Deployed: ${DEPLOYED[*]:-none}${NC}"
  echo -e "  ${RED}Failed:   ${FAILED[*]}${NC}"
  exit 1
fi

echo ""
echo -e "${DIM}Health check:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo -e "${NC}"
