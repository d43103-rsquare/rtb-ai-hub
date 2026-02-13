# oh-my-opencode v3.0.0 ~ v3.4.0 기능 개발 정리

> 약 2주간 (2026-01-24 ~ 2026-02-08) 23개 릴리즈
> 출처: https://github.com/code-yeongyu/oh-my-opencode/releases

---

## v3.0.0 — The Orchestration Revolution (01/24)

핵심 아키텍처가 완전히 바뀐 메이저 릴리즈:

- **Dynamic Agent Composition** — Category(모델 추상화) + Skill 조합으로 서브에이전트를 동적 생성. 하드코딩된 에이전트 폐기
- **Prometheus** — 전략 기획 에이전트. 인터뷰 방식으로 요구사항을 명확히 한 뒤 작업 계획 수립
- **Atlas** — 마스터 오케스트레이터. `/start-work`로 활성화, Category+Skill 조합으로 최적 에이전트 배치, 검증까지 자동 수행
- **Ultrawork Mode 개선** — 더 타이트한 정렬로 에이전트가 트랙에서 벗어나지 않도록
- **Interactive CLI Installer** — 자동 모델 매핑, 네이티브 바이너리, 멀티 프로바이더 지원
- **자동 설정 마이그레이션** — 기존 사용자 설정 런타임 자동 변환

---

## v3.1.x — 인프라 강화 (01/26 ~ 02/01)

### v3.1.0 (01/26)

- **Tmux Pane 2D Grid Layout** — 백그라운드 에이전트 세션을 2D 그리드로 시각화
- **Browser Automation Skills** — `agent-browser`, `dev-browser` 스킬 추가 (웹 스크래핑, 테스트)
- **Category-Skill Reminder Hook** — 오케스트레이터에게 사용 가능한 카테고리/스킬 리마인드

### v3.1.1 (01/26)

- **Plan Agent** — Prometheus 설정 + 폴백 체인, 의존성/병렬 그래프 적용

### v3.1.3 (01/27)

- **Sisyphus Tasks & Swarm (Wave 1)** — 태스크/스웜 기초 스키마
- **Context7 MCP OAuth** — Authorization 헤더 지원
- **서버 환경변수** — `OPENCODE_SERVER_PORT`, `OPENCODE_SERVER_HOSTNAME`

### v3.1.5 (01/28)

- Prometheus를 Plan Agent로 교체, 병렬 태스크 그래프 출력
- 에이전트에서 사용자 개입 제로 정책 강제

### v3.1.7 (01/29)

- **MCP OAuth 2.1 인증** — RFC 7591/9728/8414/8707 완전 지원, CLI 명령어 (`opencode mcp oauth login/logout/status`)
- **LSP Client -> vscode-jsonrpc 마이그레이션** — 프로토콜 안정성 향상
- 좀비 프로세스 방지 (자식 세션 자동 abort)

### v3.1.9 (01/30)

- **Kimi K2.5 프로바이더 추가** — Atlas 오케스트레이터에서 Sonnet 4.5보다 좋은 성능
- **deep 카테고리** — 자율적 심층 문제 해결
- **artistry 카테고리** — 창의적/비표준 패턴 접근
- **모델 자동 재시도** — 프로바이더 추천 모델로 자동 재시도

### v3.1.11 (02/01)

- **Oracle Safety Review** — 배포 전 안전성 분석
- **/stop-continuation** — Ralph Loop, Todo 연속작업, Boulder 일괄 중단 명령
- **GLM-4.7 Thinking Mode** 지원

---

## v3.2.0 — Meet Hephaestus (02/01)

- **Hephaestus** — 자율 Deep Worker 에이전트 (GPT 5.2 Codex Medium)
  - 목표 지향적 (레시피가 아닌 목표를 제공)
  - 코드 작성 전 2~5개 탐색 에이전트를 병렬 실행
  - 100% 완료 + 검증 증거까지 자동 수행
  - 기존 코드 스타일 매칭
- **Unstable Agent Babysitter** — 불안정한 백그라운드 에이전트 모니터링 훅
- **Doctor** — OpenCode Desktop GUI 설치 감지 (전 플랫폼)

### v3.2.2 (02/03)

- **GPT-5.2 프롬프트 최적화** — Atlas, Sisyphus-Junior, Oracle에 XML 구조 + 모델별 라우팅
- **Task System (실험적)** — `TaskCreate/Get/List/Update` 도구 (Claude Code 스펙 호환)
- **Preemptive Compaction** — 컨텍스트 78% 사용 시 자동 요약
- **github-pr-triage / github-issue-triage 스킬** 추가

### v3.2.3 (02/04)

- **멀티 웹검색 프로바이더** — Exa (기본) + Tavily 선택
- **중첩 스킬 디렉토리** — 서브디렉토리로 스킬 조직화
- **disabledSkills** — 선택적 스킬 비활성화 설정

### v3.2.4 (02/06)

- **GPT 5.3 Codex + Claude Opus 4.6 동시 채택** — 108 파일, +4,666/-4,625 라인
- **Hephaestus 진화** — 3가지 접근법을 자동 시도 후 사용자에게 에스컬레이션
- **Write Guard** — 기존 파일 덮어쓰기 방지 훅
- **커스텀 스킬 우선순위 격상** — HIGH PRIORITY로 프롬프트에 강조
- **자동 모델 버전 마이그레이션** — `MODEL_VERSION_MAP`으로 설정 자동 업그레이드

---

## v3.3.0 — Subagent Transparency (02/07)

- **`delegate_task` -> `task`** — 서브에이전트 위임이 투명해짐. UI에서 클릭하면 프롬프트, 모델, 세션 ID 등 전체 컨텍스트 확인 가능
- **CLI 확장** — `--port`, `--attach`, `--session-id`, `--on-complete`, `--json` 플래그
- **Opus 4.6 effort=max** — anthropic-effort 훅으로 자동 주입
- **Plugin Safety** — `plugin_load_timeout_ms`, `safeCreateHook()` 안전장치
- **MCP 설정 확장** — `~/.claude.json` + `~/.claude/.mcp.json` 동시 읽기
- **Cascade Cancel** — 부모 삭제 시 자식 서브에이전트 연쇄 취소

---

## v3.4.0 — Context Continuity (02/08, Latest)

- **/handoff** — 컴팩션 전에 세션 컨텍스트를 새 세션으로 프로그래밍 방식으로 이전. 작업 중 컨텍스트 손실 방지
- **Claude Tasks 통합** — `CLAUDE_CODE_TASK_LIST_ID` 환경변수로 Claude Code 태스크 리스트와 직접 연동
- **Anthropic Prefill Auto-Recovery** — assistant 메시지 prefill 제한 자동 감지 + 우회
- **백그라운드 태스크 가시성** — 완료된 태스크 제목 표시
- **모듈 분할** — 6개 대형 모듈을 각 200줄 미만으로 분리 (102 파일, +5,919/-2,263)

---

## 요약: 핵심 발전 방향

| 영역 | 진화 과정 |
|---|---|
| **에이전트 시스템** | 하드코딩 -> Category+Skill 동적 조합 -> Prometheus(기획) -> Atlas(오케스트레이션) -> Hephaestus(자율 딥워크) |
| **모델 지원** | 단일 -> 멀티 프로바이더 (OpenAI, Anthropic, Kimi, GLM, Copilot) -> 동일 날 최신 모델 즉시 채택 |
| **투명성** | 블랙박스 서브에이전트 -> 클릭 가능한 메타데이터 -> `/handoff`로 컨텍스트 보존 |
| **안정성** | 좀비 프로세스 방지, Write Guard, Babysitter, Cascade Cancel, Preemptive Compaction |
| **확장성** | MCP OAuth 2.1, 웹검색 멀티 프로바이더, 중첩 스킬, Claude Tasks 통합 |
