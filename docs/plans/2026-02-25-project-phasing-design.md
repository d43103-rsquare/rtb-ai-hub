# RTB AI Hub 단계별 실행 설계

> 작성일: 2026-02-25
> 상태: Approved

## 프로젝트 재정의

**비전**: Jira 티켓 기반 AI 자동 개발 허브

**핵심 원칙**:
- 티켓 유형(Feature/Bug/Policy)에 따라 다른 AI 프로세스를 실행하여 PR을 생성
- 각 단계가 독립적으로 가치를 가져야 함 (전체 완성이 필수가 아닌 구조)
- 가장 실용적이고 빈번한 케이스(Bug Fix)부터 시작

## Jira 티켓 유형별 처리 파이프라인

### 티켓 분류 (공통 Step 0)

```
Jira 티켓 수신
    → 티켓 유형 판별 (issuetype, labels, 내용 분석)
    → Feature? Bug? Policy?
    → 해당 워크플로우로 라우팅
```

### Flow A: Bug Fix (Phase 1)

```
1. 컨텍스트 수집
   - Jira 티켓 상세 (재현 단계, 에러 로그 등)
   - 연관 모니터링 데이터 (Datadog 등, 확장 가능)
   - 코드베이스 관련 파일 식별

2. 버그 재현 확인
   - 에러 시나리오 분석
   - 관련 테스트 실행으로 실패 확인

3. 원인 분석
   - 스택 트레이스 → 소스 코드 추적
   - 근본 원인 식별 + 문서화

4. 수정 코드 생성
   - Claude Code로 수정
   - 회귀 테스트 추가
   - Worktree에서 격리 작업

5. PR 생성
   - 원인 분석 + 수정 내용 포함
   - Jira 티켓에 PR 링크 코멘트
```

### Flow B: Feature (Phase 2)

```
1. 영향 범위 분석
   - 코드베이스에서 관련 모듈/파일 식별
   - 기존 아키텍처 패턴 파악

2. 설계 분석
   - Figma 디자인 있으면 → 컴포넌트 구조 분석
   - 요구사항 → 기술 설계 (어떤 파일을 만들고/수정할지)

3. 코드 생성
   - Claude Code로 구현
   - Worktree에서 격리 작업

4. PR 생성
   - 설계 근거 포함한 PR description
   - Jira 티켓에 PR 링크 코멘트
```

### Flow C: Policy Change (Phase 미정)

- 아직 구체적인 사례 없음
- Phase 2 이후 실제 케이스 발생 시 설계

## 로드맵

```
Phase 1 (2주): Bug Fix 자동화        ← 가장 실용적, 빈번한 케이스
Phase 2 (2주): Feature 자동화         ← 설계 분석 포함, 더 복잡
Phase 3 (2주): 입력 경로 확장         ← Figma→Jira, Incident→Jira
Phase 4 (2주): 출력 + 시각화          ← Auto Review, Dashboard, Monitor
```

## Phase 1 상세: Bug Fix 자동화 (2주)

**목표**: Jira에 버그 티켓이 생기면 AI가 원인 분석 → 수정 코드 → PR을 생성

**성공 기준**: 버그 Jira 티켓 생성 → 10분 내 원인 분석 + 수정 PR 올라옴

### Week 1

| # | 작업 | 설명 |
|---|------|------|
| 1-1 | 인프라 검증 | Docker + pg-boss 기동 확인, Jira 웹훅 연결 |
| 1-2 | 티켓 분류기 구현 | Jira issuetype/labels → Bug/Feature/Policy 분류 |
| 1-3 | bug-fix 워크플로우 스켈레톤 | 5단계 파이프라인 기본 구조 |
| 1-4 | 컨텍스트 수집 + 원인분석 | Jira 정보 + 코드 추적 로직 |

### Week 2

| # | 작업 | 설명 |
|---|------|------|
| 2-1 | Claude Code 연동 | 수정 코드 생성 + 테스트 추가 |
| 2-2 | Worktree + PR 자동 생성 | 격리 브랜치 → PR + Jira 코멘트 |
| 2-3 | Happy path E2E 테스트 | 전체 흐름 통합 테스트 |
| 2-4 | 데모 시나리오 | 실제 버그 티켓으로 데모 준비 |

## Phase 2-4 개요

| Phase | 핵심 | 추가되는 것 |
|-------|------|------------|
| **2** | Feature 자동화 | 영향 범위 분석, 설계 분석, Figma 컨텍스트 |
| **3** | 입력 확장 | Figma→Jira, Datadog→Jira 자동 생성 |
| **4** | 출력 + UI | Auto Review, Deploy Monitor, Dashboard |

## 기존 코드 활용 계획

### Phase 1에서 사용

| 모듈 | 활용 방법 |
|------|-----------|
| shared (타입, DB, 유틸) | 그대로 사용 |
| webhook-listener (Jira 라우트) | 그대로 사용 |
| workflow-engine/jira-auto-dev | 리팩터링 → bug-fix 흐름으로 재구성 |
| workflow-engine/claude-code | 그대로 사용 |
| workflow-engine/worktree | 그대로 사용 |
| workflow-engine/harness | 그대로 사용 |

### 후순위로 이관

| 모듈 | 이관 시점 |
|------|-----------|
| figma-to-jira | Phase 3 |
| debate 엔진 | Phase 2+ (복잡한 Feature에 선택적) |
| auto-review | Phase 4 |
| deploy-monitor | Phase 4 |
| incident-to-jira | Phase 3 |
| dashboard | Phase 4 |

## 현재 프로젝트 상태 (2026-02-25 기준)

| 패키지 | 완성도 | 상태 |
|--------|--------|------|
| shared | 95% | Production-ready |
| auth-service | 90% | Production-ready (테스트 없음) |
| webhook-listener | 88% | Production-ready |
| workflow-engine | 72% | 핵심 로직 완성, 일부 통합 미완 |
| dashboard | 40-65% | 뼈대만 완성 |
