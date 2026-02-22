# RTB AI Hub - 문서 인덱스

> **문서 읽기 순서가 헷갈리시나요?**  
> 이 문서는 RTB AI Hub의 모든 문서를 대상별로 정리한 인덱스입니다.

---

## 📖 대상별 추천 경로

### 🎯 처음 방문하신 분 (비개발자)

```
Step 1: 개념 이해
└─ docs/CONCEPTS.md (30분) ⭐ 필독!
   "왜 필요한가? 무엇을 하는가? 어떻게 동작하나?"

Step 2: 사용 방법
└─ docs/NON_DEV_GUIDE.md (10분)
   "Slack에서 AI 에이전트 사용법"

Step 3: 기대 효과 확인
└─ docs/CONCEPTS.md → "6. 기대 효과" (5분)
   "우리 팀에 어떤 도움이 될까?"
```

**총 소요 시간: 45분**

---

### 👨‍💻 신입 개발자

```
Step 1: 개념 파악 (기술 배경 이해)
└─ docs/CONCEPTS.md (30분)

Step 2: 시스템 설치
└─ README.md → "빠른 시작" (30분)

Step 3: 아키텍처 이해
└─ docs/architecture/COMMUNICATION_COORDINATOR_ARCHITECTURE.md (1시간)

Step 4: 코드 탐색
└─ packages/workflow-engine/src/
   └─ agents/ (에이전트 구현)
   └─ workflows/ (워크플로우 로직)
```

**총 소요 시간: 2.5시간**

---

### 🚀 경력 개발자

```
Step 1: 빠른 설치
└─ README.md → "빠른 시작" (15분)

Step 2: 아키텍처 스캔
└─ docs/architecture/COMMUNICATION_COORDINATOR_ARCHITECTURE.md (30분)

Step 3: 구현 세부사항
└─ IMPLEMENTATION_SUMMARY.md (30분)

Step 4: 코드 다이빙
└─ 관심 영역별로 packages/ 탐색
```

**총 소요 시간: 1.5시간**

---

### 📊 PM / 기획자

```
Step 1: 시스템 이해
└─ docs/CONCEPTS.md (30분)
   특히: "5. 실제 사용 시나리오" 집중

Step 2: 기대 효과
└─ docs/CONCEPTS.md → "6. 기대 효과" (10분)
   ROI 계산 및 정량적 지표

Step 3: 비전 이해
└─ docs/VISION_TEAM_AI_COORDINATOR.md (20분)
   장기 로드맵 및 방향성
```

**총 소요 시간: 1시간**

---

### 🎨 디자이너 / UX

```
Step 1: 개념 이해
└─ docs/CONCEPTS.md (30분)
   특히: "개념 1: Communication Pattern" 집중

Step 2: 사용 시나리오
└─ docs/CONCEPTS.md → "5. 실제 사용 시나리오" (15분)
   디자인→개발 핸드오프 과정 이해

Step 3: 실습
└─ docs/NON_DEV_GUIDE.md (10분)
   Slack에서 디자인 파일 공유 자동화
```

**총 소요 시간: 55분**

---

### 🧪 QA / 테스터

```
Step 1: 시스템 이해
└─ docs/CONCEPTS.md (30분)

Step 2: QA Agent 역할
└─ docs/architecture/AGENT_IDENTITIES.md (15분)
   QA Agent (QualityGatekeeper) 섹션

Step 3: 테스트 시나리오
└─ docs/architecture/AGENT_SCENARIOS.md (20분)
   3개 테스트 시나리오 이해
```

**총 소요 시간: 1시간 5분**

---

### 💼 경영진 / 의사결정자

```
Step 1: 비즈니스 가치
└─ docs/CONCEPTS.md → "2. 왜 필요한가?" (10분)
   현재 문제점 명확히 이해

Step 2: 정량적 효과
└─ docs/CONCEPTS.md → "6. 기대 효과" (10분)
   ROI 10배 이상 근거

Step 3: 도입 계획
└─ docs/CONCEPTS.md → "7. 다음 단계" (5분)
   설치 1일 + 파일럿 2주 + 확대 4주
```

**총 소요 시간: 25분**

---

## 📚 전체 문서 카테고리별 분류

### 1. 개념 및 가이드

| 문서                                     | 대상     | 설명                          | 중요도 |
| ---------------------------------------- | -------- | ----------------------------- | ------ |
| [CONCEPTS.md](./CONCEPTS.md)             | 모두     | 핵심 개념 설명서 (비개발자용) | ⭐⭐⭐ |
| [NON_DEV_GUIDE.md](./NON_DEV_GUIDE.md)   | 비개발자 | Slack 사용 가이드             | ⭐⭐   |
| [SETUP_COMPLETE.md](./SETUP_COMPLETE.md) | 모두     | 현재 구축 상태                | ⭐     |

### 2. 설치 및 환경 설정

| 문서                                         | 대상   | 설명              | 중요도 |
| -------------------------------------------- | ------ | ----------------- | ------ |
| [README.md](../README.md)                    | 개발자 | 빠른 시작 가이드  | ⭐⭐⭐ |
| [ENV_SETUP.md](../ENV_SETUP.md)              | 개발자 | 환경변수 설정     | ⭐⭐⭐ |
| [AUTH_SETUP.md](../AUTH_SETUP.md)            | 개발자 | Google OAuth 설정 | ⭐⭐   |
| [DOCKER_LOCAL_DEV.md](./DOCKER_LOCAL_DEV.md) | 개발자 | Docker 개발 환경  | ⭐⭐   |

### 3. 아키텍처 설계 (Architecture)

| 문서                                                                                                  | 대상      | 설명              | 중요도 |
| ----------------------------------------------------------------------------------------------------- | --------- | ----------------- | ------ |
| [COMMUNICATION_COORDINATOR_ARCHITECTURE.md](./architecture/COMMUNICATION_COORDINATOR_ARCHITECTURE.md) | 개발자    | 4-Layer 아키텍처  | ⭐⭐⭐ |
| [OPENCLAW_AGENT_DIGITAL_TWINS.md](./architecture/OPENCLAW_AGENT_DIGITAL_TWINS.md)                     | 개발자    | 7-Agent 협업 구조 | ⭐⭐⭐ |
| [AGENT_IDENTITIES.md](./architecture/AGENT_IDENTITIES.md)                                             | 모두      | 에이전트 페르소나 | ⭐⭐   |
| [AGENT_SYSTEM_PROMPTS.md](./architecture/AGENT_SYSTEM_PROMPTS.md)                                     | 개발자    | 시스템 프롬프트   | ⭐⭐   |
| [AGENT_SCENARIOS.md](./architecture/AGENT_SCENARIOS.md)                                               | 모두      | 테스트 시나리오   | ⭐⭐   |
| [COMMUNICATION_PATTERN_ENGINE.md](./architecture/COMMUNICATION_PATTERN_ENGINE.md)                     | 개발자    | 9가지 패턴        | ⭐⭐   |
| [ROLE_ADAPTER_LAYER.md](./architecture/ROLE_ADAPTER_LAYER.md)                                         | 개발자    | 역할 변환 계층    | ⭐     |
| [WIKI_AND_ONBOARDING.md](./architecture/WIKI_AND_ONBOARDING.md)                                       | 개발자    | Wiki 연동         | ⭐     |
| [DATA_MODELS_AND_API.md](./architecture/DATA_MODELS_AND_API.md)                                       | 개발자    | DB 스키마 & API   | ⭐     |
| [OPENCLAW_GATEWAY_INTEGRATION.md](./architecture/OPENCLAW_GATEWAY_INTEGRATION.md)                     | 개발자    | Gateway 통신      | ⭐     |
| [IMPLEMENTATION_ROADMAP.md](./architecture/IMPLEMENTATION_ROADMAP.md)                                 | PM/개발자 | 8주 구현 계획     | ⭐     |
| [INTEGRATION_AND_EXTENSION.md](./architecture/INTEGRATION_AND_EXTENSION.md)                           | 개발자    | 확장 가이드       | ⭐     |

### 4. Team AI Coordinator (9개 기능)

| 문서                                                                       | 대상   | 설명             | 중요도 |
| -------------------------------------------------------------------------- | ------ | ---------------- | ------ |
| [VISION_TEAM_AI_COORDINATOR.md](./VISION_TEAM_AI_COORDINATOR.md)           | 모두   | 비전 문서        | ⭐⭐⭐ |
| [designs/README.md](./designs/README.md)                                   | 개발자 | 설계 인덱스      | ⭐⭐⭐ |
| [A1_ROLE_AWARE_NOTIFICATIONS.md](./designs/A1_ROLE_AWARE_NOTIFICATIONS.md) | 개발자 | 역할별 알림      | ⭐⭐   |
| [A2_PR_CONTEXT_ENRICHMENT.md](./designs/A2_PR_CONTEXT_ENRICHMENT.md)       | 개발자 | PR 맥락 첨부     | ⭐⭐   |
| [A3_DAILY_TEAM_DIGEST.md](./designs/A3_DAILY_TEAM_DIGEST.md)               | 개발자 | 일일 다이제스트  | ⭐⭐   |
| [B1_CROSS_REFERENCE_ENGINE.md](./designs/B1_CROSS_REFERENCE_ENGINE.md)     | 개발자 | 맥락 연결 엔진   | ⭐⭐   |
| [B2_SMART_HANDOFF.md](./designs/B2_SMART_HANDOFF.md)                       | 개발자 | 스마트 핸드오프  | ⭐⭐   |
| [B3_BLOCKER_DETECTION.md](./designs/B3_BLOCKER_DETECTION.md)               | 개발자 | 블로커 감지      | ⭐⭐   |
| [C1_IMPACT_ANALYSIS.md](./designs/C1_IMPACT_ANALYSIS.md)                   | 개발자 | PR 영향 분석     | ⭐⭐   |
| [C2_DECISION_JOURNAL.md](./designs/C2_DECISION_JOURNAL.md)                 | 개발자 | 의사결정 저널    | ⭐⭐   |
| [C3_MEETING_PREP.md](./designs/C3_MEETING_PREP.md)                         | 개발자 | 회의 준비 자동화 | ⭐⭐   |
| [MCP_MIGRATION.md](./designs/MCP_MIGRATION.md)                             | 개발자 | MCP 마이그레이션 | ⭐     |

### 5. OpenClaw Integration

| 문서                                                                      | 대상   | 설명              | 중요도 |
| ------------------------------------------------------------------------- | ------ | ----------------- | ------ |
| [OPENCLAW_INTEGRATION.md](./OPENCLAW_INTEGRATION.md)                      | 개발자 | OpenClaw 개념     | ⭐⭐   |
| [infrastructure/openclaw/SETUP.md](../infrastructure/openclaw/SETUP.md)   | 개발자 | Slack App 설정    | ⭐⭐   |
| [infrastructure/openclaw/README.md](../infrastructure/openclaw/README.md) | 개발자 | 설정 커스터마이징 | ⭐     |

### 6. 배포 및 운영 (Deployment)

| 문서                                                                                      | 대상      | 설명                              | 중요도 |
| ----------------------------------------------------------------------------------------- | --------- | --------------------------------- | ------ |
| [deployment/DEPLOYMENT_ARCHITECTURE.md](./deployment/DEPLOYMENT_ARCHITECTURE.md)         | DevOps    | 전체 AWS 배포 구조 (멀티 계정)    | ⭐⭐⭐ |
| [deployment/PREVIEW_ENVIRONMENT.md](./deployment/PREVIEW_ENVIRONMENT.md)                 | 개발자    | Preview 환경 설계 (Local↔K8s)    | ⭐⭐⭐ |
| [deployment/MULTI_ACCOUNT_AWS.md](./deployment/MULTI_ACCOUNT_AWS.md)                     | DevOps    | IAM 크로스 계정·IRSA·EKS RBAC    | ⭐⭐   |
| [deployment/OPERATIONS.md](./deployment/OPERATIONS.md)                                   | DevOps    | 운영·모니터링·장애 처리           | ⭐⭐   |

### 7. 기술 참고

| 문서                                                       | 대상   | 설명            | 중요도 |
| ---------------------------------------------------------- | ------ | --------------- | ------ |
| [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md)  | 개발자 | 구현 세부사항   | ⭐⭐⭐ |
| [GIT_BRANCH_STRATEGY.md](./GIT_BRANCH_STRATEGY.md)         | 개발자 | Git 브랜치 전략 | ⭐⭐   |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)                       | 개발자 | 알려진 이슈     | ⭐     |
| [WAVE_PARALLEL_EXECUTION.md](./WAVE_PARALLEL_EXECUTION.md) | 개발자 | Wave 병렬 실행  | ⭐     |

### 8. Claude Code 커맨드 & 에이전트 팀

#### /agent-team 오케스트레이터 커맨드

`.claude/commands/agent-team.md`에 정의된 AI 에이전트 팀 오케스트레이터 슬래시 커맨드.

**사용법**: `/agent-team RTB-123`

**워크플로우**: Analyse -> Design (승인) -> Develop -> Review+Test -> Ops (승인) -> Done

- 설계 완료 후 사람 승인 체크포인트
- 배포 전 Ops 검증 + 사람 승인 체크포인트
- 에이전트 의견 충돌 시 자동 에스컬레이션
- 세션 학습은 `mcp__plugin_claude-mem_mcp-search__save_memory`로 누적

**관련 코드**:
- `packages/workflow-engine/src/utils/task-folder.ts` — Jira 이슈별 `docs/plans/{key}/` 폴더 자동 생성
- `packages/shared/src/types.ts` — `WorkflowStage` enum (9단계 상태머신: analyse→design→await-design-approval→develop→review→test→ops→await-ops-approval→done)
- `packages/workflow-engine/src/utils/ops-verifier.ts` — 배포 전 DB 마이그레이션·ECS·CloudWatch·연결성 검증 (활성화: `OPS_VERIFICATION_ENABLED=true`, prd 환경 실패 시 자동 차단)
- `packages/workflow-engine/src/utils/pause-checker.ts` — `/pause` 일시정지 체크
- `packages/webhook-listener/src/routes/workflows.ts` — `POST /api/workflows/:id/pause|resume`

### 9. Workflow Pause/Resume API

진행 중인 워크플로우를 일시정지하고 재개하는 REST API 및 내부 유틸리티.

| 항목                                                                                                              | 설명                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/workflows/:id/pause`                                                                                   | 진행 중인 워크플로우 일시정지 (상태: PAUSED)            |
| `POST /api/workflows/:id/resume`                                                                                  | 일시정지된 워크플로우 재개 (상태: IN_PROGRESS 복원)     |
| [`packages/workflow-engine/src/utils/pause-checker.ts`](../packages/workflow-engine/src/utils/pause-checker.ts) | `isPaused()` 유틸 — 단계 경계에서 호출하여 상태 확인   |

**체크포인트** (jira-auto-dev 워크플로우):

1. Design Debate 시작 전 — `isPaused()` 호출, PAUSED이면 즉시 리턴
2. Claude Code 실행 전 — `isPaused()` 호출, PAUSED이면 즉시 리턴

**동작 방식**: pause 요청이 들어오면 DB의 `workflow_executions.status`를 `PAUSED`로 변경. 워크플로우 엔진은 다음 단계 경계에서 `isPaused(executionId)`를 확인하고, PAUSED이면 현재 잡을 종료. resume 요청 시 상태를 `IN_PROGRESS`로 복원하면 BullMQ 잡 재실행으로 워크플로우가 이어진다.

**엔드포인트 인증**: `internalAuth` 미들웨어 적용 (내부 서비스 간 통신 전용).

---

## 🔍 주제별 찾아보기

### "왜 필요한가요?"

→ [CONCEPTS.md - 2. 왜 필요한가?](./CONCEPTS.md#2-왜-필요한가-문제-정의)

### "어떻게 동작하나요?"

→ [CONCEPTS.md - 3. 어떻게 해결하나?](./CONCEPTS.md#3-어떻게-해결하나-솔루션-개념)

### "ROI는 얼마나 되나요?"

→ [CONCEPTS.md - 6. 기대 효과](./CONCEPTS.md#6-기대-효과)

### "설치 방법은?"

→ [README.md - 빠른 시작](../README.md#-빠른-시작)

### "7개 에이전트가 뭔가요?"

→ [CONCEPTS.md - 개념 2: Digital Twin](./CONCEPTS.md#개념-2-7-agent-digital-twin-디지털-트윈)  
→ [AGENT_IDENTITIES.md](./architecture/AGENT_IDENTITIES.md)

### "Communication Pattern이 뭔가요?"

→ [CONCEPTS.md - 개념 1: Communication Pattern](./CONCEPTS.md#개념-1-communication-pattern-커뮤니케이션-패턴)  
→ [COMMUNICATION_PATTERN_ENGINE.md](./architecture/COMMUNICATION_PATTERN_ENGINE.md)

### "Wiki 지식 연동은 어떻게 하나요?"

→ [CONCEPTS.md - RTB-Wiki 지식 자동 주입](./CONCEPTS.md#-rtb-wiki-지식-자동-주입)  
→ [WIKI_AND_ONBOARDING.md](./architecture/WIKI_AND_ONBOARDING.md)

### "Slack에서 어떻게 사용하나요?"

→ [NON_DEV_GUIDE.md](./NON_DEV_GUIDE.md)

### "장애 대응은 어떻게 되나요?"

→ [CONCEPTS.md - 시나리오 2: 장애 대응](./CONCEPTS.md#시나리오-2-장애-대응)

### "신입 온보딩은?"

→ [CONCEPTS.md - 시나리오 3: 신입 온보딩](./CONCEPTS.md#시나리오-3-신입-온보딩)

---

## ⚡ 빠른 참조

### 주요 명령어

```bash
# 서비스 시작
./scripts/dev-docker.sh start
pnpm dev

# 상태 확인
./scripts/dev-docker.sh status
curl http://localhost:4000/health

# 테스트 실행
./scripts/test-e2e.sh --quick
```

### 주요 엔드포인트

- **Webhook Listener**: http://localhost:4000
- **Workflow Engine**: http://localhost:3001
- **Dashboard**: http://localhost:5173
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 주요 디렉토리

```
packages/
├── webhook-listener/    # API 진입점
├── workflow-engine/     # AI 워크플로우 + 에이전트
│   ├── agents/          # 멀티 에이전트 구현
│   └── workflows/       # 워크플로우 로직
└── dashboard/           # React UI

docs/
├── CONCEPTS.md          # 개념 설명서 ⭐
├── architecture/        # 아키텍처 설계
└── designs/             # 9개 기능 설계

infrastructure/
└── openclaw/            # OpenClaw 설정
```

---

## 📧 문의 및 지원

- **개념 문의**: [CONCEPTS.md](./CONCEPTS.md) FAQ 섹션 확인
- **기술 지원**: [GitHub Issues](https://github.com/your-org/rtb-ai-hub/issues)
- **Slack**: #rtb-ai-hub 채널
- **이메일**: support@rsquare.co.kr

---

## 📝 문서 업데이트 이력

- **2026-02-22**: Pause/Resume API 문서 추가 (섹션 9), openapi.yaml 엔드포인트 스펙 추가
- **2026-02-18**: Deployment 문서 4개 추가 (배포 아키텍처·Preview 환경·멀티 계정 AWS·운영 가이드)
- **2026-02-12**: 개념 설명서 (CONCEPTS.md) 추가, README 개선, 문서 인덱스 생성
- **2026-02-11**: Architecture 문서 11개 완성, 7-Agent 정의 완료
- **2026-02-10**: Team AI Coordinator 설계 9개 완료
