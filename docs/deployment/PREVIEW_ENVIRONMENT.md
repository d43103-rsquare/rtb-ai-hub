# Preview 환경 설계

> AI가 생성한 코드를 개발자가 직접 검수하거나 E2E 테스트하기 위한 임시 실행 환경입니다.

---

## 1. 개요

rtb-ai-hub의 workflow-engine이 Jira 이슈에 대한 코드를 자동 생성하면, 개발자가 그 결과물을 **실제 서버를 띄워 확인**해야 합니다. Preview 환경은 이 검수 공간을 자동으로 생성하고 관리합니다.

### 핵심 특징

- **이슈 단위 격리**: 각 Jira 이슈는 독립적인 preview 공간을 갖습니다
- **자동 생성/삭제**: workflow-engine이 시작/종료를 자동으로 관리합니다
- **TTL 기반 정리**: 미리 설정한 시간이 지나면 자동으로 삭제됩니다
- **환경 분리**: int / stg / prd 각각 독립적으로 운영됩니다

---

## 2. Provider 추상화 (Local ↔ K8s)

로컬 개발과 프로덕션(EKS)에서 **동일한 인터페이스**를 사용하되, 내부 구현만 교체합니다.

### 2.1 아키텍처

```
환경변수: PREVIEW_PROVIDER=local | k8s
                    ↓
         PreviewProviderFactory
          /                  \
LocalPreviewProvider      K8sPreviewProvider
(개발 환경)               (EKS 프로덕션)
   │                           │
   ├── git worktree 생성        ├── Namespace 생성: preview-{issueKey}
   ├── PostgreSQL DB 생성       ├── Deployment 생성 (web + api)
   ├── 포트 슬롯 할당           ├── Service 생성
   └── 프로세스 spawn          └── Ingress 생성 (URL 발급)
          \                   /
       공통 IPreviewProvider 인터페이스
            ↓
       PreviewManager (호출자)
```

### 2.2 공통 인터페이스

```typescript
// packages/workflow-engine/src/preview/types.ts

export interface IPreviewProvider {
  start(opts: PreviewStartOpts): Promise<PreviewInstance>;
  stop(previewId: string): Promise<PreviewStopResult>;
  list(): Promise<PreviewInstance[]>;
  cleanupExpired(): Promise<PreviewCleanupResult>;
}

export type PreviewStartOpts = {
  branchName: string;
  issueKey: string;
  env: Environment;   // 'int' | 'stg' | 'prd'
};
```

### 2.3 Provider 선택 로직

```typescript
// packages/workflow-engine/src/preview/factory.ts

export function createPreviewProvider(redis: Redis): IPreviewProvider {
  const provider = getEnv('PREVIEW_PROVIDER', 'local');

  switch (provider) {
    case 'k8s':
      return new K8sPreviewProvider(redis);
    case 'local':
    default:
      return new LocalPreviewProvider(redis);
  }
}
```

---

## 3. LocalPreviewProvider (개발 환경)

현재 `preview-manager.ts`의 구현을 그대로 사용합니다.

### 동작 방식

```
start() 호출
  1. Redis에서 기존 preview 확인 (중복 방지)
  2. maxInstances 체크
  3. 포트 슬롯 할당 (webBasePort + slot * 100)
  4. PostgreSQL DB 생성 (CREATE DATABASE ... TEMPLATE)
  5. git worktree 생성 (이슈별 디렉토리)
  6. pnpm install 실행
  7. pnpm db:migrate 실행
  8. web 프로세스 spawn (포트: webPort)
  9. api 프로세스 spawn (포트: apiPort)
 10. Redis에 상태 저장 (TTL 적용)
```

### 환경변수 설정 (개발)

```bash
# .env.local
PREVIEW_PROVIDER=local
PREVIEW_ENABLED=true
PREVIEW_WEB_BASE_PORT=5100
PREVIEW_API_BASE_PORT=5200
PREVIEW_MAX_INSTANCES=5
PREVIEW_TTL_HOURS=24
PREVIEW_HOST=localhost
PREVIEW_WORKTREE_PATH=/Users/{username}/.rtb-previews
PREVIEW_TEMPLATE_DB_NAME=rtb_dev
PREVIEW_INSTALL_CMD=pnpm install --frozen-lockfile
PREVIEW_MIGRATE_CMD=pnpm db:migrate
PREVIEW_WEB_CMD=pnpm dev:web
PREVIEW_API_CMD=pnpm dev:api
```

---

## 4. K8sPreviewProvider (EKS 프로덕션)

### 4.1 동작 방식

```
start() 호출
  1. 대상 env의 EKS 클러스터에 접속 (STS AssumeRole)
  2. Namespace 생성: preview-{issueKey}
     - ResourceQuota: CPU 2 core, Memory 2Gi
     - TTL annotation: preview.rtb-ai-hub/expires-at
  3. Deployment 생성
     - web: 생성된 앱 컨테이너
     - api: 생성된 API 컨테이너
  4. Service 생성 (ClusterIP)
  5. Ingress 생성
     - URL: https://preview-{issueKey}.{env}.preview.internal
  6. Redis에 상태 저장 (기존 PreviewInstance 구조 재사용)
```

### 4.2 Kubernetes 리소스 구조

```
Namespace: preview-{issueKey}
├── ResourceQuota (CPU/Memory 제한)
├── Deployment: web
│   └── Container: {generated-app-image}
├── Deployment: api
│   └── Container: {generated-api-image}
├── Service: web-svc (ClusterIP)
├── Service: api-svc (ClusterIP)
└── Ingress: preview-ingress
    └── preview-{issueKey}.{env}.preview.internal
```

### 4.3 크로스 계정 클러스터 접속

```typescript
// env별로 다른 EKS 클러스터에 접속
async getKubeConfig(env: Environment): Promise<k8s.KubeConfig> {
  const clusterArn = getEnv(`${env.toUpperCase()}_EKS_CLUSTER_ARN`);
  const roleArn = getEnv(`${env.toUpperCase()}_EKS_ASSUME_ROLE_ARN`, '');

  // int는 자기 자신이므로 AssumeRole 불필요
  if (roleArn) {
    const creds = await stsClient.assumeRole({
      RoleArn: roleArn,
      RoleSessionName: `rtb-hub-preview-${env}`,
    });
    // 임시 자격증명으로 kubeconfig 생성
  }

  // EKS 클러스터 토큰 발급 후 kubeconfig 반환
}
```

### 4.4 환경변수 설정 (프로덕션)

```bash
# .env.production
PREVIEW_PROVIDER=k8s
PREVIEW_ENABLED=true
PREVIEW_TTL_HOURS=24
PREVIEW_MAX_INSTANCES=20

# int 클러스터 (자기 자신, AssumeRole 불필요)
INT_EKS_CLUSTER_ARN=arn:aws:eks:ap-northeast-2:111111111111:cluster/int-cluster

# stg 클러스터 (크로스 계정)
STG_EKS_CLUSTER_ARN=arn:aws:eks:ap-northeast-2:222222222222:cluster/stg-cluster
STG_EKS_ASSUME_ROLE_ARN=arn:aws:iam::222222222222:role/rtb-hub-deployer

# prd 클러스터 (크로스 계정, 엄격한 제한)
PRD_EKS_CLUSTER_ARN=arn:aws:eks:ap-northeast-2:333333333333:cluster/prd-cluster
PRD_EKS_ASSUME_ROLE_ARN=arn:aws:iam::333333333333:role/rtb-hub-deployer
```

---

## 5. 로컬에서 K8s Provider 테스트

로컬에서도 K8sPreviewProvider 코드를 테스트할 수 있습니다.

```bash
# kind로 로컬 클러스터 생성
kind create cluster --name rtb-preview

# kubeconfig 자동 설정 (~/.kube/config)
kubectl cluster-info --context kind-rtb-preview

# K8s provider로 실행
PREVIEW_PROVIDER=k8s \
INT_EKS_CLUSTER_ARN=kind-rtb-preview \
pnpm dev:workflow
```

`@kubernetes/client-node`은 `~/.kube/config`를 자동으로 읽으므로 kind 클러스터에서 동일 코드가 동작합니다.

---

## 6. Preview 생명주기

```
Jira 이슈 AI 개발 완료
       ↓
PreviewManager.start()
       ↓
   [starting]
       ↓
  환경 구성 (DB / worktree 또는 Namespace / Pod)
       ↓
   [running] ──────────────────────────────────────┐
       ↓                                           │
  URL 발급 → Jira/Slack 공유                       │
       ↓                                           │ TTL 초과 또는
  개발자 검수 / E2E 테스트                          │ 수동 종료
       ↓                                           │
PreviewManager.stop()  ◄────────────────────────────┘
       ↓
   [stopping]
       ↓
  리소스 정리 (DB drop / Namespace 삭제)
       ↓
   [removed]
```

---

## 7. prd 환경 승인 흐름

prd preview는 자동 생성이 금지되며, Slack 승인이 필요합니다.

```
workflow-engine: prd preview 요청 감지
       ↓
Slack 메시지 전송:
  "PROJ-123 prd preview 생성 요청
   요청자: {개발자}
   브랜치: hotfix/PROJ-123-critical-bug
   [승인] [거절]"
       ↓
담당자 [승인] 클릭
       ↓
K8sPreviewProvider.start() 실행
       ↓
URL 발급 → 검수 진행
```

관련 설정: `constants.ts`의 `autoDeploy: false (prd)` 참고

---

## 8. 디렉토리 구조 (구현 시)

```
packages/workflow-engine/src/preview/
├── types.ts              ← IPreviewProvider 인터페이스
├── factory.ts            ← 환경변수 기반 provider 선택
├── manager.ts            ← 기존 PreviewManager (provider 주입)
├── local-provider.ts     ← 현재 preview-manager.ts 로직 이관
└── k8s-provider.ts       ← K8s API 기반 신규 구현
```

---

## 9. 관련 문서

- [DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md) — 전체 배포 구조
- [MULTI_ACCOUNT_AWS.md](./MULTI_ACCOUNT_AWS.md) — IAM 크로스 계정 설정
- [OPERATIONS.md](./OPERATIONS.md) — 운영·모니터링·장애 처리
