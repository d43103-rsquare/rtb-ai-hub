#!/bin/bash

# ============================================================================
# Environment Setup Script
# ============================================================================
# 카테고리별 환경변수 파일 초기 설정 자동화
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     RTB AI Hub - Environment Setup           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ Error: Run this script from project root${NC}"
  exit 1
fi

copy_if_not_exists() {
  local example_file=$1
  local target_file=$2
  local description=$3
  
  if [ -f "$target_file" ]; then
    echo -e "${YELLOW}⚠️  ${target_file} already exists - skipping${NC}"
  else
    cp "$example_file" "$target_file"
    echo -e "${GREEN}✅ Created ${target_file}${NC}"
    echo -e "   ${description}"
  fi
}

echo -e "${BLUE}📝 Step 1: Creating environment files...${NC}"
echo ""

copy_if_not_exists ".env.base.example" ".env.base" "기본 설정 (포트, 인프라)"
copy_if_not_exists ".env.auth.example" ".env.auth" "인증 설정 (Google OAuth, JWT)"
copy_if_not_exists ".env.services.example" ".env.services" "외부 서비스 (Jira, Figma, GitHub 등)"
copy_if_not_exists ".env.ai.example" ".env.ai" "AI 설정 (Anthropic Claude)"
copy_if_not_exists ".env.advanced.example" ".env.advanced" "고급 기능 (멀티 환경, 리포 라우팅)"

echo ""
echo -e "${BLUE}🔐 Step 2: Generating security keys...${NC}"
echo ""

if ! grep -q "^JWT_SECRET=your-jwt-secret" .env.auth 2>/dev/null || [ ! -f .env.auth ]; then
  echo -e "${YELLOW}Generating JWT_SECRET and CREDENTIAL_ENCRYPTION_KEY...${NC}"
  node scripts/generate-secrets.js
  echo -e "${GREEN}✅ Security keys generated${NC}"
  echo -e "   ${YELLOW}Please copy the keys to .env.auth${NC}"
else
  echo -e "${YELLOW}⚠️  .env.auth already configured - skipping key generation${NC}"
fi

echo ""
echo -e "${BLUE}📋 Step 3: Configuration checklist${NC}"
echo ""
echo -e "${GREEN}Required for basic operation:${NC}"
echo -e "  [ ] .env.base    - ✅ Basic settings (ports, DB) - Ready to use"
echo -e "  [ ] .env.auth    - ⚠️  Set DEV_MODE=true + JWT_SECRET"
echo -e "  [ ] .env.ai      - ⚠️  Set ANTHROPIC_API_KEY"
echo ""
echo -e "${YELLOW}Optional (set if needed):${NC}"
echo -e "  [ ] .env.services  - Jira, Figma, GitHub, Datadog tokens"
echo -e "  [ ] .env.advanced  - Multi-environment, repo routing"
echo ""

echo -e "${BLUE}🚀 Quick Start Guide:${NC}"
echo ""
echo -e "${GREEN}1. Configure required files:${NC}"
echo -e "   ${YELLOW}# Edit authentication settings${NC}"
echo -e "   nano .env.auth"
echo -e "   ${YELLOW}# Set: DEV_MODE=true, DEV_USER_EMAIL, JWT_SECRET${NC}"
echo ""
echo -e "   ${YELLOW}# Edit AI settings${NC}"
echo -e "   nano .env.ai"
echo -e "   ${YELLOW}# Set: ANTHROPIC_API_KEY=sk-ant-your-key${NC}"
echo ""
echo -e "${GREEN}2. Start development:${NC}"
echo -e "   ./scripts/dev-local.sh"
echo ""
echo -e "${GREEN}3. Test login:${NC}"
echo -e "   open http://localhost:4001/auth/dev/login"
echo ""

echo -e "${BLUE}📚 Documentation:${NC}"
echo -e "   - ENV_SETUP.md - Detailed setup guide"
echo -e "   - README.md - Project overview"
echo ""

echo -e "${GREEN}✨ Setup complete!${NC}"
