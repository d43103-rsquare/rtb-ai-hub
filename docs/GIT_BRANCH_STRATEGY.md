# Git 브랜치 전략

## 개요

Jira 티켓 기반으로 작업하며, int(개발) → stg(검증) → prd(운영) 환경에 맞춰 브랜치를 관리합니다.

## 브랜치 구조

```
main (prd)
  │
  ├── release/* (stg)
  │
  └── develop (int)
        │
        ├── feature/*
        ├── bugfix/*
        └── hotfix/*
```

## 브랜치별 역할

| 브랜치      | 배포 환경  | 설명                                             |
| ----------- | ---------- | ------------------------------------------------ |
| `main`      | prd (운영) | 운영에 배포된 코드. 항상 안정 상태 유지          |
| `release/*` | stg (검증) | QA/검증 진행. 검증 완료 후 main에 병합           |
| `develop`   | int (개발) | 개발 통합 브랜치. feature 브랜치가 병합되는 지점 |
| `feature/*` | -          | 신규 기능 개발                                   |
| `bugfix/*`  | -          | 버그 수정 (개발/검증 단계)                       |
| `hotfix/*`  | -          | 운영 긴급 수정                                   |

## 브랜치 네이밍 규칙

**형식**: `{타입}/{Jira티켓번호}-{간단한-설명}`

| 타입    | 예시                               | 용도           |
| ------- | ---------------------------------- | -------------- |
| feature | `feature/PROJ-123_로그인-기능`     | 신규 기능 개발 |
| bugfix  | `bugfix/PROJ-456_로그인-오류-수정` | 버그 수정      |
| hotfix  | `hotfix/PROJ-789_긴급수정`         | 운영 긴급 수정 |
| release | `release/v1.2.0`                   | 검증 배포      |

## 워크플로우

### 1. 기능 개발 (int)

```
develop → feature/PROJ-123-기능 → PR → 코드 리뷰 → develop 병합 → int 배포
```

1. develop에서 feature 브랜치 생성
2. 기능 개발 및 커밋
3. PR 생성 → 코드 리뷰 완료 후 develop에 병합
4. int 환경에서 테스트

### 2. 검증 배포 (stg)

```
develop → release/v1.2.0 → stg 배포 → QA
```

1. 배포할 기능이 develop에 모두 병합된 상태 확인
2. develop에서 release 브랜치 생성
3. stg 환경에 자동 배포
4. QA 진행
5. 버그 발견 시 release 브랜치에서 직접 수정

### 3. 운영 배포 (prd)

```
release/v1.2.0 → main → prd 배포 → tag 생성
```

1. QA 완료 후 release 브랜치를 main에 병합
2. prd 환경에 배포
3. 버전 tag 생성 (v1.2.0)
4. release 브랜치의 변경사항을 develop에 역병합
5. release 브랜치 삭제

### 4. 긴급 수정 (hotfix)

```
main → hotfix/PROJ-789-긴급수정 → main & develop
```

1. main에서 hotfix 브랜치 생성
2. 수정 완료 후 main에 병합 → prd 배포
3. develop에도 병합하여 동기화
4. hotfix 브랜치 삭제

## 플로우 다이어그램

```
feature/A ──┐
feature/B ──┼──▶ develop (int) ──▶ release/v1.0 (stg) ──▶ main (prd)
feature/C ──┘                              │                    │
                                           └── bugfix ◀─────────┘
                                                                │
                                           hotfix ◀─────────────┘
```

## 주요 규칙

### 해야 할 것

- main, develop 브랜치는 항상 빌드 성공 상태 유지
- PR 생성 시 최소 1명 이상 코드 리뷰 필수
- 브랜치명에 Jira 티켓 번호 포함
- 커밋 메시지에 Jira 티켓 번호 포함
- release 브랜치 병합 후 tag 생성

### 하지 말아야 할 것

- main, develop에 직접 커밋 금지
- 리뷰 없이 PR 병합 금지
- release 브랜치에 신규 기능 추가 금지 (버그 수정만)

## 커밋 메시지 규칙

**형식**: `[PROJ-123] 커밋 내용`

```
[PROJ-123] 로그인 API 연동
[PROJ-456] 비밀번호 유효성 검사 오류 수정
[PROJ-789] 결제 모듈 타임아웃 긴급 수정
```

## 환경별 배포 트리거

| 브랜치      | 환경 | 배포 방식                        |
| ----------- | ---- | -------------------------------- |
| `develop`   | int  | push 시 자동 배포                |
| `release/*` | stg  | push 시 자동 배포                |
| `main`      | prd  | 병합 시 자동 배포 또는 수동 승인 |

## FAQ

**Q. feature 브랜치는 얼마나 유지하나요?**
A. develop 병합 후 삭제합니다.

**Q. release 브랜치에서 버그를 수정하면 develop에도 반영해야 하나요?**
A. 네, main 병합 후 develop에 역병합하여 동기화합니다.

**Q. 동시에 여러 release 브랜치를 운영할 수 있나요?**
A. 가능하지만, 혼란 방지를 위해 하나의 release만 운영하는 것을 권장합니다.

**Q. hotfix는 stg 검증 없이 바로 prd에 배포하나요?**
A. 긴급도에 따라 결정합니다. 가능하면 stg에서 빠르게 검증 후 배포합니다.
