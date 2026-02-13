#!/bin/bash

# =============================================================================
# RTB AI Hub — Local CI Pipeline
# =============================================================================
# GitHub Actions CI와 동일한 검증을 로컬에서 실행합니다.
#
# 사용법:
#   pnpm ci:local          # 전체 파이프라인
#   pnpm ci:local --quick  # lint + typecheck만 (테스트/빌드 스킵)
#   pnpm ci:local --fix    # lint/format 자동 수정 후 검증
# =============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── State ───────────────────────────────────────────────────────────────────
QUICK=false
FIX=false
FAILED_STEPS=()
START_TIME=$(date +%s)
STEP_NUM=0
TOTAL_STEPS=6

# ─── Parse args ──────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --quick|-q)  QUICK=true; TOTAL_STEPS=3 ;;
    --fix|-f)    FIX=true ;;
    --help|-h)
      echo "Usage: $0 [--quick|-q] [--fix|-f]"
      echo ""
      echo "  --quick, -q   lint + typecheck only (skip test/build)"
      echo "  --fix, -f     auto-fix lint/format issues before checking"
      exit 0
      ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────
step() {
  STEP_NUM=$((STEP_NUM + 1))
  echo ""
  echo -e "${BLUE}${BOLD}[$STEP_NUM/$TOTAL_STEPS] $1${NC}"
  echo -e "${BLUE}$(printf '%.0s─' {1..60})${NC}"
}

pass() {
  echo -e "  ${GREEN}✓ $1${NC}"
}

fail() {
  echo -e "  ${RED}✗ $1${NC}"
  FAILED_STEPS+=("$1")
}

run_step() {
  local name="$1"
  shift
  local step_start=$(date +%s)

  if "$@" 2>&1; then
    local elapsed=$(( $(date +%s) - step_start ))
    pass "$name (${elapsed}s)"
    return 0
  else
    local elapsed=$(( $(date +%s) - step_start ))
    fail "$name (${elapsed}s)"
    return 1
  fi
}

# ─── Header ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}RTB AI Hub — Local CI Pipeline${NC}"
if $QUICK; then
  echo -e "${YELLOW}Mode: Quick (lint + typecheck only)${NC}"
elif $FIX; then
  echo -e "${YELLOW}Mode: Fix (auto-fix then verify)${NC}"
else
  echo -e "Mode: Full (matches GitHub Actions CI)"
fi
echo -e "$(printf '%.0s═' {1..60})"

# ─── Step 1: Lint ────────────────────────────────────────────────────────────
step "ESLint"
if $FIX; then
  run_step "ESLint (auto-fix)" pnpm lint:fix || true
  run_step "ESLint (verify)" pnpm lint
else
  run_step "ESLint" pnpm lint
fi

# ─── Step 2: Format ─────────────────────────────────────────────────────────
step "Prettier"
if $FIX; then
  run_step "Prettier (auto-fix)" pnpm format || true
  run_step "Prettier (verify)" pnpm format:check
else
  run_step "Prettier" pnpm format:check
fi

# ─── Step 3: Build Shared (prerequisite) ─────────────────────────────────────
step "Build shared package"
run_step "build:shared" pnpm build:shared

# ─── Step 4: Typecheck ──────────────────────────────────────────────────────
if ! $QUICK; then
  step "TypeScript type check"
  run_step "typecheck" pnpm typecheck
fi

# ─── Step 5: Test ────────────────────────────────────────────────────────────
if ! $QUICK; then
  step "Tests (vitest)"
  run_step "test" pnpm test
fi

# ─── Step 6: Build ──────────────────────────────────────────────────────────
if ! $QUICK; then
  step "Full build"
  run_step "build" pnpm build
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TIME ))
echo ""
echo -e "$(printf '%.0s═' {1..60})"

if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ All checks passed${NC} (${ELAPSED}s)"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}✗ ${#FAILED_STEPS[@]} check(s) failed${NC} (${ELAPSED}s)"
  for step_name in "${FAILED_STEPS[@]}"; do
    echo -e "  ${RED}• $step_name${NC}"
  done
  echo ""
  exit 1
fi
