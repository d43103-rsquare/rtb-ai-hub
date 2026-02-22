# docs/plans/

이 디렉토리는 각 Jira 이슈의 워크플로우 산출물을 저장합니다.

## 구조

```
docs/plans/{JIRA-KEY}/
├── 00-brief.md      # 작업 정의 (워크플로우 시작 시 자동 생성)
├── 01-analysis.md   # Analyst 에이전트 산출물
├── 02-design.md     # Architect 에이전트 산출물 (설계 문서)
├── 03-review.md     # Reviewer 에이전트 의견
├── 04-test.md       # 테스트 결과
└── 99-memory.md     # claude-mem에 저장할 학습 내용
```

## 자동 생성

`jira-auto-dev` 워크플로우가 시작되면 `task-folder.ts`의 `createTaskFolder()`가
자동으로 `{JIRA-KEY}/00-brief.md`를 생성합니다.

이후 각 단계별 산출물은 `writeStageArtifact()`로 해당 파일에 기록됩니다.
