import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients/database', () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  return {
    database: {
      drizzle: {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
      },
    },
  };
});

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<typeof import('@rtb-ai-hub/shared')>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

import { hasDecisionSignals, detectDecision } from '../decision-detector';
import type { DecisionSource } from '../decision-detector';
import { formatDecisionNotification, formatWeeklyDigest } from '../decision-formatter';
import { saveDecision, findRelatedDecisions, supersedeDecision } from '../decision-store';
import { database } from '../../clients/database';
import { FEATURE_FLAGS, loadDecisionJournalConfig } from '@rtb-ai-hub/shared';

const mockDrizzle = database.drizzle as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockSelect = mockDrizzle.select;
const mockInsert = mockDrizzle.insert;
const mockUpdate = mockDrizzle.update;

function makeSource(overrides: Partial<DecisionSource> = {}): DecisionSource {
  return {
    type: 'github_pr',
    id: 'PR#42',
    url: 'https://github.com/org/repo/pull/42',
    text: '',
    author: 'dev-user',
    ...overrides,
  };
}

describe('hasDecisionSignals', () => {
  it('detects Korean decision keywords', () => {
    expect(hasDecisionSignals('JWT 인증을 유지하기로 결정했습니다')).toBe(true);
    expect(hasDecisionSignals('Redis으로 가자')).toBe(true);
    expect(hasDecisionSignals('Session 방식은 기각합니다')).toBe(true);
    expect(hasDecisionSignals('팀 합의로 채택되었습니다')).toBe(true);
  });

  it('detects English decision keywords', () => {
    expect(hasDecisionSignals('We decided to use JWT')).toBe(true);
    expect(hasDecisionSignals("Let's go with Redis")).toBe(true);
    expect(hasDecisionSignals('The proposal was rejected')).toBe(true);
    expect(hasDecisionSignals('Team reached consensus on the approach')).toBe(true);
    expect(hasDecisionSignals('The rationale for this change is performance')).toBe(true);
  });

  it('returns false for regular text without decision signals', () => {
    expect(hasDecisionSignals('Fixed a typo in the README')).toBe(false);
    expect(hasDecisionSignals('Updated the package version')).toBe(false);
    expect(hasDecisionSignals('코드 리뷰 부탁드립니다')).toBe(false);
    expect(hasDecisionSignals('LGTM')).toBe(false);
  });

  it('is case-insensitive for English signals', () => {
    expect(hasDecisionSignals('DECIDED to use PostgreSQL')).toBe(true);
    expect(hasDecisionSignals('We AGREED on the approach')).toBe(true);
  });
});

describe('detectDecision', () => {
  it('returns candidate when decision signals are present', async () => {
    const source = makeSource({
      text: 'JWT 인증을 유지하기로 결정했습니다. 마이크로서비스 확장 대비가 이유는 중요합니다. @senior-dev @architect PROJ-098 관련 auth 모듈 리팩토링',
    });

    const result = await detectDecision(source);

    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
    expect(result!.decision).toBeTruthy();
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it('returns null when no decision signals are present', async () => {
    const source = makeSource({
      text: 'Fixed a typo in the README file',
    });

    const result = await detectDecision(source);
    expect(result).toBeNull();
  });

  it('extracts Jira keys from text', async () => {
    const source = makeSource({
      text: '결정: PROJ-123과 PROJ-456 관련하여 JWT를 유지하기로 합의했습니다. 이유는 확장성입니다.',
    });

    const result = await detectDecision(source);

    expect(result).not.toBeNull();
    expect(result!.relatedJiraKeys).toContain('PROJ-123');
    expect(result!.relatedJiraKeys).toContain('PROJ-456');
  });

  it('extracts @mentions as participants', async () => {
    const source = makeSource({
      text: '결정: @alice와 @bob이 합의하여 Redis 캐시 전략을 변경하기로 했습니다. 이유는 성능입니다.',
      author: 'charlie',
    });

    const result = await detectDecision(source);

    expect(result).not.toBeNull();
    expect(result!.participants).toContain('charlie');
    expect(result!.participants).toContain('alice');
    expect(result!.participants).toContain('bob');
  });

  it('includes author in participants even without @mentions', async () => {
    const source = makeSource({
      text: '결정: JWT 인증을 유지하기로 합의했습니다. 이유는 확장성입니다.',
      author: 'dev-user',
    });

    const result = await detectDecision(source);

    expect(result).not.toBeNull();
    expect(result!.participants).toContain('dev-user');
  });

  it('extracts tags based on content keywords', async () => {
    const source = makeSource({
      text: '결정: JWT auth 토큰 갱신 주기를 변경하기로 합의했습니다. security 관련 이유는 보안 감사 권고입니다.',
    });

    const result = await detectDecision(source);

    expect(result).not.toBeNull();
    expect(result!.tags).toContain('auth');
    expect(result!.tags).toContain('security');
  });

  it('truncates long decision text', async () => {
    const longText = '결정: ' + 'A'.repeat(1500) + ' 이유는 성능입니다.';
    const source = makeSource({ text: longText });

    const result = await detectDecision(source);

    expect(result).not.toBeNull();
    expect(result!.decision.length).toBeLessThanOrEqual(1003);
  });

  it('returns null for low confidence signals', async () => {
    const source = makeSource({
      text: 'because',
    });

    const result = await detectDecision(source);
    expect(result).toBeNull();
  });
});

describe('formatDecisionNotification', () => {
  it('formats notification with all fields present', () => {
    const candidate = {
      title: 'JWT 유지 결정',
      decision: 'JWT 기반 인증을 유지합니다',
      rationale: '마이크로서비스 확장 대비',
      participants: ['@senior-dev', '@architect'],
      relatedJiraKeys: ['PROJ-098'],
      tags: ['auth', 'architecture'],
      confidence: 0.85,
    };
    const source = makeSource();

    const result = formatDecisionNotification(candidate, source, 'dec-123');

    expect(result).toContain('📝 기술 결정 기록됨');
    expect(result).toContain('제목: JWT 유지 결정');
    expect(result).toContain('결정: JWT 기반 인증을 유지합니다');
    expect(result).toContain('맥락: 마이크로서비스 확장 대비');
    expect(result).toContain('@senior-dev');
    expect(result).toContain('PROJ-098');
    expect(result).toContain('#auth');
    expect(result).toContain('#architecture');
    expect(result).toContain('PR 코멘트');
  });

  it('formats notification with optional fields missing', () => {
    const candidate = {
      title: 'Simple Decision',
      decision: 'Use approach A',
      rationale: '',
      participants: [],
      relatedJiraKeys: [],
      tags: [],
      confidence: 0.7,
    };
    const source = makeSource({ type: 'jira_comment', id: 'PROJ-100' });

    const result = formatDecisionNotification(candidate, source, 'dec-456');

    expect(result).toContain('📝 기술 결정 기록됨');
    expect(result).toContain('제목: Simple Decision');
    expect(result).toContain('결정: Use approach A');
    expect(result).not.toContain('맥락:');
    expect(result).not.toContain('참여자:');
    expect(result).not.toContain('관련:');
    expect(result).not.toContain('태그:');
    expect(result).toContain('Jira 코멘트');
  });
});

describe('formatWeeklyDigest', () => {
  it('formats multiple decisions', () => {
    const decisions = [
      {
        title: '토스페이먼츠 선정',
        decision: 'PG 연동에 토스페이먼츠를 사용합니다',
        sourceType: 'github_pr',
        sourceUrl: 'https://github.com/org/repo/pull/52',
        participants: ['@pm', '@backend-dev'],
        createdAt: new Date('2026-02-10'),
      },
      {
        title: 'Redis TTL 변경',
        decision: 'TTL을 24h에서 12h로 변경합니다',
        sourceType: 'jira_comment',
        sourceUrl: 'https://jira.example.com/browse/PROJ-145',
        participants: ['@senior-dev'],
        createdAt: new Date('2026-02-11'),
      },
    ];

    const result = formatWeeklyDigest(decisions);

    expect(result).toContain('📝 이번 주 기술 결정 요약');
    expect(result).toContain('토스페이먼츠 선정');
    expect(result).toContain('Redis TTL 변경');
    expect(result).toContain('PR 코멘트');
    expect(result).toContain('Jira 코멘트');
    expect(result).toContain('총 2건의 기술 결정이 기록되었습니다.');
  });

  it('returns empty message when no decisions', () => {
    const result = formatWeeklyDigest([]);
    expect(result).toBe('📝 이번 주 기록된 기술 결정이 없습니다.');
  });

  it('handles decisions with null optional fields', () => {
    const decisions = [
      {
        title: 'Test Decision',
        decision: 'Test',
        sourceType: 'slack',
        sourceUrl: null,
        participants: null,
        createdAt: null,
      },
    ];

    const result = formatWeeklyDigest(decisions);

    expect(result).toContain('Test Decision');
    expect(result).toContain('Slack');
    expect(result).toContain('총 1건');
  });
});

describe('saveDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts decision and returns id', async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: 'uuid-123' }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });

    const candidate = {
      title: 'Test Decision',
      decision: 'Use approach A',
      rationale: 'Better performance',
      participants: ['dev-user'],
      relatedJiraKeys: ['PROJ-123'],
      tags: ['performance'],
      confidence: 0.85,
    };
    const source = makeSource();

    const id = await saveDecision(candidate, source, 'int');

    expect(id).toBe('uuid-123');
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Decision',
        decision: 'Use approach A',
        sourceType: 'github_pr',
        sourceId: 'PR#42',
        env: 'int',
      })
    );
  });

  it('throws on DB error', async () => {
    mockInsert.mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const candidate = {
      title: 'Test',
      decision: 'Test',
      rationale: '',
      participants: [],
      relatedJiraKeys: [],
      tags: [],
      confidence: 0.7,
    };

    await expect(saveDecision(candidate, makeSource(), 'int')).rejects.toThrow(
      'DB connection failed'
    );
  });
});

describe('findRelatedDecisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty tags', async () => {
    const result = await findRelatedDecisions([]);
    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('queries with tag overlap', async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: 'dec-1', title: 'Related' }]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await findRelatedDecisions(['auth', 'security']);

    expect(result).toHaveLength(1);
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe('supersedeDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates old decision status', async () => {
    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await supersedeDecision('old-id', 'new-id');

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'superseded',
        supersededBy: 'new-id',
      })
    );
  });
});

describe('config', () => {
  it('loads default config values', () => {
    const config = loadDecisionJournalConfig();
    expect(config.confidenceThreshold).toBe(0.7);
    expect(config.weeklyDigestDay).toBe(1);
  });

  it('feature flag defaults to false', () => {
    expect(FEATURE_FLAGS.DECISION_JOURNAL_ENABLED).toBe(false);
  });
});

describe('confidence threshold filtering', () => {
  it('filters out low-confidence candidates', async () => {
    const source = makeSource({
      text: 'because of this change',
    });

    const result = await detectDecision(source);
    expect(result).toBeNull();
  });

  it('accepts high-confidence candidates', async () => {
    const source = makeSource({
      text: '결정: JWT 인증을 유지하기로 합의했습니다. 이유는 마이크로서비스 확장 대비입니다. 대안으로 Session 방식이 있었으나 기각했습니다. @architect PROJ-098',
    });

    const result = await detectDecision(source);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.3);
  });
});
