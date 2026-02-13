# OpenCode 통합 가이드

RTB AI Hub는 **OpenCode와 Oh-My-OpenCode**를 활용하여 AI orchestration을 수행할 수 있습니다.

## 🎯 통합 방식

### 2가지 통합 모드

#### 1. MCP Plugin 모드

OpenCode 사용자가 **직접 RTB 워크플로우**를 실행

```typescript
// OpenCode에서 사용
await mcp.call('trigger_jira_workflow', {
  issueKey: 'PROJ-123',
  env: 'int',
});
```

#### 2. API Client 모드

Webhook 이벤트가 **OpenCode API를 자동 호출**

```
Jira Webhook → RTB AI Hub → OpenCode API → Oh-My-OpenCode → GitHub PR
```

---

## 📦 구성 요소

### 1. OpenCode MCP Server (`mcp-servers/opencode/`)

RTB 워크플로우를 OpenCode tool로 노출하는 MCP 서버입니다.

**제공 Tools:**

- `trigger_jira_workflow`: Jira 이슈 자동 개발 워크플로우 실행
- `trigger_figma_workflow`: Figma → Jira 변환 워크플로우 실행
- `get_workflow_status`: 워크플로우 실행 상태 확인

**설치:**

```bash
cd mcp-servers/opencode
npm install
npm run build
```

**실행:**

```bash
# Stdio 모드 (OpenCode IDE 통합)
MCP_TRANSPORT=stdio npm start

# HTTP 모드 (독립 서버)
MCP_SERVER_PORT=3000 npm start
```

### 2. OpenCode API Client (`packages/workflow-engine/src/clients/opencode-client.ts`)

Workflow engine이 OpenCode API를 호출하는 클라이언트입니다.

**특징:**

- Task 실행 및 상태 확인
- Polling 기반 완료 대기
- 타임아웃 및 에러 핸들링

### 3. OpenCode 워크플로우 (`packages/workflow-engine/src/workflows/jira-auto-dev-opencode.ts`)

OpenCode를 사용하는 새로운 Jira 자동 개발 워크플로우입니다.

**차이점:**

- **기존 (`jira-auto-dev.ts`)**: Claude API 직접 호출
- **신규 (`jira-auto-dev-opencode.ts`)**: OpenCode API 호출

---

## ⚙️ 설정

### 환경변수 (`.env.ai`)

```bash
# OpenCode API URL
# 로컬 개발: http://localhost:3333
# Docker 내부: http://opencode:3333
OPENCODE_API_URL=http://localhost:3333

# OpenCode API Key (선택사항)
# OPENCODE_API_KEY=your-api-key
```

### Docker 실행 모드

RTB AI Hub는 3가지 OpenCode 실행 모드를 지원합니다:

#### 모드 1: OpenCode 없이 실행 (기본)

```bash
# OpenCode 없이 기본 서비스만 실행
docker-compose -f docker-compose.test.yml up -d
```

이 경우 `jira-auto-dev` 워크플로우는 기존 Claude API 직접 호출 방식을 사용합니다.

#### 모드 2: OpenCode Mock 서버 사용

```bash
# OpenCode Mock 서버 포함하여 실행
docker-compose -f docker-compose.test.yml --profile opencode up -d

# 또는 OpenCode만 추가 실행
docker-compose -f docker-compose.test.yml up opencode -d
```

OpenCode Mock 서버는:

- ✅ OpenCode API 인터페이스 제공
- ✅ Claude API 직접 호출
- ❌ Oh-My-OpenCode 에이전트 미지원

#### 모드 3: 로컬 OpenCode 사용

로컬에서 실제 OpenCode를 실행하는 경우:

```bash
# .env.ai 설정
OPENCODE_API_URL=http://host.docker.internal:3333

# 로컬에서 OpenCode 실행
opencode serve --port 3333

# Docker 서비스 시작 (OpenCode 제외)
docker-compose -f docker-compose.test.yml up -d
```

이 경우 Docker 컨테이너가 호스트의 OpenCode에 접근합니다.

### OpenCode MCP 서버 등록

**OpenCode IDE 설정 (`mcp.json` 또는 `settings.json`):**

```json
{
  "mcpServers": {
    "rtb-workflows": {
      "command": "node",
      "args": ["/path/to/rtb-ai-hub/mcp-servers/opencode/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "RTB_WORKFLOW_API_URL": "http://localhost:4000"
      }
    }
  }
}
```

---

## 🚀 사용 방법

### OpenCode에서 직접 실행

```typescript
// Jira 이슈 자동 개발
const result = await mcp.call('trigger_jira_workflow', {
  issueKey: 'PROJ-123',
  env: 'int',
});

console.log('Execution ID:', result.executionId);

// 상태 확인
const status = await mcp.call('get_workflow_status', {
  executionId: result.executionId,
});
```

### Webhook 기반 자동 실행 (향후 구현)

```bash
# Jira Webhook이 자동으로 OpenCode 워크플로우 트리거
curl -X POST http://localhost:4000/webhooks/jira \
  -H "Content-Type: application/json" \
  -d '{
    "issueKey": "PROJ-123",
    "summary": "Implement login page",
    "status": "In Progress"
  }'
```

---

## 🎨 Oh-My-OpenCode 활용

OpenCode를 통해 실행되면 **Oh-My-OpenCode의 모든 에이전트**를 활용할 수 있습니다:

### 사용 가능한 에이전트

| 에이전트      | 역할                 | 활용 예시                 |
| ------------- | -------------------- | ------------------------- |
| **Sisyphus**  | 범용 작업 실행자     | 코드 생성, PR 생성        |
| **Oracle**    | 컨설팅 전문가        | 아키텍처 설계, 디버깅     |
| **Librarian** | 외부 레퍼런스 검색   | 라이브러리 문서, OSS 예제 |
| **Explorer**  | 내부 코드베이스 탐색 | 기존 패턴 찾기            |
| **Metis**     | 사전 계획 분석       | 요구사항 명확화           |
| **Momus**     | 계획 리뷰            | 계획 검증 및 보완         |

### 멀티 에이전트 파이프라인

```typescript
// OpenCode가 자동으로 적절한 에이전트 조합 사용
const task = await opencode.executeTask({
  category: 'deep',
  load_skills: ['git-master'],
  description: 'Implement Jira issue PROJ-123',
  prompt: '...',
});
```

**자동 실행 흐름:**

1. **Metis**: 요구사항 분석 및 명확화
2. **Explorer**: 기존 코드베이스 패턴 탐색
3. **Librarian**: 외부 라이브러리 문서 검색
4. **Sisyphus**: 실제 코드 생성 및 PR 생성
5. **Momus**: 최종 결과물 검증

---

## 🔧 개발 가이드

### MCP Tool 추가

새로운 워크플로우 tool을 추가하려면:

1. **Tool 파일 생성**

```bash
touch mcp-servers/opencode/src/tools/trigger-deploy-monitor.ts
```

2. **Tool 구현**

```typescript
export const triggerDeployMonitorSchema = {
  name: 'trigger_deploy_monitor',
  description: 'Monitor deployment and detect anomalies',
  inputSchema: {
    type: 'object',
    properties: {
      deploymentId: { type: 'string' },
      env: { type: 'string', enum: ['int', 'stg', 'prd'] },
    },
    required: ['deploymentId'],
  },
};

export async function triggerDeployMonitor(client, args) {
  return await client.triggerWorkflow({
    type: 'deploy-monitor',
    event: { deployment_id: args.deploymentId },
    env: args.env || 'int',
  });
}
```

3. **Export 추가**

```typescript
// mcp-servers/opencode/src/tools/index.ts
export * from './trigger-deploy-monitor.js';
```

4. **Server 등록**

```typescript
// mcp-servers/opencode/src/index.ts
import { triggerDeployMonitorSchema, triggerDeployMonitor } from './tools/index.js';

const tools: Tool[] = [
  // ... existing tools
  triggerDeployMonitorSchema as Tool,
];

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (name) {
    // ... existing cases
    case 'trigger_deploy_monitor':
      return {
        content: [
          { type: 'text', text: JSON.stringify(await triggerDeployMonitor(client, args), null, 2) },
        ],
      };
  }
});
```

### 새로운 OpenCode 워크플로우 추가

1. **워크플로우 파일 생성**

```bash
touch packages/workflow-engine/src/workflows/deploy-monitor-opencode.ts
```

2. **워크플로우 구현**

```typescript
export async function processDeployMonitorWithOpenCode(event, userId, env) {
  const opencode = getOpenCodeClient();

  const task = await opencode.executeTask({
    category: 'quick',
    load_skills: [],
    description: `Monitor deployment ${event.deploymentId}`,
    prompt: `
      Monitor the deployment and detect any anomalies.
      Use mcp-datadog to query metrics and logs.
    `,
  });

  if (task.task_id) {
    return await opencode.waitForCompletion(task.task_id);
  }

  return task.result;
}
```

---

## 🌟 장점

### OpenCode 통합의 이점

| 영역          | 개선 사항                                      |
| ------------- | ---------------------------------------------- |
| **인증**      | 사용자별 OpenCode 세션 활용 → API 키 문제 해결 |
| **AI 품질**   | Oh-My-OpenCode의 검증된 multi-agent 시스템     |
| **도구 활용** | 기존 MCP 서버 자동 연동 (Jira, Figma, GitHub)  |
| **비용**      | 사용자별 API 키로 비용 분산                    |
| **확장성**    | OpenCode 에이전트 생태계 활용 가능             |

### 기존 Claude API 직접 호출 vs OpenCode

| 항목         | Claude API 직접      | OpenCode 활용        |
| ------------ | -------------------- | -------------------- |
| API 키 관리  | 환경변수 공유 키     | 사용자별 관리        |
| Multi-agent  | 직접 구현 필요       | Oh-My-OpenCode 제공  |
| Tool 사용    | MCP client 직접 구현 | OpenCode가 자동 연결 |
| Session 관리 | Redis 직접 구현      | OpenCode가 관리      |
| 비용 추적    | 수동 계산 필요       | OpenCode가 자동 추적 |

---

## 🐛 문제 해결

### OpenCode 연결 실패

```bash
# OpenCode API 서버 실행 확인
curl http://localhost:3333/health

# 환경변수 확인
echo $OPENCODE_API_URL
```

### MCP Tool이 보이지 않음

```bash
# OpenCode MCP 서버 빌드
cd mcp-servers/opencode
npm run build

# OpenCode IDE 재시작
```

### 워크플로우 타임아웃

```typescript
// 타임아웃 설정 조정
const result = await opencode.waitForCompletion(
  taskId,
  5000, // pollInterval: 5초
  600000 // maxWaitTime: 10분
);
```

---

## 📚 관련 문서

- [ENV_SETUP.md](./ENV_SETUP.md) - 환경변수 설정
- [README.md](./README.md) - 프로젝트 개요
- [Oh-My-OpenCode Documentation](https://github.com/your-org/oh-my-opencode) - OpenCode 에이전트 가이드

---

## 🔮 향후 계획

- [ ] Webhook → OpenCode 자동 라우팅 구현
- [ ] OpenCode 대시보드 통합
- [ ] 사용자별 OpenCode API 키 관리 UI
- [ ] OpenCode 워크플로우 템플릿 추가
- [ ] OpenCode 에이전트 커스터마이징 지원
