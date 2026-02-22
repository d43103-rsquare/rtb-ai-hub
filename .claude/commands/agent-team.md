---
description: AI 에이전트 팀 오케스트레이터 — Jira 이슈 기반 전체 개발 워크플로우 실행
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# Agent Team Orchestrator

**이슈**: $ARGUMENTS

AI 에이전트 팀을 조율하여 Jira 이슈를 분석부터 배포까지 자동으로 처리합니다.

## 워크플로우 상태머신

```
[Analyse] -> [Design] --(승인)--> [Develop] -> [Review+Test 병렬] -> [Ops] --(승인)--> [Done]
```

에이전트 의견 충돌 시 자동 에스컬레이션 -> 사람 개입.

---

## Step 1: Task 초기화

`docs/plans/$ARGUMENTS/` 디렉토리와 아래 내용의 `00-brief.md`를 생성합니다.

```
# Task: $ARGUMENTS

**Created**: {현재 ISO 시각}

## Summary

_이슈 요약 (Analyse 단계에서 채워짐)_

## Phases

- [ ] Analyse
- [ ] Design (승인 필요)
- [ ] Develop
- [ ] Review + Test (병렬)
- [ ] Ops (승인 필요)
- [ ] Done
```

---

## Step 2: [Analyse] — Analyst 에이전트

compound-engineering:research:repo-research-analyst 및 learnings-researcher 에이전트로:
- 이슈 관련 코드베이스 분석
- 과거 유사 결정 검색 (claude-mem + decision_journal)
- 산출물 -> `docs/plans/$ARGUMENTS/01-analysis.md`

두 에이전트를 병렬로 실행하고 결과를 01-analysis.md로 병합.

---

## Step 3: [Design] — Architect 에이전트

compound-engineering:design:code-architect 에이전트로:
- 설계 문서 작성
- 트레이드오프 분석
- 산출물 -> `docs/plans/$ARGUMENTS/02-design.md`

**[설계 승인 체크포인트]**

설계 문서를 사용자에게 보여주고 명시적 승인을 받습니다.
승인 없이 Develop 단계로 진행하지 않습니다.

---

## Step 4: [Develop] — Developer (메인 Claude 세션)

승인된 설계 기반으로:
- `superpowers:using-git-worktrees`로 격리 브랜치 생성
- 코드 구현 및 커밋

---

## Step 5: [Review + Test] — 병렬 실행

두 에이전트를 동시에 실행:

**Reviewer**:
- compound-engineering:review:code-reviewer
- compound-engineering:review:security-sentinel
- compound-engineering:review:performance-oracle
- 산출물 -> `docs/plans/$ARGUMENTS/03-review.md`

**Test**:
- `pnpm test && pnpm test:integration` 실행
- 산출물 -> `docs/plans/$ARGUMENTS/04-test.md`

---

## Step 6: [Ops] — 운영 검증

`mcp__rtb-connections__query_db` 및 `mcp__rtb-connections__run_aws_cli` 도구로:
- DB 마이그레이션 검증
- AWS 리소스 상태 확인
- 배포 준비 체크리스트

**[배포 전 승인 체크포인트]**

운영 검증 결과를 사용자에게 보여주고 배포 승인을 받습니다.

---

## Step 7: [Done] — 완료

PR 생성 후 아래 내용으로 `docs/plans/$ARGUMENTS/99-memory.md`를 작성합니다.

```
# Learnings: $ARGUMENTS

## 핵심 결정

_이 이슈에서 내린 주요 기술 결정_

## 다음에 활용할 점

_향후 유사 작업 시 참고할 인사이트_
```

`mcp__plugin_claude-mem_mcp-search__save_memory`로 99-memory.md 내용을 세션 간 누적.

---

## 사람 개입 시점

| 단계 | 트리거 | 액션 |
|------|--------|------|
| Design 완료 | 자동 | 설계 승인 요청 |
| 에이전트 충돌 | 자동 | 에스컬레이션 |
| Ops 완료 | 자동 | 배포 승인 요청 |
| 언제든 | `/pause` 입력 | 즉시 일시정지 |
