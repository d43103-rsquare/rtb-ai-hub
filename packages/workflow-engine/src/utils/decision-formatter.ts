import type { DecisionCandidate, DecisionSource } from './decision-detector';

const SOURCE_LABELS: Record<string, string> = {
  github_pr: 'PR 코멘트',
  jira_comment: 'Jira 코멘트',
  slack: 'Slack',
};

export function formatDecisionNotification(
  candidate: DecisionCandidate,
  source: DecisionSource,
  _decisionId: string
): string {
  const lines: string[] = [];
  lines.push('📝 기술 결정 기록됨\n');
  lines.push(`제목: ${candidate.title}`);
  lines.push(`결정: ${candidate.decision}`);
  if (candidate.rationale) {
    lines.push(`맥락: ${candidate.rationale}`);
  }
  if (candidate.participants.length > 0) {
    lines.push(`참여자: ${candidate.participants.join(', ')}`);
  }
  if (candidate.relatedJiraKeys.length > 0) {
    lines.push(`관련: ${candidate.relatedJiraKeys.join(', ')}`);
  }
  if (candidate.tags.length > 0) {
    lines.push(`태그: ${candidate.tags.map((t) => `#${t}`).join(' ')}`);
  }
  lines.push(`출처: ${SOURCE_LABELS[source.type] || source.type} (${source.id})`);
  return lines.join('\n');
}

export function formatWeeklyDigest(
  decisions: Array<{
    title: string;
    decision: string;
    sourceType: string;
    sourceUrl: string | null;
    participants: string[] | null;
    createdAt: Date | null;
  }>
): string {
  if (decisions.length === 0) {
    return '📝 이번 주 기록된 기술 결정이 없습니다.';
  }

  const lines: string[] = [];
  const now = new Date();
  const weekNum = getWeekNumber(now);
  lines.push(
    `📝 이번 주 기술 결정 요약 — ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${weekNum}주차\n`
  );

  decisions.forEach((d, i) => {
    const createdAt = d.createdAt || new Date();
    const date = createdAt.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
    const sourceLabel = SOURCE_LABELS[d.sourceType] || d.sourceType;
    const participants = d.participants || [];
    lines.push(`${i + 1}. [${date}] ${d.title}`);
    lines.push(`   - 출처: ${sourceLabel}`);
    lines.push(
      `   - 결정: ${d.decision.length > 80 ? d.decision.substring(0, 77) + '...' : d.decision}`
    );
    if (participants.length > 0) {
      lines.push(`   - 참여: ${participants.join(', ')}`);
    }
    lines.push('');
  });

  lines.push(`총 ${decisions.length}건의 기술 결정이 기록되었습니다.`);
  return lines.join('\n');
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}
