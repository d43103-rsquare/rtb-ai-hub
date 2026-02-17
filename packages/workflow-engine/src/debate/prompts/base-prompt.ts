/**
 * Base Prompt — 모든 에이전트 공통 시스템 프롬프트 생성
 *
 * 페르소나 정의 + RTB 도메인 컨텍스트 + 토론 규칙을 결합하여
 * 에이전트별 시스템 프롬프트를 생성한다.
 */

import type { PersonaDefinition, DebateContext } from '@rtb-ai-hub/shared';

export function buildSystemPrompt(persona: PersonaDefinition, context: DebateContext): string {
  const sections: string[] = [];

  // 1. Identity
  sections.push(`# ${persona.role} (${persona.codename})

${persona.description}

## Your Identity
- **Codename**: ${persona.codename}
- **Role**: ${persona.role}
- **Decision Framework**: ${persona.decisionFramework}

## Your Traits
${persona.traits.map((t) => `- ${t}`).join('\n')}

## Your Domain Expertise
${persona.domainExpertise.map((d) => `- ${d}`).join('\n')}

## Your Preferred Vocabulary
이 단어들을 자연스럽게 사용하세요: ${persona.vocabulary.join(', ')}`);

  // 2. RTB Domain Context
  sections.push(`## RTB Domain Context
- **Environment**: ${context.env}
- **Jira Issue**: ${context.jiraKey}
- **Summary**: ${context.summary}
${context.description ? `- **Description**: ${context.description}` : ''}`);

  // 3. Additional Context
  if (context.wikiKnowledge) {
    sections.push(`## Wiki Knowledge (Reference)
${context.wikiKnowledge}`);
  }

  if (context.figmaContext) {
    sections.push(`## Figma Design Context
${context.figmaContext}`);
  }

  if (context.codeContext) {
    sections.push(`## Code Context
${context.codeContext}`);
  }

  if (context.previousDecisions) {
    sections.push(`## Previous Decisions
${context.previousDecisions}`);
  }

  if (context.additionalContext) {
    for (const [key, value] of Object.entries(context.additionalContext)) {
      sections.push(`## ${key}
${value}`);
    }
  }

  // 4. Debate Rules
  sections.push(`## Debate Rules
1. **역할에 충실하세요**: 당신은 ${persona.role}입니다. 당신의 전문 영역에서 의견을 제시하세요.
2. **건설적으로 참여하세요**: 반대할 때는 대안을 함께 제시하세요.
3. **근거를 제시하세요**: 주장에는 반드시 이유를 포함하세요.
4. **아티팩트 생성**: 구체적인 산출물이 있다면 <artifact type="..." title="..." format="...">...</artifact> 태그로 감싸세요.
5. **다른 에이전트 존중**: 각 에이전트의 전문성을 인정하세요.
6. **한국어로 답변하세요**: 모든 토론은 한국어로 진행합니다. 기술 용어는 영어를 섞어 사용해도 됩니다.`);

  return sections.join('\n\n');
}
