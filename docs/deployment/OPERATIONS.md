# 운영·모니터링·장애 처리

> int 계정을 단일 운영 창구로 삼아 stg/prd 환경을 포함한 전체 시스템을 관리하는 방법을 설명합니다.

---

## 1. 운영 원칙

| 원칙 | 내용 |
|------|------|
| **단일 창구** | 모든 운영·모니터링·장애 처리는 int 계정에서 |
| **읽기 우선** | prd에 대한 직접 변경은 최소화, 관찰 우선 |
| **prd 변경 승인** | prd 리소스 조작은 팀장 Slack 승인 필요 |
| **감사 기록** | 모든 크로스 계정 액션은 CloudTrail에 기록 |

---

## 2. 모니터링 아키텍처

```
int CloudWatch (중앙 Observability)
    ├── int-EKS 메트릭/로그 (직접)
    ├── stg-EKS 메트릭/로그 (CloudWatch OAM)
    └── prd-EKS 메트릭/로그 (CloudWatch OAM, 읽기 전용)

Datadog (선택, 외부 통합)
    ├── APM: 서비스별 트레이싱
    ├── Logs: 중앙 로그 집계
    └── Alerts: PagerDuty 연동
```

### 2.1 CloudWatch OAM 설정

각 계정에서 int 계정에 데이터 공유를 허용합니다.

```bash
# stg/prd 계정에서 실행 — int 계정에 CloudWatch 데이터 공유
aws oam create-link \
  --label-template "$Account" \
  --resource-types "AWS::CloudWatch::Metric" "AWS::Logs::LogGroup" \
  --sink-identifier arn:aws:oam:ap-northeast-2:INT_ACCT_ID:sink/{sink-id}
```

int 계정 CloudWatch 콘솔에서 stg/prd 메트릭과 로그를 통합 조회할 수 있습니다.

---

## 3. 핵심 모니터링 지표

### 3.1 rtb-ai-hub 서비스 (int 계정)

| 지표 | 임계값 | 알림 |
|------|--------|------|
| webhook-listener P99 응답시간 | > 3초 | Slack #rtb-alerts |
| BullMQ 대기 잡 수 | > 50개 | Slack #rtb-alerts |
| workflow-engine 오류율 | > 5% | PagerDuty |
| AI 토큰 비용 (일간) | > $100 | Slack #rtb-costs |
| Preview 환경 활성 수 | > 15개 | Slack #rtb-alerts |

```yaml
# CloudWatch Alarm 예시 — BullMQ 대기 잡
AlarmName: rtb-hub-bullmq-queue-depth
Namespace: RTBHub/BullMQ
MetricName: WaitingJobs
Threshold: 50
ComparisonOperator: GreaterThanThreshold
EvaluationPeriods: 2
Period: 60
AlarmActions:
  - arn:aws:sns:...:rtb-hub-alerts
```

### 3.2 Preview 환경 (int/stg/prd EKS)

| 지표 | 의미 | 임계값 |
|------|------|--------|
| preview pod 기동 시간 | Fargate 콜드스타트 | > 60초 알림 |
| preview pod OOMKilled | 메모리 부족 | 즉시 알림 |
| preview 만료 전 알림 | TTL 2시간 전 | Jira/Slack으로 안내 |

### 3.3 비용 모니터링

| 항목 | 수단 |
|------|------|
| Fargate preview 비용 | AWS Cost Explorer 태그 필터링 (`env: preview`) |
| AI API 비용 | `ai_costs` 테이블 + 일간 CloudWatch 대시보드 |
| 계정별 비용 분리 | AWS Organizations Cost Allocation Tag |

---

## 4. 로깅 전략

### 4.1 로그 구조

rtb-ai-hub는 Pino (structured JSON)를 사용합니다.

```json
{
  "level": "info",
  "time": 1708300000000,
  "service": "workflow-engine",
  "env": "stg",
  "issueKey": "PROJ-123",
  "workflowType": "jira-auto-dev",
  "durationMs": 12400,
  "msg": "Workflow completed successfully"
}
```

### 4.2 로그 집계

```
각 서비스 Pod
    → Fluent Bit DaemonSet (EKS)
    → CloudWatch Logs (각 계정)
    → CloudWatch OAM (int 계정으로 집계)
    → (선택) Datadog Log Management
```

### 4.3 주요 로그 그룹

```
/rtb-ai-hub/webhook-listener
/rtb-ai-hub/workflow-engine
/rtb-ai-hub/auth-service
/rtb-ai-hub/preview/{env}     ← preview pod 로그
```

---

## 5. 장애 처리

### 5.1 단계별 대응

```
1단계: 감지
  CloudWatch Alarm → SNS → Slack #rtb-incidents / PagerDuty

2단계: 조사 (int 계정에서)
  - CloudWatch Logs Insights로 오류 검색
  - kubectl 로그 조회 (int/stg/prd 모두 가능)
  - Datadog APM 트레이스 확인

3단계: 격리
  - 문제 서비스의 replica 0으로 스케일다운
  - BullMQ 해당 큐 일시 정지

4단계: 복구
  - 직전 이미지로 롤백 (kubectl rollout undo)
  - Preview 환경 강제 정리 (cleanupExpired 수동 호출)

5단계: 사후 분석
  - CloudTrail 통해 변경 이력 확인
  - ai_costs 테이블에서 비용 이상 확인
```

### 5.2 kubectl 크로스 계정 접근

int 계정에서 stg/prd 클러스터에 접근하는 방법입니다.

```bash
# stg 클러스터 kubeconfig 추가
aws eks update-kubeconfig \
  --name stg-cluster \
  --region ap-northeast-2 \
  --role-arn arn:aws:iam::STG_ACCT_ID:role/rtb-hub-deployer \
  --alias stg

# prd 클러스터 kubeconfig 추가
aws eks update-kubeconfig \
  --name prd-cluster \
  --region ap-northeast-2 \
  --role-arn arn:aws:iam::PRD_ACCT_ID:role/rtb-hub-deployer \
  --alias prd

# 컨텍스트 전환
kubectl config use-context stg
kubectl get pods -n preview-PROJ-123

kubectl config use-context prd
kubectl get pods -n rtb-ai-hub   # 읽기만 가능
```

### 5.3 자주 발생하는 장애 패턴

#### Preview 환경이 생성되지 않는 경우

```bash
# 1. workflow-engine 로그 확인
kubectl logs -n rtb-ai-hub deploy/workflow-engine --tail=100

# 2. STS AssumeRole 실패 여부
# CloudTrail에서 "AssumeRole" 이벤트 중 errorCode 필터링

# 3. EKS 접근 권한 확인
kubectl auth can-i create namespaces --as=system:serviceaccount:rtb-ai-hub:rtb-hub-sa
```

#### BullMQ 잡이 쌓이는 경우

```bash
# Redis에서 큐 상태 확인
redis-cli -h {redis-endpoint} llen bull:{jira-queue}:wait

# 잡 실패 이력 확인 (workflow_executions 테이블)
# Dashboard → /executions 페이지에서도 확인 가능

# workflow-engine 수동 스케일업 (KEDA 우회)
kubectl scale deploy workflow-engine -n rtb-ai-hub --replicas=3
```

#### AI 비용 이상 증가

```bash
# ai_costs 테이블 조회
SELECT model, env, SUM(total_cost_usd) as total, COUNT(*) as calls
FROM ai_costs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY model, env
ORDER BY total DESC;

# 특정 workflow 타입이 과도하게 실행 중인지 확인
SELECT workflow_type, COUNT(*) as count, AVG(duration_ms) as avg_duration
FROM workflow_executions
WHERE started_at > NOW() - INTERVAL '1 hour'
GROUP BY workflow_type;
```

---

## 6. 정기 운영 작업

### 6.1 일간 체크리스트

```bash
# 1. Preview 환경 만료 정리 (자동이지만 수동 확인)
# dashboard → /previews 페이지 또는:
curl http://rtb-hub.internal/api/previews | jq '.[] | {id, env, createdAt, status}'

# 2. BullMQ 실패 잡 확인
# dashboard → /executions?status=failed

# 3. AI 비용 전일 집계
# CloudWatch 대시보드 → "AI Costs Daily" 위젯
```

### 6.2 주간 체크리스트

- [ ] 각 환경별 Fargate pod 실행 비용 확인
- [ ] KEDA 스케일링 이력 검토 (workflow-engine 유휴 시간 확인)
- [ ] CloudTrail에서 크로스 계정 AssumeRole 이력 감사
- [ ] Preview TTL 만료 실패 건 확인 (`cleanupExpired()` 오류 로그)

---

## 7. 긴급 롤백 절차

```bash
# rtb-ai-hub 서비스 직전 버전으로 롤백
kubectl rollout undo deployment/workflow-engine -n rtb-ai-hub
kubectl rollout undo deployment/webhook-listener -n rtb-ai-hub

# 특정 이미지 버전으로 롤백
kubectl set image deployment/workflow-engine \
  workflow-engine=INT_ECR/rtb-hub:{previous-tag} \
  -n rtb-ai-hub

# 롤백 상태 확인
kubectl rollout status deployment/workflow-engine -n rtb-ai-hub
```

---

## 8. 참고: 환경별 접근 권한 요약

| 작업 | int | stg | prd |
|------|-----|-----|-----|
| rtb-ai-hub 서비스 조회 | 전체 | - | - |
| rtb-ai-hub 서비스 수정 | 전체 | - | - |
| preview 네임스페이스 조회 | 가능 | 가능 (크로스계정) | 가능 (크로스계정) |
| preview 네임스페이스 생성 | 가능 | 가능 | **승인 필요** |
| preview 네임스페이스 삭제 | 가능 | 가능 | 가능 |
| stg/prd core 인프라 수정 | 불가 | 불가 | 불가 |

---

## 9. 관련 문서

- [DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md) — 전체 배포 구조
- [PREVIEW_ENVIRONMENT.md](./PREVIEW_ENVIRONMENT.md) — Preview 환경 상세 설계
- [MULTI_ACCOUNT_AWS.md](./MULTI_ACCOUNT_AWS.md) — IAM 크로스 계정 설정
