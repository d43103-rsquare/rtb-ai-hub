# RTB AI Hub - 작업 체크리스트

## ✅ 완료된 작업

### Phase 1: 기초 인프라 구축

- [x] **Task 1: 프로젝트 구조 초기화**
  - [x] 루트 디렉토리 생성 (`rtb-ai-hub/`)
  - [x] `package.json` - npm workspaces 설정
  - [x] `tsconfig.base.json` - TypeScript strict mode 설정
  - [x] `.env.example` - 모든 환경변수 템플릿
  - [x] `.gitignore` - Node.js/Docker 패턴
  - [x] `.dockerignore` - 효율적인 Docker 빌드
  - [x] 전체 디렉토리 구조 생성 (packages, mcp-servers, infrastructure)

- [x] **Task 2: Shared 패키지 생성**
  - [x] `packages/shared/package.json` - 패키지 설정
  - [x] `packages/shared/tsconfig.json`
  - [x] `src/types.ts` - 모든 TypeScript 타입 (200+ 줄)
    - [x] WebhookEvent 타입 (Figma, Jira, GitHub, Datadog)
    - [x] WorkflowExecution 타입
    - [x] AIClient 인터페이스
    - [x] MCPTool 타입
    - [x] DashboardMetrics 타입
  - [x] `src/constants.ts` - 큐, 비용, 타임아웃 상수
  - [x] `src/utils.ts` - 로거, 환경변수 헬퍼, 재시도 로직
  - [x] `src/index.ts` - 통합 export

- [x] **Task 3: 인프라 설정**
  - [x] `infrastructure/postgres/init.sql`
    - [x] workflow_executions 테이블
    - [x] webhook_events 테이블
    - [x] metrics 테이블
    - [x] ai_costs 테이블
    - [x] 인덱스 생성 (8개)
    - [x] updated_at 트리거 함수
  - [x] `infrastructure/redis/redis.conf`
    - [x] AOF 영속성 설정
    - [x] maxmemory 설정
    - [x] 저장 정책

### Phase 2: Docker 설정

- [x] **Task 4: Docker Compose 구성**
  - [x] `docker-compose.yml` - 9개 서비스 정의
    - [x] postgres 서비스 (헬스체크 포함)
    - [x] redis 서비스 (헬스체크 포함)
    - [x] mcp-jira 서비스
    - [x] mcp-figma 서비스
    - [x] mcp-github 서비스
    - [x] mcp-datadog 서비스
    - [x] workflow-engine 서비스
    - [x] webhook-listener 서비스
    - [x] dashboard 서비스
  - [x] 네트워크 설정 (rtb-network)
  - [x] 볼륨 설정 (postgres-data, redis-data)
  - [x] 포트 매핑
  - [x] 의존성 순서 (depends_on with conditions)

- [x] **Task 5: MCP 서버 컨테이너 설정**
  - [x] `mcp-servers/jira/Dockerfile` + `config.json`
  - [x] `mcp-servers/figma/Dockerfile` + `config.json`
  - [x] `mcp-servers/github/Dockerfile` + `config.json`
  - [x] `mcp-servers/datadog/Dockerfile` + `config.json`

### Phase 3: 백엔드 패키지 스켈레톤

- [x] **Task 6: Webhook Listener 패키지**
  - [x] `packages/webhook-listener/package.json`
  - [x] `packages/webhook-listener/tsconfig.json`
  - [x] `packages/webhook-listener/Dockerfile` (멀티 스테이지)
  - [x] `src/index.ts` - Express 앱 스켈레톤
  - [x] `src/routes/` 디렉토리
  - [x] `src/middleware/` 디렉토리

- [x] **Task 7: Workflow Engine 패키지**
  - [x] `packages/workflow-engine/package.json`
  - [x] `packages/workflow-engine/tsconfig.json`
  - [x] `packages/workflow-engine/Dockerfile` (멀티 스테이지)
  - [x] `src/index.ts` - BullMQ 워커 스켈레톤
  - [x] `src/workflows/` 디렉토리
  - [x] `src/clients/` 디렉토리
  - [x] `src/queue/` 디렉토리
  - [x] `src/utils/` 디렉토리

- [x] **Task 8: Dashboard 패키지**
  - [x] `packages/dashboard/package.json`
  - [x] `packages/dashboard/vite.config.ts`
  - [x] `packages/dashboard/tsconfig.json` + `tsconfig.node.json`
  - [x] `packages/dashboard/tailwind.config.js`
  - [x] `packages/dashboard/postcss.config.js`
  - [x] `packages/dashboard/index.html`
  - [x] `packages/dashboard/Dockerfile` (멀티 스테이지 + nginx)
  - [x] `packages/dashboard/nginx.conf`
  - [x] `src/main.tsx` - React 엔트리
  - [x] `src/App.tsx` - 루트 컴포넌트
  - [x] `src/index.css` - Tailwind imports
  - [x] `src/components/` 디렉토리
  - [x] `src/api/` 디렉토리

### Phase 4: 핵심 구현

- [x] **Task 9: Webhook 라우트 구현**
  - [x] `src/routes/figma.ts` - Figma 웹훅 핸들러
  - [x] `src/routes/jira.ts` - Jira 웹훅 핸들러
  - [x] `src/routes/github.ts` - GitHub 웹훅 핸들러
  - [x] `src/routes/datadog.ts` - Datadog 웹훅 핸들러
  - [x] `src/routes/index.ts` - 라우터 통합
  - [x] `src/index.ts` 업데이트 - 라우트 연결

- [x] **Task 10: BullMQ 큐 설정**
  - [x] `src/queue/connection.ts` - Redis 연결 팩토리
  - [x] `src/queue/queues.ts` - 4개 큐 정의
  - [x] `src/queue/workers.ts` - 4개 워커 팩토리
  - [x] `src/queue/index.ts` - 통합 export
  - [x] `src/index.ts` 업데이트 - 워커 시작 + graceful shutdown

### Phase 5: 문서화

- [x] **Task 11: 프로젝트 문서 작성**
  - [x] `README.md` - 완전한 프로젝트 문서 (250+ 줄)
    - [x] 기능 소개
    - [x] 아키텍처 다이어그램
    - [x] 빠른 시작 가이드
    - [x] 웹훅 API 문서 (4개 엔드포인트)
    - [x] 개발 가이드
    - [x] 프로젝트 구조
    - [x] AI 워크플로우 설명 (5개)
    - [x] 보안 가이드
    - [x] 트러블슈팅
    - [x] 기대 효과 지표

### Phase 5.5: 멀티 환경 지원

- [x] **Task 10.5: 멀티 환경(int/stg/prd) 지원 구현**
  - [x] `packages/shared/src/types.ts` — Environment 타입 추가
  - [x] `packages/shared/src/constants.ts` — MCP_ENDPOINTS_BY_ENV 매핑
  - [x] `packages/shared/src/db/schema.ts` — env 컬럼 추가
  - [x] Webhook 4개 라우트 — ?env= 쿼리 파라미터, X-Env 헤더 지원
  - [x] BullMQ workers — env 전파
  - [x] 5개 워크플로우 — env 파라미터 추가
  - [x] MCP client factory — getMcpClient(service, env)
  - [x] database.ts — env 저장
  - [x] docker-compose.yml — 환경별 MCP 컨테이너 8개 추가
  - [x] .env.example — 환경별 자격증명 플레이스홀더
  - [x] Drizzle 마이그레이션 — 0001_add_env_column.sql
  - [x] 테스트 업데이트 — 140개 전체 통과

---

## ⏳ 미구현 기능 (향후 작업)

### Phase 6: AI 클라이언트 구현

- [ ] **Task 11: AI 클라이언트 구현 (Claude only)**
  - [ ] `src/clients/anthropic.ts`
    - [ ] Anthropic 클라이언트 초기화
    - [ ] Heavy (Claude Opus) 설정
    - [ ] Medium (Claude Sonnet) 설정
    - [ ] Light (Claude Haiku) 설정
    - [ ] MCP 도구 호출 지원
  - [ ] `src/clients/mcp.ts`
    - [ ] MCP 도구 호출 헬퍼
    - [ ] 결과 파싱
  - [ ] `src/clients/index.ts` - 통합 인터페이스

- [ ] **Task 12: Dashboard 기본 레이아웃**
  - [ ] `src/api/client.ts` - API 호출 래퍼
  - [ ] `src/api/types.ts` - API 응답 타입
  - [ ] `src/components/Layout.tsx` - 메인 레이아웃
  - [ ] `src/components/MetricsCard.tsx` - 지표 카드
  - [ ] `src/components/StatusBadge.tsx` - 상태 뱃지
  - [ ] `src/components/WorkflowList.tsx` - 워크플로우 목록
  - [ ] `src/App.tsx` 업데이트 - 레이아웃 적용

### Phase 7: AI 워크플로우 구현

- [ ] **Task 13: figma-to-jira 워크플로우**
  - [ ] `src/workflows/figma-to-jira.ts`
    - [ ] Figma 웹훅 이벤트 처리
    - [ ] AI로 디자인 분석 (Heavy client)
    - [ ] MCP Jira 도구로 Epic 생성
    - [ ] MCP Jira 도구로 Sub-task 생성
    - [ ] DB에 실행 기록 저장
    - [ ] AI 비용 추적

- [ ] **Task 14: jira-auto-dev 워크플로우**
  - [ ] `src/workflows/jira-auto-dev.ts`
    - [ ] Jira 상태 변경 이벤트 처리
    - [ ] 이슈 상세 정보 추출
    - [ ] OMO/OpenCode Heavy client로 코드 생성
    - [ ] MCP GitHub 도구로 브랜치 생성
    - [ ] MCP GitHub 도구로 커밋
    - [ ] MCP GitHub 도구로 PR 생성
    - [ ] Jira 이슈에 PR 링크 업데이트
    - [ ] DB에 실행 기록 저장

- [ ] **Task 15: auto-review 워크플로우**
  - [ ] `src/workflows/auto-review.ts`
    - [ ] GitHub PR 이벤트 처리
    - [ ] PR diff 가져오기
    - [ ] AI로 코드 리뷰 (Medium client)
      - [ ] 코드 품질 검토
      - [ ] 요구사항 일치 확인
      - [ ] 버그 탐지
      - [ ] 성능 이슈 확인
      - [ ] 보안 취약점 확인
    - [ ] MCP GitHub 도구로 리뷰 코멘트 작성
    - [ ] DB에 실행 기록 저장

- [ ] **Task 16: deploy-monitor 워크플로우**
  - [ ] `src/workflows/deploy-monitor.ts`
    - [ ] 배포 이벤트 처리
    - [ ] MCP Datadog 도구로 메트릭 조회
    - [ ] AI로 메트릭 분석 (Light client)
    - [ ] 롤백 필요 여부 판단
    - [ ] Jira 이슈 상태 업데이트
    - [ ] DB에 실행 기록 저장

- [ ] **Task 17: incident-to-jira 워크플로우**
  - [ ] `src/workflows/incident-to-jira.ts`
    - [ ] Datadog 알림 이벤트 처리
    - [ ] MCP Datadog 도구로 로그/트레이스 조회
    - [ ] AI로 장애 분석 (Heavy client)
    - [ ] 근본 원인 파악
    - [ ] MCP Jira 도구로 Bug 티켓 생성
    - [ ] 온콜 담당자 할당 (PagerDuty)
    - [ ] DB에 실행 기록 저장

### Phase 8: Dashboard 실시간 메트릭

- [ ] **Task 18: 대시보드 메트릭 구현**
  - [ ] `src/api/metrics.ts`
    - [ ] 오늘의 자동화 통계 조회
    - [ ] 진행 중인 워크플로우 조회
    - [ ] AI 비용 요약 조회
    - [ ] 주간 생산성 지표 조회
  - [ ] `src/components/TodayStats.tsx` - 오늘의 통계
  - [ ] `src/components/AICostTracker.tsx` - AI 비용 추적
  - [ ] `src/components/WeeklyMetrics.tsx` - 주간 지표
  - [ ] `src/App.tsx` 업데이트 - 메트릭 통합
  - [ ] 자동 새로고침 (30초마다 폴링)

### Phase 9: 통합 테스트

- [ ] **Task 19: E2E 통합 테스트**
  - [ ] `docker-compose up` 모든 서비스 시작 확인
  - [ ] 헬스체크 전체 통과 확인
  - [ ] 웹훅 → 큐 → 워커 데이터 흐름 테스트
  - [ ] 데이터베이스 작업 검증
  - [ ] 대시보드 실시간 데이터 표시 확인
  - [ ] 통합 이슈 수정
  - [ ] 환경 설정 문서화

### Phase 10: 최종 문서화

- [ ] **Task 20: 프로덕션 준비 문서**
  - [ ] API 명세서 완성
  - [ ] 배포 가이드
  - [ ] 운영 매뉴얼
  - [ ] 백업/복구 절차
  - [ ] 모니터링 설정 가이드
  - [ ] CI/CD 파이프라인 설정
  - [ ] 보안 체크리스트

---

## 📊 진행 현황

### 전체 진행률

- **완료**: 12 / 21 작업 (57%)
- **미완료**: 9 / 21 작업 (43%)

### 단계별 진행률

- ✅ **Phase 1-2**: 인프라 & Docker (100% 완료)
- ✅ **Phase 3**: 패키지 스켈레톤 (100% 완료)
- ✅ **Phase 4**: 핵심 구현 (60% 완료 - 라우트, 큐, 멀티 환경)
- ✅ **Phase 5**: 문서화 (100% 완료)
- ✅ **Phase 5.5**: 멀티 환경 지원 (100% 완료)
- ⏳ **Phase 6-10**: AI 워크플로우 및 기능 구현 (0% 완료)

### 코드 통계

- **생성된 파일**: 약 50개
- **코드 라인**: 약 2,500 LOC
- **TypeScript**: 약 2,000 LOC
- **SQL**: 약 100 LOC
- **Docker/Config**: 약 400 LOC

---

## 🎯 다음 우선순위

### 즉시 착수 가능

1. **AI 클라이언트 구현** (Task 11)
   - OpenAI SDK 통합
   - Anthropic SDK 통합
   - MCP 도구 호출 래퍼

2. **1개 워크플로우 구현** (Task 13)
   - figma-to-jira 선택 (가장 단순)
   - E2E 테스트로 전체 흐름 검증

### 중기 목표

3. **나머지 4개 워크플로우** (Tasks 14-17)
4. **Dashboard 메트릭** (Task 18)

### 장기 목표

5. **통합 테스트** (Task 19)
6. **프로덕션 문서** (Task 20)

---

## 💡 참고사항

### 작업 완료 기준

- [x] 파일 생성 완료
- [x] 코드 컴파일 성공
- [x] Docker 빌드 성공
- [ ] 실제 기능 동작 (AI 워크플로우는 미완성)
- [ ] 테스트 통과 (테스트 미작성)

### 기술 부채

- AI 워크플로우는 스켈레톤만 존재 (실제 로직 미구현)
- Dashboard는 기본 레이아웃만 존재 (메트릭 표시 미구현)
- 테스트 코드 없음
- 에러 핸들링 최소화
- 로깅 구조 단순함

### 프로덕션 준비사항

- [ ] 웹훅 서명 검증 추가
- [ ] 대시보드 인증 추가
- [ ] Rate limiting 구현
- [ ] 상세한 에러 핸들링
- [ ] 테스트 커버리지 80% 이상
- [ ] CI/CD 파이프라인
- [ ] 모니터링 (Prometheus/Grafana)
- [ ] 알림 (Slack/Email)
- [ ] 백업 자동화
- [ ] 보안 감사

---

마지막 업데이트: 2026-02-08
