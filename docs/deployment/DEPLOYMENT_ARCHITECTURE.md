# RTB AI Hub - 배포 아키텍처

> 이 문서는 RTB AI Hub의 AWS 배포 전략과 멀티 계정 구조를 설명합니다.

---

## 1. 배포 철학

RTB AI Hub는 **int 계정을 Control Plane으로** 삼아 단일 인스턴스가 세 환경(int / stg / prd)을 모두 수용합니다.

핵심 원칙:
- **rtb-ai-hub는 int 계정에서 한 번만 실행** — 코드 배포, 운영, 장애 처리 모두 여기서
- **개발 결과물(생성된 코드)의 프리뷰 환경은 각 환경의 EKS 클러스터에서 실행**
- **prd는 자동 배포 금지** — 사람이 승인한 후에만 프리뷰 생성

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        int AWS Account                              │
│                     (Control Plane)                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  rtb-ai-hub EKS Cluster                                     │   │
│  │                                                             │   │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐    │   │
│  │  │  webhook-listener │  │  workflow-engine             │    │   │
│  │  │  (Express :4000)  │  │  (BullMQ Worker, KEDA 연동) │    │   │
│  │  └──────────────────┘  └──────────────────────────────┘    │   │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐    │   │
│  │  │  auth-service    │  │  dashboard                   │    │   │
│  │  │  (JWT :4001)     │  │  (React + Vite :3000)        │    │   │
│  │  └──────────────────┘  └──────────────────────────────┘    │   │
│  │                                                             │   │
│  │  공유 인프라: RDS PostgreSQL, ElastiCache Redis, ECR        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  IAM Role: rtb-hub-control-role (IRSA)                             │
│     ├── int-eks: 자기 계정 직접 접근                               │
│     ├── stg-eks: STS AssumeRole → STG_ACCT/rtb-hub-deployer       │
│     └── prd-eks: STS AssumeRole → PRD_ACCT/rtb-hub-deployer       │
└────────────┬──────────────────┬──────────────────┬─────────────────┘
             │ AssumeRole       │ AssumeRole        │ AssumeRole
             ▼                  ▼                   ▼
┌────────────────┐  ┌────────────────────┐  ┌─────────────────────┐
│  int-EKS       │  │  stg-EKS           │  │  prd-EKS            │
│                │  │                    │  │                     │
│  ns: preview-* │  │  ns: preview-*     │  │  ns: preview-*      │
│  (Fargate)     │  │  (Fargate)         │  │  (Fargate, 승인 후) │
│                │  │                    │  │                     │
│  - 자동 생성   │  │  - 자동 생성       │  │  - 수동 승인 필수   │
│  - TTL: 24h    │  │  - TTL: 24h        │  │  - TTL: 8h          │
└────────────────┘  └────────────────────┘  └─────────────────────┘
```

---

## 3. rtb-ai-hub 서비스 배포

### 3.1 ECS Fargate vs EKS

rtb-ai-hub 자체 서비스들은 **int-EKS 클러스터 내 전용 네임스페이스**에서 실행합니다.

| 서비스 | 배포 방식 | 오토스케일 | 비고 |
|--------|-----------|-----------|------|
| webhook-listener | EKS Deployment | HPA (요청 수 기반) | 항시 최소 1 replica |
| workflow-engine | EKS Deployment | **KEDA** (BullMQ 큐 깊이 기반) | 큐 비었을 때 0으로 스케일다운 |
| auth-service | EKS Deployment | HPA | 항시 최소 1 replica |
| dashboard | EKS Deployment | HPA | 항시 최소 1 replica |

### 3.2 KEDA 스케일 설정 (workflow-engine)

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: workflow-engine-scaler
  namespace: rtb-ai-hub
spec:
  scaleTargetRef:
    name: workflow-engine
  minReplicaCount: 0        # 큐가 비었을 때 0으로
  maxReplicaCount: 5
  cooldownPeriod: 300       # 300초 후 스케일다운
  triggers:
    - type: redis
      metadata:
        address: redis-cluster.rtb-ai-hub.svc:6379
        listName: bull:{figma-queue}:wait
        listLength: "1"
    - type: redis
      metadata:
        address: redis-cluster.rtb-ai-hub.svc:6379
        listName: bull:{jira-queue}:wait
        listLength: "1"
```

### 3.3 컨테이너 이미지

두 개의 Dockerfile이 존재합니다:

| 이미지 | Dockerfile | 포함 서비스 | ECR 리포지토리 |
|--------|-----------|------------|---------------|
| `rtb-hub` | `Dockerfile.hub` | webhook-listener + workflow-engine + dashboard | `int-ecr/rtb-hub` |
| `rtb-auth` | `Dockerfile.auth` | auth-service | `int-ecr/rtb-auth` |

---

## 4. Preview 환경 배포

AI가 생성한 코드를 개발자가 검수하거나 E2E 테스트하기 위한 **임시 환경**입니다.

### 4.1 흐름

```
Jira 이슈 AI 개발 완료
    → workflow-engine: PreviewManager.start() 호출
    → K8sPreviewProvider: 대상 env의 EKS 클러스터에 접속
    → Namespace 생성: preview-{issueKey}
    → Fargate Profile이 pod를 serverless로 스케줄링
    → Ingress 생성 → preview URL 발급
    → Jira/Slack으로 URL 공유
    → 검수 완료 or TTL 만료 → Namespace 삭제
```

### 4.2 Fargate Profile 설정

```yaml
# 각 계정의 EKS 클러스터에 적용
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
fargateProfiles:
  - name: preview-profile
    selectors:
      - namespace: preview-*   # preview-* 네임스페이스는 모두 Fargate
```

Fargate를 사용하면 preview pod에 대한 **EC2 노드 비용이 발생하지 않으며**, pod 실행 시간만 과금됩니다.

### 4.3 환경별 정책

| 환경 | 자동 생성 | 승인 | TTL | 비고 |
|------|-----------|------|-----|------|
| int | 자동 | 불필요 | 24h | 개발 중 자유롭게 |
| stg | 자동 | 불필요 | 24h | RC 브랜치 검수 |
| prd | **수동** | Slack 승인 | 8h | 핫픽스 검수 전용 |

---

## 5. CI/CD 파이프라인

```
GitHub Push / PR
    ↓
GitHub Actions: ci.yml
    ├── Lint + TypeCheck + Test + Build
    └── (main 브랜치) → Docker 이미지 빌드 → ECR 푸시
                       → EKS Rolling Update (kubectl set image)
```

### 5.1 GitHub Actions 시크릿 설정

```yaml
# .github/workflows/deploy.yml 에서 사용
env:
  AWS_REGION: ap-northeast-2
  ECR_REGISTRY: ${{ secrets.INT_ECR_REGISTRY }}
  EKS_CLUSTER: ${{ secrets.INT_EKS_CLUSTER_NAME }}
  ROLE_ARN: ${{ secrets.INT_DEPLOY_ROLE_ARN }}
```

---

## 6. 네트워크 구성

```
인터넷
  ↓
ALB (int 계정)
  ├── /              → dashboard:3000
  ├── /api/auth/*    → auth-service:4001
  ├── /api/webhook/* → webhook-listener:4000
  └── /preview/*     → preview 서비스 (env별 cluster)

각 EKS 클러스터 내부:
  ├── rtb-ai-hub namespace  (rtb-ai-hub 서비스)
  └── preview-* namespace   (Fargate, 임시 환경)
```

---

## 7. 비용 최적화 요약

| 항목 | 전략 | 절감 효과 |
|------|------|---------|
| workflow-engine | KEDA scale-to-zero | 유휴 시 $0 |
| Preview 환경 | Fargate (pod 실행 시간만 과금) | 고정 노드 비용 없음 |
| Preview 노드 | Spot 인스턴스 (Karpenter) | On-demand 대비 60~80% 절감 |
| 미사용 Preview | TTL 자동 만료 + cleanupExpired() | 방치 방지 |

---

## 8. 관련 문서

- [PREVIEW_ENVIRONMENT.md](./PREVIEW_ENVIRONMENT.md) — Preview 환경 상세 설계
- [MULTI_ACCOUNT_AWS.md](./MULTI_ACCOUNT_AWS.md) — IAM 크로스 계정 설정
- [OPERATIONS.md](./OPERATIONS.md) — 운영·모니터링·장애 처리
