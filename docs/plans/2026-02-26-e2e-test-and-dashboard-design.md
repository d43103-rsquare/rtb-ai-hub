# E2E Test & Dashboard Mock Jira Integration Design

## 1. Dashboard Mock Jira Link

Sidebar에 `VITE_MOCK_JIRA=true`일 때만 "Mock Jira" 외부 링크를 표시한다. `/mock-jira/`로 이동하면 Vite proxy가 mock-jira 서버(:3001)의 서버사이드 HTML UI를 그대로 전달한다. React 컴포넌트 추가 없음.

**변경 파일:**
- `packages/dashboard/src/components/layout/Sidebar.tsx` — 조건부 Mock Jira 링크
- `packages/dashboard/src/utils/constants.ts` — `MOCK_JIRA_ENABLED` flag

## 2. E2E Test — curl Script

`scripts/e2e-bug-fix.sh`로 전체 bug-fix 루프를 자동화:

1. Mock Jira API 헬스체크
2. Seed 이슈 확인 (GET PROJ-1)
3. Webhook trigger (POST /mock/trigger)
4. webhook-listener 202 응답 확인
5. 대기 후 Mock Jira 이슈 상태/댓글 변경 확인
6. PASS/FAIL 출력

사전 조건: mock-jira, webhook-listener, workflow-engine이 실행 중이어야 함.

## 3. E2E Test — Vitest Integration

`tests/integration/bug-fix-e2e.test.ts`:

- beforeAll: mock-jira 서버를 in-process로 시작, webhook-listener와 workflow-engine은 외부 실행 가정 (또는 프로그래밍 방식 시작)
- 테스트: Mock Jira에 이슈 생성 → trigger → 워크플로우 대기 → 결과 검증
- ANTHROPIC_API_KEY 없으면 skip
- afterAll: 정리

## Data Flow

```
[Mock Jira :3001] POST /mock/trigger
    |
[webhook-listener :4000] /webhooks/jira?env=int → 202
    |
[pg-boss] jira-queue
    |
[workflow-engine] classifyTicket → processBugFix
    |
[Mock Jira :3001] POST /rest/api/3/issue/PROJ-1/comment
                   POST /rest/api/3/issue/PROJ-1/transitions
```
