# OpenCode Configuration

이 디렉토리에는 Docker 환경에서 사용할 OpenCode CLI 기본 설정 파일들이 포함되어 있습니다.

## 📁 파일 설명

| 파일                  | 설명                                         |
| --------------------- | -------------------------------------------- |
| `opencode.json`       | OpenCode CLI 메인 설정 (MCP 서버, 플러그인)  |
| `oh-my-opencode.json` | Oh-My-OpenCode 에이전트/카테고리별 모델 설정 |

## 🔧 설정 커스터마이징

### 1. 에이전트별 모델 변경

`oh-my-opencode.json`에서 특정 에이전트의 모델을 변경할 수 있습니다:

```json
{
  "agents": {
    "sisyphus": {
      "model": "anthropic/claude-sonnet-4-5", // 기본값: sonnet (빠름, 저렴)
      "variant": "default"
    },
    "oracle": {
      "model": "anthropic/claude-opus-4-6", // 고급 자문용: opus (느림, 비쌈)
      "variant": "max"
    }
  }
}
```

**사용 가능한 모델**:

- `anthropic/claude-opus-4-6` - 최고 품질, 가장 비쌈
- `anthropic/claude-sonnet-4-5` - 균형 잡힌 성능/비용
- `anthropic/claude-haiku-4-5` - 빠르고 저렴

**Variant 옵션**:

- `default` - 일반 모드
- `max` - Extended thinking (더 깊은 사고, 더 느림)

### 2. MCP 서버 추가

`opencode.json`에서 추가 MCP 서버를 등록할 수 있습니다:

```json
{
  "mcp": {
    "your-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "your-mcp-server@latest"]
    }
  }
}
```

### 3. 플러그인 추가

```json
{
  "plugin": [
    "opencode-antigravity-auth@latest",
    "oh-my-opencode@3.4.0",
    "your-plugin@latest" // 추가
  ]
}
```

## 🐳 Docker 사용

### docker-compose.yml 설정

```yaml
services:
  opencode-cli:
    image: opencode-ai/opencode:latest
    volumes:
      - ./infrastructure/opencode:/root/.config/opencode:ro # 읽기 전용 마운트
      - opencode-data:/root/.opencode/data # 데이터는 영구 볼륨
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - '4096:4096'
    command: ['opencode', 'serve', '--port', '4096']
```

### 설정 파일 우선순위

1. **Volume 마운트**: `./infrastructure/opencode` → `/root/.config/opencode`
2. **환경변수**: Anthropic API 키는 `.env` 또는 `docker-compose.yml`에서 주입
3. **데이터 저장**: Session, cache는 `opencode-data` 볼륨에 영구 저장

## ⚠️ 주의사항

### 민감정보 제외

이 기본 설정에서 제외된 항목들:

- ❌ 로컬 경로 (`/Users/...`)
- ❌ 프라이빗 서버 주소 (`http://100.67.60.57:...`)
- ❌ rtb-connections 같은 프로젝트 전용 MCP
- ❌ API 키 (환경변수로 주입)

### 공식 MCP 서버 연결 (중요! ✨)

**기본 설정에 이미 포함됨**: `opencode.json`에 공식/커뮤니티 MCP 서버 4개가 연결되어 있습니다.

```json
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },
    "atlassian": {
      "type": "local",
      "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.atlassian.com/v1/sse"]
    },
    "figma": {
      "type": "local",
      "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.figma.com/mcp"]
    },
    "datadog": {
      "type": "local",
      "command": ["npx", "-y", "@winor30/mcp-server-datadog"],
      "env": { "DATADOG_API_KEY": "${DATADOG_API_KEY}", "DATADOG_APP_KEY": "${DATADOG_APP_KEY}" }
    }
  }
}
```

**이렇게 하면 Oh-My-OpenCode 에이전트들이**:

- ✅ Jira 이슈를 읽고 생성할 수 있음 (`atlassian` — 공식 Atlassian MCP)
- ✅ Figma 디자인을 분석할 수 있음 (`figma` — 공식 Figma MCP)
- ✅ GitHub PR을 생성하고 리뷰할 수 있음 (`github` — 공식 GitHub MCP, 50+ 도구)
- ✅ Datadog 메트릭을 조회할 수 있음 (`datadog` — 커뮤니티 MCP, 20+ 도구)

**인증 방식**:

- GitHub, Datadog: 환경변수 (`GITHUB_TOKEN`, `DATADOG_API_KEY`)
- Atlassian, Figma: OAuth 2.0 (최초 실행 시 브라우저 인증, 이후 토큰 캐싱)

## 🔄 설정 업데이트

로컬에서 설정을 변경한 후:

```bash
# Docker 컨테이너 재시작
docker-compose restart opencode-cli

# 설정 반영 확인
docker-compose exec opencode-cli cat /root/.config/opencode/opencode.json
```

## 📚 참고 문서

- [OpenCode 공식 문서](https://opencode.ai/docs)
- [Oh-My-OpenCode GitHub](https://github.com/code-yeongyu/oh-my-opencode)
- [Anthropic 모델 가격](https://www.anthropic.com/pricing)
