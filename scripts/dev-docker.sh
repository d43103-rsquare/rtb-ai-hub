#!/bin/bash

# Docker-based Local Development Setup
# Usage: ./scripts/dev-docker.sh [start|stop|restart|logs|status|setup]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.dev.yml"
ENV_FILE=".env.local"

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

check_docker() {
  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
  fi
  
  if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed"
    exit 1
  fi
  
  if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running"
    exit 1
  fi
}

setup_env() {
  log_info "Setting up environment..."
  
  if [ ! -f "$ENV_FILE" ]; then
    if [ -f ".env.docker-dev" ]; then
      cp .env.docker-dev "$ENV_FILE"
      log_success "Created $ENV_FILE from template"
      log_warn "Please edit $ENV_FILE and add your API keys"
    else
      log_error "Template file .env.docker-dev not found"
      exit 1
    fi
  else
    log_info "$ENV_FILE already exists"
  fi
}

start_services() {
  log_info "Starting Docker infrastructure..."
  
  export COMPOSE_FILE
  export ENV_FILE
  
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  
  log_info "Waiting for services to be ready..."
  sleep 5
  
  # Check health
  check_health
  
  log_success "All services are running!"
  echo ""
  echo "Service URLs:"
  echo "  PostgreSQL: localhost:5432"
  echo "  Redis:      localhost:6379"
  echo "  OpenClaw:   http://localhost:3000"
  echo ""
  echo "Next steps:"
  echo "  1. Run local services: pnpm dev"
  echo "  2. Check status:       ./scripts/dev-docker.sh status"
  echo "  3. View logs:          ./scripts/dev-docker.sh logs"
}

stop_services() {
  log_info "Stopping Docker infrastructure..."
  
  export COMPOSE_FILE
  export ENV_FILE
  
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
  
  log_success "Services stopped"
}

restart_services() {
  log_info "Restarting services..."
  stop_services
  sleep 2
  start_services
}

view_logs() {
  export COMPOSE_FILE
  export ENV_FILE
  
  if [ -n "$1" ]; then
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f "$1"
  else
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f
  fi
}

check_status() {
  export COMPOSE_FILE
  export ENV_FILE
  
  echo "Docker Services:"
  echo "================"
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
  
  echo ""
  echo "Health Checks:"
  echo "=============="
  
  # Check PostgreSQL
  if docker exec rtb-postgres-dev pg_isready -U postgres &> /dev/null; then
    echo -e "PostgreSQL: ${GREEN}✓ Healthy${NC}"
  else
    echo -e "PostgreSQL: ${RED}✗ Unhealthy${NC}"
  fi
  
  # Check Redis
  if docker exec rtb-redis-dev redis-cli ping &> /dev/null | grep -q "PONG"; then
    echo -e "Redis:      ${GREEN}✓ Healthy${NC}"
  else
    echo -e "Redis:      ${RED}✗ Unhealthy${NC}"
  fi
  
  # Check OpenClaw
  if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
    echo -e "OpenClaw:   ${GREEN}✓ Healthy${NC}"
  else
    echo -e "OpenClaw:   ${RED}✗ Unhealthy${NC}"
  fi
}

check_health() {
  local retries=30
  local wait=2
  
  for i in $(seq 1 $retries); do
    local all_healthy=true
    
    # Check PostgreSQL
    if ! docker exec rtb-postgres-dev pg_isready -U postgres &> /dev/null; then
      all_healthy=false
    fi
    
    # Check Redis
    if ! docker exec rtb-redis-dev redis-cli ping &> /dev/null | grep -q "PONG"; then
      all_healthy=false
    fi
    
    # Check OpenClaw
    if ! curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
      all_healthy=false
    fi
    
    if [ "$all_healthy" = true ]; then
      return 0
    fi
    
    echo -n "."
    sleep $wait
  done
  
  echo ""
  log_error "Services failed to become healthy within $((retries * wait)) seconds"
  return 1
}

cleanup() {
  log_warn "This will remove all data volumes. Are you sure? (y/N)"
  read -r response
  if [[ "$response" =~ ^[Yy]$ ]]; then
    export COMPOSE_FILE
    export ENV_FILE
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v
    log_success "Cleanup complete"
  else
    log_info "Cleanup cancelled"
  fi
}

# Main
case "${1:-start}" in
  setup)
    check_docker
    setup_env
    log_success "Setup complete! Run './scripts/dev-docker.sh start' to begin"
    ;;
  start)
    check_docker
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    restart_services
    ;;
  logs)
    view_logs "$2"
    ;;
  status)
    check_status
    ;;
  cleanup)
    cleanup
    ;;
  *)
    echo "Usage: $0 [setup|start|stop|restart|logs|status|cleanup]"
    echo ""
    echo "Commands:"
    echo "  setup    - Initialize environment and configuration"
    echo "  start    - Start Docker infrastructure (default)"
    echo "  stop     - Stop Docker infrastructure"
    echo "  restart  - Restart all services"
    echo "  logs     - View logs (optionally specify service: postgres, redis, openclaw)"
    echo "  status   - Check service status and health"
    echo "  cleanup  - Remove all containers and volumes (DANGER: data loss)"
    echo ""
    echo "Examples:"
    echo "  $0 setup"
    echo "  $0 start"
    echo "  $0 logs openclaw"
    exit 1
    ;;
esac
