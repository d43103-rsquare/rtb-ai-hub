# RTB AI Hub - 향후 개발 로드맵

이 문서는 RTB AI Hub의 향후 구현 가능한 기능들을 우선순위와 단계별로 정리한 로드맵입니다.

---

## 📋 현재 완료 상태 (v1.0)

### 핵심 기능
- ✅ 인증 시스템 (Google OAuth, JWT 세션)
- ✅ 자격증명 관리 (암호화된 API 키 저장)
- ✅ Dashboard UI (로그인, 대시보드, 자격증명, 워크플로우, 프로필)
- ✅ Figma → Jira 워크플로우 (사용자별 API 키 지원)
- ✅ Webhook Listener (Figma, Jira, GitHub, Datadog)
- ✅ BullMQ 기반 큐 시스템
- ✅ PostgreSQL + Redis 인프라

### 개발 환경 최적화 ⚡ (2026-02-05 완료)
- ✅ **pnpm 전환**: npm → pnpm 10 마이그레이션
  - 설치 속도: 120초 → **0.4초** (300배 향상)
  - 빌드 속도: 타임아웃 → **7초** (완료)
  - 디스크 사용: 2GB → **500MB** (75% 절약)
- ✅ **Workspace 최적화**: `workspace:*` 프로토콜로 로컬 패키지 즉시 링크
- ✅ **병렬 설치**: 16개 동시 다운로드로 네트워크 최적화
- ✅ **Docker 캐시**: pnpm-cache 볼륨으로 재빌드 시 캐시 재사용
- ✅ **로컬 개발 스크립트**: `./scripts/dev-local.sh` 원클릭 환경 설정
- ✅ **빌드 스크립트**: 선택적 빌드 가능 (`pnpm build:auth`, `pnpm build:dashboard` 등)
- ✅ **.dockerignore**: 빌드 컨텍스트 최소화로 Docker 빌드 속도 향상

---

## 🎯 Phase 2: Dashboard 고도화 (우선순위: 높음)

### 2.1 워크플로우 상세 모달
**목표**: 각 워크플로우 실행의 상세 정보를 확인할 수 있는 모달 구현

**기능**:
- 실행 로그 실시간 조회
- AI 프롬프트 및 응답 내용 표시
- 비용 상세 내역 (토큰 사용량, 단가)
- 오류 발생 시 스택 트레이스 표시
- Figma 파일 미리보기 (iframe)
- 생성된 Jira 티켓 링크

**기술 스택**:
- React Modal 컴포넌트 확장
- Syntax Highlighter (AI 응답 포맷팅)
- Figma Embed API

**예상 소요 시간**: 2-3일

**우선순위**: ⭐⭐⭐⭐⭐

---

### 2.2 실시간 알림 시스템
**목표**: 워크플로우 완료/실패 시 실시간 알림

**기능**:
- WebSocket 연결 (Socket.io)
- 브라우저 푸시 알림 (Web Push API)
- 인앱 알림 센터 (헤더 벨 아이콘)
- 알림 히스토리 및 읽음 표시
- 이메일 알림 (선택 사항)

**기술 스택**:
- Socket.io (클라이언트/서버)
- Web Push API
- Redis Pub/Sub (다중 인스턴스 지원)

**예상 소요 시간**: 4-5일

**우선순위**: ⭐⭐⭐⭐

---

### 2.3 다크 모드
**목표**: 사용자 선호도에 따른 테마 전환

**기능**:
- 라이트/다크 모드 토글
- 시스템 설정 자동 감지 (prefers-color-scheme)
- 사용자 선택 저장 (localStorage)
- 부드러운 테마 전환 애니메이션

**기술 스택**:
- Tailwind CSS dark mode
- React Context (ThemeContext)

**예상 소요 시간**: 1-2일

**우선순위**: ⭐⭐⭐

---

### 2.4 고급 검색 및 필터링
**목표**: 워크플로우 이력의 강력한 검색 기능

**기능**:
- 전체 텍스트 검색 (파일명, 티켓 제목 등)
- 다중 필터 (날짜 범위, 상태, 타입, 비용 범위)
- 정렬 옵션 (날짜, 비용, 실행 시간)
- 검색 결과 하이라이팅
- 필터 프리셋 저장

**기술 스택**:
- React Query (서버 상태 관리)
- Debounced Input
- URL 쿼리 파라미터 (필터 상태 공유)

**예상 소요 시간**: 2-3일

**우선순위**: ⭐⭐⭐⭐

---

### 2.5 데이터 시각화 (차트 및 그래프)
**목표**: 워크플로우 사용 현황을 시각적으로 표현

**기능**:
- **비용 추이 차트**: 일별/주별/월별 AI 비용 그래프
- **워크플로우 성공률**: 파이 차트 (성공/실패/진행중)
- **실행 시간 분포**: 히스토그램
- **서비스별 사용량**: 바 차트 (Figma, Jira, GitHub, Datadog)
- **시간대별 활동**: 히트맵

**기술 스택**:
- Recharts 또는 Chart.js
- date-fns (날짜 그룹핑)
- 집계 API 엔드포인트 추가 필요

**예상 소요 시간**: 5-7일

**우선순위**: ⭐⭐⭐⭐

---

## 🚀 Phase 3: 워크플로우 완성 (우선순위: 높음)

### 3.1 Jira → Auto-Dev 워크플로우
**목표**: Jira 티켓에서 자동으로 코드 생성 및 PR 생성

**기능**:
- Jira 티켓 내용 분석 (AI)
- 코드 생성 (파일 구조, 컴포넌트, 테스트)
- GitHub PR 자동 생성
- 린터/포매터 자동 적용
- 사용자별 GitHub OAuth 토큰 사용

**기술 스택**:
- Anthropic Claude API (코드 생성)
- GitHub API (PR 생성)
- Prettier/ESLint (코드 품질)

**예상 소요 시간**: 7-10일

**우선순위**: ⭐⭐⭐⭐⭐

---

### 3.2 GitHub → Auto Review 워크플로우
**목표**: PR에 대한 AI 코드 리뷰 자동화

**기능**:
- PR diff 분석
- 코드 품질 검사 (버그, 보안, 성능)
- 개선 제안 코멘트 자동 작성
- 테스트 커버리지 확인
- PR 승인/변경 요청 자동화

**기술 스택**:
- GitHub Webhooks (pull_request 이벤트)
- Anthropic Claude API (코드 리뷰)
- GitHub API (코멘트 작성)

**예상 소요 시간**: 5-7일

**우선순위**: ⭐⭐⭐⭐

---

### 3.3 Datadog → Auto Diagnosis 워크플로우
**목표**: Datadog 알람 발생 시 자동 진단 및 Jira 티켓 생성

**기능**:
- Datadog 알람 수신 (Webhook)
- 로그 및 메트릭 자동 수집
- AI 기반 근본 원인 분석 (RCA)
- Jira 티켓 자동 생성 (진단 결과 포함)
- Slack 알림 (선택 사항)

**기술 스택**:
- Datadog API (로그/메트릭 조회)
- Anthropic Claude API (RCA)
- Jira API (티켓 생성)

**예상 소요 시간**: 7-10일

**우선순위**: ⭐⭐⭐⭐

---

### 3.4 Cross-Platform Sync 워크플로우
**목표**: 플랫폼 간 상태 자동 동기화

**기능**:
- Jira 티켓 상태 변경 → GitHub PR 라벨 업데이트
- GitHub PR 머지 → Jira 티켓 자동 완료
- Figma 디자인 변경 → Jira 티켓 자동 업데이트
- Datadog 알람 해제 → Jira 티켓 자동 해결

**기술 스택**:
- 양방향 Webhook 처리
- 상태 매핑 로직 (Jira ↔ GitHub ↔ Figma)
- 중복 이벤트 방지 (Redis 기반 deduplication)

**예상 소요 시간**: 5-7일

**우선순위**: ⭐⭐⭐

---

## 🎨 Phase 4: UX 개선 (우선순위: 중간)

### 4.1 파일 업로드 인터페이스
**목표**: Figma URL 대신 디자인 파일 직접 업로드

**기능**:
- Drag & Drop 파일 업로드
- 이미지 미리보기
- S3/MinIO 저장소 연동
- 업로드 진행률 표시
- 다중 파일 업로드

**기술 스택**:
- React Dropzone
- AWS S3 SDK 또는 MinIO
- Multipart Upload

**예상 소요 시간**: 3-4일

**우선순위**: ⭐⭐⭐

---

### 4.2 온보딩 플로우
**목표**: 신규 사용자를 위한 가이드 투어

**기능**:
- 인터랙티브 튜토리얼 (첫 로그인 시)
- 단계별 자격증명 설정 가이드
- 첫 워크플로우 실행 도우미
- 스킵 가능한 도움말 툴팁

**기술 스택**:
- React Joyride 또는 Shepherd.js
- 사용자 상태 저장 (온보딩 완료 여부)

**예상 소요 시간**: 2-3일

**우선순위**: ⭐⭐

---

### 4.3 키보드 단축키
**목표**: 파워 유저를 위한 단축키 지원

**기능**:
- 전역 단축키 (`Cmd+K`: 검색, `Cmd+N`: 새 워크플로우)
- 페이지 네비게이션 (`1-5`: 각 페이지로 이동)
- 모달 제어 (`Esc`: 닫기, `Enter`: 확인)
- 단축키 치트시트 모달 (`?`)

**기술 스택**:
- React Hotkeys Hook
- 키 입력 충돌 방지

**예상 소요 시간**: 1-2일

**우선순위**: ⭐⭐

---

## 🔐 Phase 5: 보안 및 관리 (우선순위: 중간)

### 5.1 팀 관리 기능
**목표**: 다중 사용자 환경에서 팀 단위 관리

**기능**:
- 팀 생성 및 멤버 초대
- 역할 기반 권한 관리 (Admin, Member, Viewer)
- 팀 단위 자격증명 공유
- 팀 대시보드 (전체 사용량 통계)
- 멤버 활동 로그

**기술 스택**:
- PostgreSQL (teams, team_members, permissions 테이블)
- RBAC (Role-Based Access Control)
- Invitation 시스템 (이메일)

**예상 소요 시간**: 10-14일

**우선순위**: ⭐⭐⭐⭐

---

### 5.2 비용 제한 및 알림
**목표**: AI 비용 초과 방지

**기능**:
- 사용자/팀별 월 예산 설정
- 예산 80%, 100% 도달 시 알림
- 예산 초과 시 워크플로우 자동 중지
- 비용 추이 예측 (ML 기반)

**기술 스택**:
- Redis (실시간 비용 집계)
- Cron Job (일별 비용 계산)
- 이메일 알림

**예상 소요 시간**: 4-5일

**우선순위**: ⭐⭐⭐⭐⭐

---

### 5.3 감사 로그 뷰어
**목표**: 모든 사용자 활동 추적 및 조회

**기능**:
- 자격증명 생성/수정/삭제 이력
- 워크플로우 실행 이력 (IP, User-Agent)
- API 호출 로그
- 로그 검색 및 필터링
- CSV 내보내기

**기술 스택**:
- PostgreSQL (audit_logs 테이블)
- 전체 텍스트 검색 (pg_trgm)
- CSV 생성 라이브러리

**예상 소요 시간**: 3-4일

**우선순위**: ⭐⭐⭐

---

## 🏢 Phase 6: 엔터프라이즈 기능 (우선순위: 낮음)

### 6.1 SSO (Single Sign-On)
**목표**: SAML/OIDC 기반 기업 인증 연동

**기능**:
- SAML 2.0 지원
- OIDC (OpenID Connect) 지원
- Okta, Azure AD 연동
- JIT (Just-In-Time) 프로비저닝

**기술 스택**:
- Passport.js (SAML/OIDC 전략)
- 추가 인증 제공자 설정

**예상 소요 시간**: 7-10일

**우선순위**: ⭐⭐

---

### 6.2 API 토큰 및 Public API
**목표**: 외부 시스템 연동을 위한 Public API

**기능**:
- API 토큰 생성/관리
- RESTful API 엔드포인트 (워크플로우 트리거, 상태 조회)
- Rate Limiting (사용자/팀별)
- API 문서 (Swagger/OpenAPI)
- Webhook 콜백 지원

**기술 스택**:
- Express Rate Limit
- Swagger UI
- API 토큰 인증 미들웨어

**예상 소요 시간**: 10-14일

**우선순위**: ⭐⭐⭐

---

### 6.3 Multi-Region 지원
**목표**: 글로벌 확장을 위한 다중 리전 배포

**기능**:
- 리전별 데이터베이스 복제
- CDN 연동 (정적 자산)
- 리전 간 워크플로우 라우팅
- Latency 기반 자동 리전 선택

**기술 스택**:
- PostgreSQL 복제 (Streaming Replication)
- CloudFront 또는 Cloudflare CDN
- 글로벌 로드 밸런서

**예상 소요 시간**: 14-21일

**우선순위**: ⭐

---

## 🛠️ Phase 7: 개발자 경험 (우선순위: 중간)

### 7.1 로컬 개발 환경 개선 ✅ **완료** (2026-02-05)

**목표**: 개발자가 쉽게 로컬에서 실행할 수 있도록

**완료된 기능**:
- ✅ **원클릭 자동 설정**: `./scripts/dev-local.sh` 스크립트
  - pnpm 자동 설치
  - 의존성 자동 설치 (0.4초)
  - shared 패키지 자동 빌드
  - Docker 인프라 자동 시작 (PostgreSQL, Redis)
- ✅ **Hot Reload**: tsx watch 기반 모든 서비스 지원
- ✅ **pnpm workspace**: 로컬 패키지 즉시 링크
- ✅ **선택적 빌드**: `pnpm build:auth`, `pnpm build:dashboard` 등
- ✅ **Docker 최적화**: pnpm-cache 볼륨으로 빌드 속도 향상

**미완료 (향후 구현)**:
- ⏳ 시드 데이터 자동 생성
- ⏳ 개발용 OAuth Mock 서버
- ⏳ 디버거 설정 (VS Code)

**기술 스택**:
- ✅ pnpm 10 (workspace)
- ✅ tsx watch
- ✅ Docker Compose 캐시 최적화
- ⏳ Mock OAuth 서버

**실제 소요 시간**: 1일

**우선순위**: ⭐⭐⭐ → **완료**

---

### 7.2 테스트 자동화
**목표**: 높은 코드 품질 유지

**기능**:
- 단위 테스트 (Jest)
- 통합 테스트 (Supertest)
- E2E 테스트 (Playwright)
- 테스트 커버리지 리포트
- CI/CD 파이프라인 통합

**기술 스택**:
- Jest, Supertest, Playwright
- GitHub Actions
- Codecov

**예상 소요 시간**: 10-14일

**우선순위**: ⭐⭐⭐⭐

---

### 7.3 API 문서 자동 생성
**목표**: 최신 API 문서 자동 유지

**기능**:
- OpenAPI 3.0 스펙 생성
- Swagger UI 인터페이스
- 예제 요청/응답
- TypeScript 타입에서 자동 생성

**기술 스택**:
- tsoa 또는 swagger-jsdoc
- Swagger UI Express

**예상 소요 시간**: 3-4일

**우선순위**: ⭐⭐⭐

---

## 📊 Phase 8: 모니터링 및 운영 (우선순위: 높음)

### 8.1 헬스 체크 및 모니터링
**목표**: 시스템 상태 실시간 모니터링

**기능**:
- 각 서비스별 헬스 체크 엔드포인트
- Prometheus 메트릭 수집
- Grafana 대시보드
- 알람 규칙 (CPU, 메모리, 에러율)
- Uptime 모니터링

**기술 스택**:
- Prometheus
- Grafana
- prom-client (Node.js)

**예상 소요 시간**: 5-7일

**우선순위**: ⭐⭐⭐⭐⭐

---

### 8.2 로그 집계 시스템
**목표**: 분산된 로그를 중앙에서 관리

**기능**:
- 구조화된 로그 (JSON)
- ELK Stack (Elasticsearch, Logstash, Kibana)
- 로그 검색 및 분석
- 에러 트래킹 (Sentry 연동)

**기술 스택**:
- Winston 또는 Pino (로깅)
- ELK Stack 또는 Loki
- Sentry

**예상 소요 시간**: 5-7일

**우선순위**: ⭐⭐⭐⭐

---

### 8.3 백업 및 복구
**목표**: 데이터 손실 방지

**기능**:
- PostgreSQL 자동 백업 (일별)
- Redis RDB/AOF 백업
- S3 백업 저장소
- 복구 테스트 자동화
- Point-in-Time Recovery (PITR)

**기술 스택**:
- pg_dump (PostgreSQL)
- Redis RDB
- AWS S3 또는 MinIO
- Cron Job

**예상 소요 시간**: 3-4일

**우선순위**: ⭐⭐⭐⭐⭐

---

## 🌟 Phase 9: 고급 AI 기능 (우선순위: 낮음)

### 9.1 커스텀 AI 프롬프트
**목표**: 사용자가 AI 프롬프트를 직접 커스터마이즈

**기능**:
- 프롬프트 템플릿 에디터
- 변수 시스템 ({{file_name}}, {{description}} 등)
- 프롬프트 버전 관리
- A/B 테스트 (여러 프롬프트 비교)

**기술 스택**:
- Monaco Editor (코드 에디터)
- 템플릿 엔진 (Handlebars)

**예상 소요 시간**: 5-7일

**우선순위**: ⭐⭐

---

### 9.2 Multi-Modal AI
**목표**: 이미지, 비디오 분석 지원

**기능**:
- Figma 디자인 스크린샷 분석
- UI 컴포넌트 자동 인식
- 접근성 검사 (색상 대비, 폰트 크기)
- 디자인 시스템 일관성 체크

**기술 스택**:
- Claude 3.5 Sonnet (Vision)
- Figma Export API

**예상 소요 시간**: 7-10일

**우선순위**: ⭐⭐⭐

---

### 9.3 Fine-Tuned 모델
**목표**: 프로젝트 특화 AI 모델

**기능**:
- 회사 코드베이스 학습
- 커스텀 코딩 스타일 적용
- 도메인 특화 지식 반영
- 모델 성능 모니터링

**기술 스택**:
- OpenAI Fine-Tuning API
- Anthropic Custom Models (향후 지원 시)
- MLOps 파이프라인

**예상 소요 시간**: 21-30일

**우선순위**: ⭐

---

## 📅 추천 구현 순서

### 🔴 높은 우선순위 (3개월 이내)
1. **비용 제한 및 알림** (Phase 5.2) - 비용 초과 방지 필수
2. **워크플로우 상세 모달** (Phase 2.1) - 디버깅 필수
3. **Jira → Auto-Dev 워크플로우** (Phase 3.1) - 핵심 가치
4. **실시간 알림 시스템** (Phase 2.2) - UX 개선
5. **헬스 체크 및 모니터링** (Phase 8.1) - 운영 안정성
6. **백업 및 복구** (Phase 8.3) - 데이터 보호

### 🟡 중간 우선순위 (6개월 이내)
7. **GitHub → Auto Review 워크플로우** (Phase 3.2)
8. **Datadog → Auto Diagnosis 워크플로우** (Phase 3.3)
9. **데이터 시각화** (Phase 2.5)
10. **팀 관리 기능** (Phase 5.1)
11. **테스트 자동화** (Phase 7.2)
12. **로그 집계 시스템** (Phase 8.2)

### 🟢 낮은 우선순위 (1년 이내)
13. **고급 검색 및 필터링** (Phase 2.4)
14. **API 토큰 및 Public API** (Phase 6.2)
15. **다크 모드** (Phase 2.3)
16. **Multi-Modal AI** (Phase 9.2)

---

## 💡 기여 가이드

이 로드맵의 기능을 구현하고 싶으신가요?

1. **이슈 생성**: GitHub Issues에 구현하려는 기능 등록
2. **논의**: 구현 방법에 대해 팀과 논의
3. **개발**: 브랜치 생성 후 구현
4. **PR**: Pull Request 생성 및 리뷰 요청
5. **배포**: 머지 후 스테이징 환경 테스트

---

## 🎉 최근 완료 항목

### 2026-02-05: 개발 환경 최적화 ⚡
**완료된 Phase**: Phase 7.1 로컬 개발 환경 개선

**성과**:
- ✅ pnpm 전환으로 **설치 속도 300배 향상** (120초 → 0.4초)
- ✅ 빌드 속도 대폭 개선 (타임아웃 → 7초)
- ✅ 디스크 사용량 **75% 절약** (2GB → 500MB)
- ✅ 원클릭 개발 환경 설정 스크립트
- ✅ Docker 빌드 캐시 최적화

**영향**:
- 개발자 온보딩 시간 단축 (수 시간 → 5분)
- CI/CD 파이프라인 속도 향상 예상
- 로컬 개발 경험 대폭 개선

**관련 파일**:
- `pnpm-workspace.yaml`
- `.npmrc`
- `scripts/dev-local.sh`
- `docker-compose.test.yml` (pnpm-cache 볼륨)

---

## 📞 문의

로드맵에 대한 질문이나 제안사항이 있다면:
- GitHub Issues 생성
- 팀 슬랙 채널: #rtb-ai-hub
- 이메일: dev-team@company.com

---

**마지막 업데이트**: 2026-02-05 (개발 환경 최적화 완료)  
**다음 리뷰**: 2026-03-01 (월간 로드맵 리뷰)
