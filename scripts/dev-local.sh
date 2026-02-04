#!/bin/bash

# RTB AI Hub - 로컬 개발 환경 실행 스크립트

set -e

echo "🚀 RTB AI Hub 로컬 개발 환경 시작"
echo ""

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. pnpm 설치 확인
echo -e "${YELLOW}1. pnpm 설치 확인...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo "pnpm이 설치되지 않았습니다. 설치 중..."
    npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm $(pnpm --version)${NC}"
echo ""

# 2. 의존성 설치
echo -e "${YELLOW}2. 의존성 설치 중... (최초 실행 시 시간이 걸릴 수 있습니다)${NC}"
pnpm install
echo -e "${GREEN}✓ 의존성 설치 완료${NC}"
echo ""

# 3. shared 패키지 빌드
echo -e "${YELLOW}3. shared 패키지 빌드 중...${NC}"
pnpm --filter @rtb-ai-hub/shared run build
echo -e "${GREEN}✓ shared 빌드 완료${NC}"
echo ""

# 4. 백엔드 서비스 빌드
echo -e "${YELLOW}4. 백엔드 서비스 빌드 중...${NC}"
pnpm --filter @rtb-ai-hub/auth-service run build
pnpm --filter @rtb-ai-hub/webhook-listener run build
pnpm --filter @rtb-ai-hub/workflow-engine run build
echo -e "${GREEN}✓ 백엔드 빌드 완료${NC}"
echo ""

# 5. Docker 서비스 시작 (PostgreSQL, Redis만)
echo -e "${YELLOW}5. Docker 인프라 시작 중 (PostgreSQL, Redis)...${NC}"
docker-compose -f docker-compose.test.yml up -d postgres redis
echo "데이터베이스 초기화 대기 중..."
sleep 5
echo -e "${GREEN}✓ Docker 인프라 시작 완료${NC}"
echo ""

echo -e "${GREEN}✨ 로컬 개발 환경 준비 완료!${NC}"
echo ""
echo "다음 명령어로 각 서비스를 실행하세요:"
echo ""
echo "  Auth Service:       pnpm dev:auth"
echo "  Webhook Listener:   pnpm dev:webhook"
echo "  Workflow Engine:    pnpm dev:workflow"
echo "  Dashboard:          pnpm dev:dashboard"
echo ""
echo "또는 터미널을 4개 열어서 동시에 실행하세요."
