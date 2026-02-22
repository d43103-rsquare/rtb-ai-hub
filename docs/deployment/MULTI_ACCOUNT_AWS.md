# 멀티 계정 AWS 설정

> int / stg / prd 3개 AWS 계정에 대한 IAM 역할, EKS 접근, 크로스 계정 신뢰 관계 설정 가이드입니다.

---

## 1. 계정 구조

| 계정 | 역할 | 주요 리소스 |
|------|------|-----------|
| **int** (Control Plane) | rtb-ai-hub 실행, 배포 제어 | EKS, RDS, ElastiCache, ECR |
| **stg** | stg 환경 워크로드 | EKS (preview-* namespace) |
| **prd** | prd 환경 워크로드 | EKS (preview-* namespace, 제한적) |

rtb-ai-hub는 **int 계정에서만 실행**되며, stg/prd의 EKS 클러스터에 크로스 계정으로 접근합니다.

---

## 2. IAM 역할 설계

### 2.1 int 계정: rtb-hub-control-role

rtb-ai-hub Pod에 부여하는 역할입니다. **IRSA (IAM Roles for Service Accounts)** 로 k8s Service Account와 연결됩니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sts:AssumeRole"],
      "Resource": [
        "arn:aws:iam::STG_ACCT_ID:role/rtb-hub-deployer",
        "arn:aws:iam::PRD_ACCT_ID:role/rtb-hub-deployer"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    }
  ]
}
```

**신뢰 정책 (Trust Policy)**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::INT_ACCT_ID:oidc-provider/oidc.eks.ap-northeast-2.amazonaws.com/id/{OIDC_ID}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.ap-northeast-2.amazonaws.com/id/{OIDC_ID}:sub":
            "system:serviceaccount:rtb-ai-hub:rtb-hub-sa"
        }
      }
    }
  ]
}
```

### 2.2 stg/prd 계정: rtb-hub-deployer

int 계정의 rtb-hub-control-role이 AssumeRole 하는 대상입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:AccessKubernetesApi"
      ],
      "Resource": "arn:aws:eks:ap-northeast-2:{ACCOUNT_ID}:cluster/*"
    }
  ]
}
```

**신뢰 정책 (int 계정의 역할만 허용)**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::INT_ACCT_ID:role/rtb-hub-control-role"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

## 3. EKS RBAC 설정

IAM 역할이 EKS 내에서 어떤 k8s 권한을 갖는지 설정합니다.

### 3.1 stg/prd 클러스터 aws-auth ConfigMap

```yaml
# kubectl edit configmap aws-auth -n kube-system (stg/prd 클러스터)
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: arn:aws:iam::{STG_OR_PRD_ACCT_ID}:role/rtb-hub-deployer
      username: rtb-hub-deployer
      groups:
        - rtb-hub-preview-managers   # 아래 ClusterRole 바인딩
```

### 3.2 ClusterRole — preview-* 네임스페이스만 허용

```yaml
# preview-manager-role.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: rtb-hub-preview-manager
rules:
  # Namespace 생성/삭제 (preview-* 만)
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["create", "delete", "get", "list"]
  # Pod, Service, Deployment 관리 (네임스페이스 내)
  - apiGroups: ["", "apps"]
    resources: ["pods", "services", "deployments", "replicasets"]
    verbs: ["create", "delete", "get", "list", "watch", "patch"]
  # Ingress 관리
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["create", "delete", "get", "list", "patch"]
  # ResourceQuota 설정
  - apiGroups: [""]
    resources: ["resourcequotas"]
    verbs: ["create", "get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: rtb-hub-preview-manager-binding
subjects:
  - kind: Group
    name: rtb-hub-preview-managers
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: rtb-hub-preview-manager
  apiGroup: rbac.authorization.k8s.io
```

> **주의**: ClusterRole이지만 실제 리소스 접근은 preview-* 네임스페이스로만 제한합니다. K8sPreviewProvider 코드에서 네임스페이스 이름을 항상 `preview-{issueKey}` 형식으로 강제합니다.

---

## 4. IRSA 설정 (int 계정 EKS)

rtb-ai-hub Pod에 IAM 역할을 부여하는 방법입니다.

```yaml
# rtb-ai-hub ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: rtb-hub-sa
  namespace: rtb-ai-hub
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::INT_ACCT_ID:role/rtb-hub-control-role
```

```yaml
# workflow-engine Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-engine
  namespace: rtb-ai-hub
spec:
  template:
    spec:
      serviceAccountName: rtb-hub-sa   # IRSA 적용
      containers:
        - name: workflow-engine
          image: INT_ECR/rtb-hub:latest
```

---

## 5. 환경변수 구성

```bash
# ==============================================
# 외부 서비스 토큰 (env별 fallback 패턴 적용)
# int: 토큰 직접 사용 / stg: STG_* 우선 / prd: PRD_* 우선
# ==============================================

# int 환경 (기본값으로 동작)
JIRA_API_TOKEN=int_jira_token
GITHUB_TOKEN=int_github_token
FIGMA_ACCESS_TOKEN=int_figma_token

# stg 환경 전용 (STG_* 접두사)
STG_JIRA_API_TOKEN=stg_jira_token
STG_GITHUB_TOKEN=stg_github_token

# prd 환경 전용 (PRD_* 접두사)
PRD_JIRA_API_TOKEN=prd_jira_token
PRD_GITHUB_TOKEN=prd_github_token

# ==============================================
# EKS 크로스 계정 설정
# ==============================================

# int: 자기 자신이므로 AssumeRole 불필요
INT_EKS_CLUSTER_ARN=arn:aws:eks:ap-northeast-2:111111111111:cluster/int-cluster

# stg: 크로스 계정 AssumeRole
STG_EKS_CLUSTER_ARN=arn:aws:eks:ap-northeast-2:222222222222:cluster/stg-cluster
STG_EKS_ASSUME_ROLE_ARN=arn:aws:iam::222222222222:role/rtb-hub-deployer

# prd: 크로스 계정 AssumeRole (엄격한 제한)
PRD_EKS_CLUSTER_ARN=arn:aws:eks:ap-northeast-2:333333333333:cluster/prd-cluster
PRD_EKS_ASSUME_ROLE_ARN=arn:aws:iam::333333333333:role/rtb-hub-deployer

# ==============================================
# Preview 설정
# ==============================================
PREVIEW_PROVIDER=k8s
PREVIEW_ENABLED=true
PREVIEW_TTL_HOURS=24
PRD_PREVIEW_TTL_HOURS=8       # prd는 더 짧게
PREVIEW_MAX_INSTANCES=20
PRD_PREVIEW_MAX_INSTANCES=5   # prd는 더 적게
```

---

## 6. Fargate Profile 설정 (각 계정 EKS)

stg/prd 클러스터에서 `preview-*` 네임스페이스를 Fargate로 실행합니다.

```bash
# eksctl로 Fargate Profile 생성 (각 계정에서 실행)
eksctl create fargateprofile \
  --cluster {stg-or-prd-cluster-name} \
  --name preview-fargate-profile \
  --namespace "preview-*" \
  --region ap-northeast-2
```

또는 eksctl config 파일:

```yaml
fargateProfiles:
  - name: preview-fargate-profile
    selectors:
      - namespace: preview-*
    # Fargate는 별도 노드 그룹이 필요 없음 — AWS가 자동 관리
```

---

## 7. CloudTrail 감사 로그

모든 크로스 계정 AssumeRole 호출은 CloudTrail에 기록됩니다.

```
int 계정 CloudTrail:
  - rtb-hub-control-role의 AssumeRole 호출
  - 언제, 어떤 역할로 assume 했는지

stg/prd 계정 CloudTrail:
  - rtb-hub-deployer를 통한 EKS API 호출
  - Namespace 생성/삭제 이력
```

prd 계정의 CloudTrail은 **int 계정의 중앙 S3 버킷으로 집계**하여 단일 창구에서 감사 가능합니다.

---

## 8. 설정 체크리스트

### int 계정

- [ ] EKS 클러스터 생성
- [ ] OIDC Provider 활성화 (`eksctl utils associate-iam-oidc-provider`)
- [ ] `rtb-hub-control-role` IAM 역할 생성 (IRSA 신뢰 정책 포함)
- [ ] `rtb-hub-sa` ServiceAccount 생성 (IRSA 어노테이션 포함)
- [ ] ECR 리포지토리 생성 (`rtb-hub`, `rtb-auth`)
- [ ] RDS PostgreSQL 생성
- [ ] ElastiCache Redis 생성

### stg 계정

- [ ] EKS 클러스터 생성
- [ ] `rtb-hub-deployer` IAM 역할 생성 (int 계정 신뢰 정책)
- [ ] aws-auth ConfigMap 업데이트 (rtb-hub-deployer 그룹 추가)
- [ ] ClusterRole + ClusterRoleBinding 적용
- [ ] Fargate Profile 생성 (`preview-*` 네임스페이스)
- [ ] CloudTrail → int 계정 S3 전송 설정

### prd 계정

- [ ] stg 계정과 동일 (단, permission boundary 더 엄격하게)
- [ ] prd preview 승인 Slack 연동 설정
- [ ] ResourceQuota 기본값 더 낮게 설정

---

## 9. 관련 문서

- [DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md) — 전체 배포 구조
- [PREVIEW_ENVIRONMENT.md](./PREVIEW_ENVIRONMENT.md) — Preview 환경 상세 설계
- [OPERATIONS.md](./OPERATIONS.md) — 운영·모니터링·장애 처리
