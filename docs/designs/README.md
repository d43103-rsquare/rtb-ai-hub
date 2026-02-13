# Team AI Coordinator — 기능별 설계 문서

> 상위 비전: [VISION_TEAM_AI_COORDINATOR.md](../VISION_TEAM_AI_COORDINATOR.md)

---

## 구현 현황

> **Phase A + Phase B + Phase C 전체 구현 완료** — 2026-02-11
> 9개 기능, 474개 테스트 (35 files), 0 errors

| Phase | 순서  | 기능                                                             | 상태         | 테스트 |
| ----- | ----- | ---------------------------------------------------------------- | ------------ | ------ |
| A     | **1** | [A-2 PR Context Enrichment](./A2_PR_CONTEXT_ENRICHMENT.md)       | ✅ 구현 완료 | 22개   |
| A     | **2** | [A-1 Role-aware Notifications](./A1_ROLE_AWARE_NOTIFICATIONS.md) | ✅ 구현 완료 | 15개   |
| B     | **3** | [B-1 Cross-Reference Engine](./B1_CROSS_REFERENCE_ENGINE.md)     | ✅ 구현 완료 | 19개   |
| A     | **4** | [A-3 Daily Team Digest](./A3_DAILY_TEAM_DIGEST.md)               | ✅ 구현 완료 | 17개   |
| B     | **5** | [B-3 Blocker Detection](./B3_BLOCKER_DETECTION.md)               | ✅ 구현 완료 | 19개   |
| B     | **6** | [B-2 Smart Handoff](./B2_SMART_HANDOFF.md)                       | ✅ 구현 완료 | 14개   |
| C     | **7** | [C-1 Impact Analysis](./C1_IMPACT_ANALYSIS.md)                   | ✅ 구현 완료 | 40개   |
| C     | **8** | [C-2 Decision Journal](./C2_DECISION_JOURNAL.md)                 | ✅ 구현 완료 | 26개   |
| C     | **9** | [C-3 Meeting Prep](./C3_MEETING_PREP.md)                         | ✅ 구현 완료 | 20개   |

## 구현 로드맵

```
Phase A (Quick Wins) ✅ 완료          Phase B (Team Intelligence) ✅ 완료
─────────────────────────           ──────────────────────────────────
A-2 PR Context Enrichment  ──┐     B-1 Cross-Reference Engine ◀──┐
                              │                │                   │
A-1 Role-aware Notifications ─┤     B-2 Smart Handoff ◀───────────┤
                              │                │                   │
A-3 Daily Team Digest ────────┘     B-3 Blocker Detection ◀───────┘
                                               │
                                    (B-1이 모든 B의 기반 인프라)

Phase C (Decision Facilitation) ✅ 완료
──────────────────────────────────────────────
C-1 Impact Analysis ──────┐
                          │  (A-2 PR Context와 연동)
C-2 Decision Journal ─────┤
                          │  (C-1과 양방향 연동)
C-3 Meeting Prep ─────────┘
                             (A-3, B-3, C-2 데이터 활용)
```

## 기능 간 의존성

```
Phase A+B (구현 완료):
A-2 PR Context ──────── 독립 (의존성 없음)
A-1 Role Notify ─────── 독립 (의존성 없음)
A-3 Daily Digest ────── B-1 있으면 더 풍부 (선택적 의존)
B-1 Context Engine ──── 독립 (의존성 없음, 기반 인프라)
B-2 Smart Handoff ───── B-1 필요 (맥락 조회), A-1 활용 (알림)
B-3 Blocker Detection ─ B-1 있으면 더 풍부 (선택적 의존), A-3에 통합 가능

Phase C (구현 완료):
C-1 Impact Analysis ─── B-1 활용 (과거 인시던트), A-2 연동 (PR body 확장)
C-2 Decision Journal ── B-1 활용 (맥락 연결), C-1 연동 (관련 과거 결정)
C-3 Meeting Prep ────── A-3 재활용 (수집 로직), B-3 재활용 (블로커), C-2 활용 (결정 요약)
```

## 코드 변경 범위 요약

### 신규 파일

| 파일                              | 기능 | 패키지           |
| --------------------------------- | ---- | ---------------- |
| `utils/role-notifier.ts`          | A-1  | workflow-engine  |
| `utils/pr-description-builder.ts` | A-2  | workflow-engine  |
| `utils/digest-collector.ts`       | A-3  | workflow-engine  |
| `utils/digest-formatter.ts`       | A-3  | workflow-engine  |
| `utils/digest-scheduler.ts`       | A-3  | workflow-engine  |
| `utils/context-engine.ts`         | B-1  | workflow-engine  |
| `routes/context.ts`               | B-1  | webhook-listener |
| `workflows/smart-handoff.ts`      | B-2  | workflow-engine  |
| `utils/blocker-detector.ts`       | B-3  | workflow-engine  |
| `utils/blocker-formatter.ts`      | B-3  | workflow-engine  |
| `utils/blocker-scheduler.ts`      | B-3  | workflow-engine  |
| `utils/impact-analyzer.ts`        | C-1  | workflow-engine  |
| `utils/impact-formatter.ts`       | C-1  | workflow-engine  |
| `utils/decision-detector.ts`      | C-2  | workflow-engine  |
| `utils/decision-store.ts`         | C-2  | workflow-engine  |
| `utils/decision-formatter.ts`     | C-2  | workflow-engine  |
| `utils/meeting-prep.ts`           | C-3  | workflow-engine  |
| `utils/meeting-prep-formatter.ts` | C-3  | workflow-engine  |
| `utils/meeting-prep-scheduler.ts` | C-3  | workflow-engine  |

### 수정 파일

| 파일                                 | 변경 내용                                                      | 관련 기능     |
| ------------------------------------ | -------------------------------------------------------------- | ------------- |
| `shared/src/constants.ts`            | 타입/config/feature flag 추가                                  | A-1, A-3, B-3 |
| `shared/src/db/schema.ts`            | `contextLinks` 테이블 추가                                     | B-1           |
| `workflows/jira-auto-dev-multi.ts`   | notifyByRole + updateContext + enriched PR                     | A-1, A-2, B-1 |
| `workflows/target-deploy.ts`         | notifyByRole + updateContext                                   | A-1, B-1      |
| `queue/workers.ts`                   | digest worker + handoff trigger                                | A-3, B-2      |
| `index.ts` (workflow-engine)         | 스케줄러 시작                                                  | A-3, B-3      |
| `utils/chat-tools.ts`                | get_issue_context, search_decisions, prepare_meeting 도구 추가 | B-1, C-2, C-3 |
| `shared/src/constants.ts`            | Phase C feature flags + config 타입/로더 추가                  | C-1, C-2, C-3 |
| `shared/src/db/schema.ts`            | `decisionJournal` 테이블 추가                                  | C-2           |
| `index.ts` (workflow-engine)         | MeetingPrepScheduler 시작                                      | C-3           |
| `routes/index.ts` (webhook-listener) | context 라우트 등록                                            | B-1           |

### DB 마이그레이션

| 파일                                    | 내용                          |
| --------------------------------------- | ----------------------------- |
| `drizzle/0003_add_context_links.sql`    | context_links 테이블 (B-1)    |
| `drizzle/0004_add_decision_journal.sql` | decision_journal 테이블 (C-2) |

### 환경변수 추가

```bash
# A-1: Role-aware Notifications
TEAM_ROLE_CHANNELS=designer=C01234,developer=C05678,qa=C09012,pm=C03456

# A-3: Daily Team Digest
TEAM_DIGEST_ENABLED=true
TEAM_DIGEST_CRON="0 0 * * 1-5"

# B-2: Smart Handoff
SMART_HANDOFF_ENABLED=true

# B-3: Blocker Detection
BLOCKER_DETECTION_ENABLED=true
BLOCKER_CHECK_CRON="0 2,6 * * 1-5"
BLOCKER_STALE_DAYS=3
BLOCKER_REVIEW_DELAY_HOURS=24
```

## Phase C 구현 파일

### 신규 파일

| 파일                              | 기능 | 패키지          |
| --------------------------------- | ---- | --------------- |
| `utils/impact-analyzer.ts`        | C-1  | workflow-engine |
| `utils/impact-formatter.ts`       | C-1  | workflow-engine |
| `utils/decision-detector.ts`      | C-2  | workflow-engine |
| `utils/decision-store.ts`         | C-2  | workflow-engine |
| `utils/decision-formatter.ts`     | C-2  | workflow-engine |
| `utils/meeting-prep.ts`           | C-3  | workflow-engine |
| `utils/meeting-prep-formatter.ts` | C-3  | workflow-engine |
| `utils/meeting-prep-scheduler.ts` | C-3  | workflow-engine |

### DB 마이그레이션

| 파일                                    | 내용                          |
| --------------------------------------- | ----------------------------- |
| `drizzle/0004_add_decision_journal.sql` | decision_journal 테이블 (C-2) |

### 환경변수 추가

```bash
# C-1: Impact Analysis
IMPACT_ANALYSIS_ENABLED=true

# C-2: Decision Journal
DECISION_JOURNAL_ENABLED=true

# C-3: Meeting Prep
MEETING_PREP_ENABLED=true
DAILY_SCRUM_PREP_CRON="50 23 * * 0-4"
```

## 인프라 개선

| 순서   | 기능                                        | 상태         | 비고                                                     |
| ------ | ------------------------------------------- | ------------ | -------------------------------------------------------- |
| **10** | [MCP 서버 마이그레이션](./MCP_MIGRATION.md) | ✅ 구현 완료 | M-1~M-5 전체 완료. 커스텀 MCP 4개 → 공식/커뮤니티 전환   |

## 설계 원칙

1. **하위 호환**: 기존 기능은 유지. 새 feature flag로 점진적 활성화
2. **Fire-and-forget**: 조율 기능의 실패가 핵심 워크플로우를 중단하지 않음
3. **점진적 풍부화**: B-1 없이도 A 기능들은 독립 동작. B-1 추가 시 더 풍부해짐
4. **템플릿 우선, AI 나중**: Phase 1은 템플릿 기반 (비용 0). Phase 2에서 AI 요약 추가
5. **기존 패턴 준수**: BullMQ, Drizzle, pino 로거, feature flag 등 기존 컨벤션 유지
