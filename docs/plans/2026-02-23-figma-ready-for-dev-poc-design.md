# Figma Ready for Dev — POC Design

**Date**: 2026-02-23
**Status**: Approved
**Scope**: Claude Code skill for Figma design analysis

## Problem

현재 figma-to-jira 워크플로우는 `FILE_UPDATE` 웹훅(파일 저장 시 발생)에 의존.
디자이너가 아직 작업 중인 미완성 디자인도 처리될 수 있고, 수동으로 URL을 전달하는 방법이 없음.

Figma의 "Ready for Dev" 기능은 디자이너가 명시적으로 개발 준비 완료를 표시하는 메커니즘.
이를 활용하면 의도된 시점에만 분석을 실행할 수 있음.

## Decision

POC 단계에서는 웹훅 대신 **Claude Code 스킬 + Figma MCP** 방식으로 구현.

- 트리거: 사용자가 `/figma-analyze <Figma URL>` 실행
- 데이터 수집: Figma MCP `get_design_context`, `get_metadata`
- 분석: 단일 Claude AI (에이전트 팀/Debate 없음)
- 출력: Story/Task/Subtask 마크다운 (Jira 생성 없음)

## Architecture

```
/figma-analyze <URL>
    │
    ├─ URL 파싱: fileKey, nodeId 추출
    │
    ├─ Figma MCP 호출 (병렬)
    │   ├─ get_design_context(fileKey, nodeId) → 코드 + 구조 + 힌트
    │   └─ get_metadata(fileKey, nodeId)       → 레이어 구조 XML
    │
    ├─ Claude 분석 (스킬 프롬프트 지침)
    │   ├─ 디자인 구조 파악
    │   ├─ Story 정의
    │   ├─ Task 분해 (컴포넌트 단위)
    │   └─ Subtask 생성 (구현/테스트/검증)
    │
    └─ 마크다운 출력
```

## Implementation

단일 파일: `.claude/commands/figma-analyze.md`

스킬 프롬프트 구성:
1. URL에서 fileKey, nodeId 추출 규칙
2. Figma MCP 도구 호출 순서 (get_design_context → get_metadata)
3. 분석 지침: 컴포넌트 계층, 레이아웃, 디자인 토큰 식별
4. 출력 포맷: Story → Task(SP 포함) → Subtask(구현/테스트/검증)

## Future (웹훅 전환 시)

- `DEV_MODE_STATUS_UPDATE` 웹훅 이벤트 수신 추가
- 웹훅 페이로드: `file_key`, `node_id`, `status: READY_FOR_DEV`
- 동일한 분석 로직을 workflow-engine으로 이전
- Debate Engine 연동으로 에이전트 팀 분석 활성화

## Constraints

- Figma MCP가 Claude Code 세션에 연결되어 있어야 동작
- `get_design_context`는 nodeId 필수 — URL에 node-id 파라미터가 있어야 정밀 분석 가능
- nodeId 없이 fileKey만 있으면 get_metadata로 페이지 레벨 구조만 조회
