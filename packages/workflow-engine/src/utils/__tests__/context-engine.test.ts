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

import {
  extractJiraKey,
  getContext,
  updateContext,
  getContextByBranch,
  getContextByPr,
} from '../context-engine';
import { database } from '../../clients/database';

const mockDrizzle = database.drizzle as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockSelect = mockDrizzle.select;
const mockInsert = mockDrizzle.insert;
const mockUpdate = mockDrizzle.update;

const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();

function setupSelectChain(rows: unknown[]) {
  mockLimit.mockResolvedValue(rows);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
  mockSelect.mockReturnValue({ from: mockFrom });
}

function setupSelectAllChain(rows: unknown[]) {
  mockLimit.mockResolvedValue(rows);
  mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe('extractJiraKey', () => {
  it('extracts Jira key from branch name', () => {
    expect(extractJiraKey('feature/PROJ-123-login-page')).toBe('PROJ-123');
  });

  it('returns null for strings without Jira key', () => {
    expect(extractJiraKey('main')).toBeNull();
    expect(extractJiraKey('develop')).toBeNull();
    expect(extractJiraKey('release/1.0')).toBeNull();
  });

  it('handles multiple Jira keys (returns first)', () => {
    expect(extractJiraKey('feature/PROJ-123-related-to-PROJ-456')).toBe('PROJ-123');
  });

  it('handles keys with multi-char project prefix', () => {
    expect(extractJiraKey('bugfix/RTB-42-fix-crash')).toBe('RTB-42');
  });
});

describe('getContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no context exists', async () => {
    setupSelectChain([]);
    const result = await getContext('PROJ-999');
    expect(result).toBeNull();
  });

  it('returns context when found', async () => {
    const mockContext = { id: 'ctx_1', jiraKey: 'PROJ-123', env: 'int' };
    setupSelectChain([mockContext]);
    const result = await getContext('PROJ-123');
    expect(result).toEqual(mockContext);
  });

  it('returns null on DB error', async () => {
    mockSelect.mockImplementation(() => {
      throw new Error('DB connection failed');
    });
    const result = await getContext('PROJ-123');
    expect(result).toBeNull();
  });
});

describe('updateContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new context when none exists', async () => {
    setupSelectChain([]);
    mockValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await updateContext({
      jiraKey: 'PROJ-123',
      env: 'int',
      summary: 'Test issue',
    });

    expect(result).not.toBeNull();
    expect(result?.jiraKey).toBe('PROJ-123');
    expect(result?.env).toBe('int');
    expect(result?.summary).toBe('Test issue');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('merges updates into existing context', async () => {
    const existing = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [],
      githubPrUrls: [],
      deployments: [],
      datadogIncidentIds: [],
      teamMembers: {},
    };
    setupSelectChain([existing]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await updateContext({
      jiraKey: 'PROJ-123',
      githubBranch: 'feature/PROJ-123-login',
    });

    expect(result).not.toBeNull();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('appends to PR numbers array without duplicates', async () => {
    const existing = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [42],
      githubPrUrls: ['https://github.com/org/repo/pull/42'],
      deployments: [],
      datadogIncidentIds: [],
      teamMembers: {},
    };
    setupSelectChain([existing]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await updateContext({
      jiraKey: 'PROJ-123',
      githubPrNumber: 42,
      githubPrUrl: 'https://github.com/org/repo/pull/42',
    });

    expect(result).not.toBeNull();
    const setCall = mockSet.mock.calls[0][0];
    expect(setCall.githubPrNumbers).toEqual([42]);
    expect(setCall.githubPrUrls).toEqual(['https://github.com/org/repo/pull/42']);
  });

  it('appends new PR number to existing array', async () => {
    const existing = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [42],
      githubPrUrls: ['https://github.com/org/repo/pull/42'],
      deployments: [],
      datadogIncidentIds: [],
      teamMembers: {},
    };
    setupSelectChain([existing]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateContext({
      jiraKey: 'PROJ-123',
      githubPrNumber: 43,
      githubPrUrl: 'https://github.com/org/repo/pull/43',
    });

    const setCall = mockSet.mock.calls[0][0];
    expect(setCall.githubPrNumbers).toEqual([42, 43]);
    expect(setCall.githubPrUrls).toEqual([
      'https://github.com/org/repo/pull/42',
      'https://github.com/org/repo/pull/43',
    ]);
  });

  it('appends deployments array', async () => {
    const existing = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [],
      githubPrUrls: [],
      deployments: [{ env: 'int', timestamp: '2024-01-01', success: true }],
      datadogIncidentIds: [],
      teamMembers: {},
    };
    setupSelectChain([existing]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateContext({
      jiraKey: 'PROJ-123',
      deployment: { env: 'stg', timestamp: '2024-01-02', success: false },
    });

    const setCall = mockSet.mock.calls[0][0];
    expect(setCall.deployments).toHaveLength(2);
    expect(setCall.deployments[1]).toEqual({
      env: 'stg',
      timestamp: '2024-01-02',
      success: false,
    });
  });

  it('merges team members', async () => {
    const existing = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [],
      githubPrUrls: [],
      deployments: [],
      datadogIncidentIds: [],
      teamMembers: { developer: 'alice' },
    };
    setupSelectChain([existing]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateContext({
      jiraKey: 'PROJ-123',
      teamMembers: { reviewer: 'bob' },
    });

    const setCall = mockSet.mock.calls[0][0];
    expect(setCall.teamMembers).toEqual({ developer: 'alice', reviewer: 'bob' });
  });

  it('returns null on DB error (fire-and-forget)', async () => {
    setupSelectChain([]);
    mockInsert.mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const result = await updateContext({
      jiraKey: 'PROJ-123',
      env: 'int',
    });

    expect(result).toBeNull();
  });
});

describe('getContextByBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts Jira key from branch and queries', async () => {
    const mockContext = { id: 'ctx_1', jiraKey: 'PROJ-123', env: 'int' };
    setupSelectChain([mockContext]);

    const result = await getContextByBranch('feature/PROJ-123-login-page');
    expect(result).toEqual(mockContext);
  });

  it('returns null for branch without Jira key', async () => {
    const result = await getContextByBranch('develop');
    expect(result).toBeNull();
  });
});

describe('getContextByPr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns context matching PR number', async () => {
    const mockContext = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [42, 43],
    };
    setupSelectAllChain([mockContext]);

    const result = await getContextByPr(42);
    expect(result).toEqual(mockContext);
  });

  it('returns null when no context matches PR', async () => {
    const mockContext = {
      id: 'ctx_1',
      jiraKey: 'PROJ-123',
      env: 'int',
      githubPrNumbers: [42],
    };
    setupSelectAllChain([mockContext]);

    const result = await getContextByPr(99);
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    mockSelect.mockImplementation(() => {
      throw new Error('DB error');
    });

    const result = await getContextByPr(42);
    expect(result).toBeNull();
  });
});
