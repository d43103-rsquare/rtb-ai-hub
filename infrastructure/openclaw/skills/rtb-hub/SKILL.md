---
name: rtb-hub
description: RTB AI Hub의 Knowledge API와 Infrastructure API에 접근합니다.
metadata:
  {
    'openclaw':
      { 'requires': { 'env': ['RTB_API_URL', 'RTB_API_TOKEN'] }, 'primaryEnv': 'RTB_API_URL' },
  }
---

# RTB AI Hub API

RTB AI Hub의 Knowledge API와 Infrastructure API를 사용할 수 있습니다.
모든 API 호출에는 `Authorization: Bearer ${RTB_API_TOKEN}` 헤더가 필요합니다.

## Knowledge API

### 위키 검색

요구사항이나 기술적 질문에 대한 RTB 도메인 지식을 검색합니다.

```bash
curl -s --max-time 30 -X POST "${RTB_API_URL}/api/knowledge/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"query": "<검색어>", "maxDocs": 4}'
```

응답: `{ "context": "...", "tables": ["obj_bld_mst"], "domains": ["obj"] }`

### 요구사항 정제

요구사항을 RTB 도메인 지식과 결합하여 정제합니다.

```bash
curl -s --max-time 120 -X POST "${RTB_API_URL}/api/knowledge/refine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"requirement": "<요구사항>", "jiraKey": "<이슈키>"}'
```

응답: `{ "refinedSpec": "...", "wikiContext": "...", "suggestedTables": [...] }`

### 테이블 문서 조회

```bash
curl -s --max-time 30 "${RTB_API_URL}/api/knowledge/table/<테이블명>" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}"
```

응답: `{ "content": "# obj_bld_mst\n...", "found": true }`

### 도메인 개요 조회

```bash
curl -s --max-time 30 "${RTB_API_URL}/api/knowledge/domain/<도메인키>" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}"
```

응답: `{ "content": "# OBJ Domain Overview\n...", "found": true }`

## Infrastructure API

### 브랜치 생성

```bash
curl -s --max-time 30 -X POST "${RTB_API_URL}/api/infra/git/branch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"jiraKey": "<이슈키>", "type": "feature", "description": "<설명>", "env": "int"}'
```

응답: `{ "branchName": "feature/RNR-123-building-api", "baseBranch": "develop" }`

type 옵션: `feature`, `bugfix`, `hotfix`

### 코드 커밋 & 푸시

```bash
curl -s --max-time 60 -X POST "${RTB_API_URL}/api/infra/git/commit-push" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>", "files": [{"path": "src/foo.ts", "content": "..."}], "message": "[RNR-123] Add building API"}'
```

응답: `{ "commitHash": "abc123", "pushed": true }`

### CI 실행

```bash
curl -s --max-time 300 -X POST "${RTB_API_URL}/api/infra/ci/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>"}'
```

응답: `{ "success": true, "steps": [{"name": "lint", "passed": true}, {"name": "test", "passed": true}] }`

### OpenCode 개발 작업

OpenCode Server를 통해 코드 생성 작업을 요청합니다.

```bash
curl -s --max-time 600 -X POST "${RTB_API_URL}/api/infra/opencode/task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"prompt": "<개발 프롬프트>", "sessionId": "<세션ID>"}'
```

응답: `{ "taskId": "...", "status": "completed", "result": "..." }`

### 프리뷰 환경 배포

```bash
curl -s --max-time 120 -X POST "${RTB_API_URL}/api/infra/deploy/preview" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>", "jiraKey": "<이슈키>", "env": "int"}'
```

응답: `{ "url": "http://preview-xxx:3000", "status": "running" }`

### PR 생성

```bash
curl -s --max-time 30 -X POST "${RTB_API_URL}/api/infra/pr/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}" \
  -d '{"branchName": "<브랜치명>", "title": "[RNR-123] Add building API", "body": "<PR 본문>"}'
```

응답: `{ "prNumber": 42, "url": "https://github.com/..." }`

## 시스템 상태 확인

```bash
curl -s --max-time 10 "${RTB_API_URL}/health"
```

응답: `{ "status": "ok", "service": "webhook-listener", "timestamp": "..." }`

## 크로스레퍼런스 조회

Jira 이슈와 관련된 모든 컨텍스트(Figma, GitHub PR, 배포 등)를 조회합니다.

```bash
curl -s --max-time 30 "${RTB_API_URL}/api/context/<이슈키>" \
  -H "Authorization: Bearer ${RTB_API_TOKEN}"
```

## 에러 처리

모든 API는 실패 시 다음 형식의 에러를 반환합니다:

```json
{ "error": "<에러 메시지>" }
```

- `401`: 인증 토큰이 없거나 잘못됨
- `400`: 필수 파라미터 누락
- `500`: 서버 내부 오류

에러 발생 시 에러 메시지를 확인하고, 필요한 경우 재시도합니다.
