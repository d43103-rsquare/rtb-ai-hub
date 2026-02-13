import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('decision-detector');

export type DecisionCandidate = {
  title: string;
  decision: string;
  rationale: string;
  participants: string[];
  relatedJiraKeys: string[];
  tags: string[];
  confidence: number;
};

export type DecisionSource = {
  type: 'github_pr' | 'jira_comment' | 'slack';
  id: string;
  url: string;
  text: string;
  author: string;
};

const DECISION_SIGNALS_KO = [
  '결정',
  '선택',
  '채택',
  '기각',
  '합의',
  '결론',
  '으로 가자',
  '로 가자',
  '으로 하자',
  '로 하자',
  '으로 정하자',
  '로 정하자',
  '대안',
  '대신에',
  '변경하기로',
  '전환하기로',
  '이유는',
  '근거는',
  '때문에',
];

const DECISION_SIGNALS_EN = [
  'decided',
  'decision',
  'agreed',
  'consensus',
  "let's go with",
  "we'll use",
  'chosen',
  'rejected',
  'approved',
  'selected',
  'rationale',
  'reason being',
  'because',
  'trade-off',
  'alternative',
];

const ALL_SIGNALS = [...DECISION_SIGNALS_KO, ...DECISION_SIGNALS_EN];

const JIRA_KEY_REGEX = /[A-Z][A-Z0-9]+-\d+/g;
const MENTION_REGEX = /@([\w-]+)/g;

export function hasDecisionSignals(text: string): boolean {
  const lower = text.toLowerCase();
  return ALL_SIGNALS.some((signal) => lower.includes(signal.toLowerCase()));
}

function countSignals(text: string): number {
  const lower = text.toLowerCase();
  return ALL_SIGNALS.filter((signal) => lower.includes(signal.toLowerCase())).length;
}

function extractJiraKeys(text: string): string[] {
  const matches = text.match(JIRA_KEY_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractParticipants(text: string, author: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  const all = [author, ...mentions];
  return [...new Set(all)];
}

function extractTitle(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) || '';
  const cleaned = firstLine.trim().replace(/^#+\s*/, '');
  if (cleaned.length > 100) {
    return cleaned.substring(0, 97) + '...';
  }
  return cleaned || 'Untitled Decision';
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();

  const tagPatterns: Record<string, string[]> = {
    auth: ['auth', 'jwt', 'session', 'token', 'login', '인증', '로그인'],
    architecture: ['architecture', 'microservice', 'monolith', '아키텍처', '설계'],
    security: ['security', 'encryption', 'ssl', 'tls', '보안', '암호화'],
    performance: ['performance', 'cache', 'redis', 'latency', '성능', '캐시'],
    database: ['database', 'db', 'sql', 'migration', 'schema', '데이터베이스', 'DB'],
    frontend: ['frontend', 'react', 'css', 'ui', 'ux', '프론트엔드'],
    backend: ['backend', 'api', 'server', 'endpoint', '백엔드'],
    infra: ['docker', 'k8s', 'kubernetes', 'deploy', 'ci/cd', '인프라', '배포'],
    testing: ['test', 'testing', 'e2e', 'unit test', '테스트'],
  };

  for (const [tag, keywords] of Object.entries(tagPatterns)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      tags.push(tag);
    }
  }

  return tags;
}

function calculateConfidence(text: string): number {
  const signalCount = countSignals(text);
  const hasJiraKeys = JIRA_KEY_REGEX.test(text);
  JIRA_KEY_REGEX.lastIndex = 0;
  const hasMentions = MENTION_REGEX.test(text);
  MENTION_REGEX.lastIndex = 0;
  const textLength = text.length;

  let confidence = 0;

  if (signalCount >= 3) confidence += 0.5;
  else if (signalCount >= 2) confidence += 0.35;
  else if (signalCount >= 1) confidence += 0.2;

  if (hasJiraKeys) confidence += 0.15;
  if (hasMentions) confidence += 0.1;
  if (textLength > 100) confidence += 0.1;
  if (textLength > 300) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

export async function detectDecision(source: DecisionSource): Promise<DecisionCandidate | null> {
  if (!hasDecisionSignals(source.text)) {
    return null;
  }

  const confidence = calculateConfidence(source.text);

  if (confidence < 0.3) {
    logger.debug({ sourceId: source.id, confidence }, 'Low confidence, skipping');
    return null;
  }

  const candidate: DecisionCandidate = {
    title: extractTitle(source.text),
    decision: source.text.length > 1000 ? source.text.substring(0, 1000) + '...' : source.text,
    rationale: '',
    participants: extractParticipants(source.text, source.author),
    relatedJiraKeys: extractJiraKeys(source.text),
    tags: extractTags(source.text),
    confidence,
  };

  logger.info(
    { sourceId: source.id, confidence, tags: candidate.tags },
    'Decision candidate detected'
  );

  return candidate;
}
