# Figma Ready for Dev POC — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Figma URL을 입력하면 디자인을 분석하여 Story/Task/Subtask 구조의 요구사항을 생성하는 Claude Code 스킬

**Architecture:** `/figma-analyze` 스킬이 Figma MCP(get_design_context, get_metadata, get_screenshot)를 호출하여 디자인 데이터를 수집하고, 프롬프트 지침에 따라 Claude가 직접 요구사항을 분석·출력

**Tech Stack:** Claude Code skill (.md), Figma MCP server (mcp__figma__*)

---

### Task 1: 스킬 파일 생성

**Files:**
- Create: `.claude/commands/figma-analyze.md`

**Step 1: 스킬 파일 작성**

아래 내용으로 `.claude/commands/figma-analyze.md`를 생성:

```markdown
---
description: Figma 디자인 분석 → 요구사항(Story/Task/Subtask) 자동 생성 (Ready for Dev POC)
allowed-tools: mcp__figma__get_design_context, mcp__figma__get_metadata, mcp__figma__get_screenshot, mcp__figma__get_variable_defs
---

# Figma Design Analyzer

**입력**: $ARGUMENTS

Figma 디자인 URL을 분석하여 개발 요구사항(Story/Task/Subtask)을 생성합니다.

---

## Step 1: URL 파싱

$ARGUMENTS에서 Figma URL을 추출하고 아래 규칙으로 파싱합니다:

- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → fileKey, nodeId 추출
- node-id의 `-`를 `:`로 변환 (예: `43-2` → `43:2`)
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → branchKey를 fileKey로 사용
- node-id가 없으면 페이지 전체 분석 (`0:1`을 nodeId로 사용)

---

## Step 2: Figma MCP 데이터 수집

아래 3개 MCP 도구를 **순서대로** 호출합니다 (각 결과가 다음 분석에 필요):

### 2-1. get_design_context (핵심)

```
mcp__figma__get_design_context({
  fileKey: "<추출한 fileKey>",
  nodeId: "<추출한 nodeId>",
  clientLanguages: "typescript,html,css",
  clientFrameworks: "react"
})
```

이 도구가 반환하는 데이터:
- 생성된 React+Tailwind 코드 (컴포넌트 구조 파악용)
- 코드에서 참조하는 에셋 다운로드 URL
- Code Connect 매핑 (기존 코드베이스 컴포넌트 연결 정보)
- 디자인 어노테이션, 토큰, 제약사항

### 2-2. get_metadata (구조 보완)

```
mcp__figma__get_metadata({
  fileKey: "<추출한 fileKey>",
  nodeId: "<추출한 nodeId>",
  clientLanguages: "typescript",
  clientFrameworks: "react"
})
```

XML 형태의 레이어 구조를 반환합니다:
- 모든 노드의 ID, 타입, 이름, 위치, 크기
- 컴포넌트 계층 파악에 유용

### 2-3. get_screenshot (시각적 참조)

```
mcp__figma__get_screenshot({
  fileKey: "<추출한 fileKey>",
  nodeId: "<추출한 nodeId>"
})
```

스크린샷을 가져와서 시각적으로 확인합니다.

---

## Step 3: 디자인 분석

수집된 데이터를 기반으로 아래 항목을 분석합니다:

### 3-1. 컴포넌트 식별
- get_design_context의 코드에서 React 컴포넌트 구조 파악
- get_metadata의 레이어 트리에서 컴포넌트 계층 확인
- 재사용 가능한 컴포넌트 vs 페이지 고유 요소 분류

### 3-2. 디자인 토큰 추출
- 색상, 타이포그래피, 간격 패턴
- 디자인 시스템 연관성 (기존 토큰 매핑 가능 여부)

### 3-3. 인터랙션 및 상태 분석
- 버튼, 입력 필드 등의 상태 변화 (hover, active, disabled)
- 네비게이션 흐름, 모달, 드롭다운 등 동적 요소
- 반응형 레이아웃 고려사항

### 3-4. 구현 복잡도 평가
- 각 컴포넌트의 스토리 포인트 추정 (1/2/3/5/8)
- API 연동 필요 여부
- 서드파티 라이브러리 필요 여부

---

## Step 4: 요구사항 출력

아래 포맷으로 분석 결과를 출력합니다:

```
## Figma Design Analysis: [디자인 이름]

**Figma URL**: [원본 URL]
**분석 시점**: [현재 시각]

---

### Story

**[한 줄 요약]**

[2-3문장의 상세 설명. 이 디자인이 해결하는 사용자 문제, 핵심 기능, 예상 사용자 흐름]

---

### Tasks

#### Task 1: [컴포넌트/기능명] (SP: N)

**설명**: [구현 범위, 기술적 고려사항]

**디자인 참조**:
- 레이아웃: [Flex/Grid, 간격, 정렬]
- 색상: [사용된 디자인 토큰]
- 타이포그래피: [폰트, 크기, 무게]

**Subtasks**:
1. **구현**: [핵심 구현 포인트]
2. **테스트**: [테스트 시나리오]
3. **검증**: [디자인 일치 확인 항목]

#### Task 2: ...

(모든 식별된 컴포넌트에 대해 반복)

---

### Summary

| 항목 | 값 |
|------|-----|
| 총 Task 수 | N |
| 총 Story Points | N |
| 주요 컴포넌트 | [목록] |
| 예상 디자인 토큰 | [목록] |
| API 연동 필요 | 예/아니오 |
```

---

## 주의사항

- get_design_context가 가장 중요한 데이터 소스입니다. 이 도구의 결과를 최우선으로 활용합니다.
- nodeId가 없는 URL의 경우 `0:1` (첫 페이지)로 get_metadata를 먼저 호출하여 주요 프레임의 nodeId를 확인한 후 get_design_context를 호출합니다.
- 스크린샷은 시각적 참조용이며, 구조 분석에는 get_design_context와 get_metadata를 사용합니다.
- 이 스킬은 분석 결과 출력만 수행합니다. Jira 이슈 생성은 하지 않습니다.
```

**Step 2: 동작 확인**

스킬이 등록되었는지 확인:
```bash
ls -la .claude/commands/figma-analyze.md
```
Expected: 파일이 존재하며 내용이 올바름

**Step 3: 커밋**

```bash
git add .claude/commands/figma-analyze.md docs/plans/2026-02-23-figma-ready-for-dev-poc-design.md docs/plans/2026-02-23-figma-ready-for-dev-poc.md
git commit -m "feat: add /figma-analyze skill for Ready for Dev POC

Figma MCP를 활용하여 디자인 URL에서 요구사항(Story/Task/Subtask)을
자동 생성하는 Claude Code 스킬 추가.

- get_design_context: React 코드 + 구조 + 힌트
- get_metadata: 레이어 구조 XML
- get_screenshot: 시각적 참조
- 분석 결과는 마크다운으로 출력 (Jira 생성 없음)"
```

---

### Task 2: 실제 Figma URL로 테스트

**Step 1: 스킬 실행**

사용자가 실제 Figma URL을 제공하면:
```
/figma-analyze https://figma.com/design/<fileKey>/<fileName>?node-id=<nodeId>
```

**Step 2: 결과 검증**

확인 항목:
- [ ] URL 파싱이 올바른가 (fileKey, nodeId 정확히 추출)
- [ ] get_design_context가 코드를 반환하는가
- [ ] get_metadata가 레이어 구조를 반환하는가
- [ ] Story/Task/Subtask 구조가 합리적인가
- [ ] 스토리 포인트 추정이 타당한가

**Step 3: 필요 시 프롬프트 개선**

테스트 결과에 따라 `.claude/commands/figma-analyze.md`의 분석 지침을 조정.
