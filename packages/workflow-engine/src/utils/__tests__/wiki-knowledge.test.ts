import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

vi.mock('@rtb-ai-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rtb-ai-hub/shared')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

// Use the real rtb-wiki directory for integration testing
const WIKI_PATH = join(__dirname, '..', '..', '..', '..', '..', '..', 'rtb-wiki');

describe('WikiKnowledge', () => {
  let WikiKnowledge: typeof import('../wiki-knowledge').WikiKnowledge;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../wiki-knowledge');
    WikiKnowledge = mod.WikiKnowledge;
  });

  describe('with real wiki', () => {
    it('builds index from rtb-wiki directory', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const index = await wiki.buildIndex();

      // Should find tables
      expect(index.tables.size).toBeGreaterThan(0);
      // Should find domains
      expect(index.domains.size).toBeGreaterThan(0);
      // Should find base context
      expect(index.baseContextPath).not.toBeNull();
    });

    it('indexes known tables', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const index = await wiki.buildIndex();

      // These tables are known to exist in the wiki
      expect(index.tables.has('obj_bld_mst')).toBe(true);
      expect(index.tables.has('gtd_task_mst')).toBe(true);
    });

    it('indexes domain overviews', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const index = await wiki.buildIndex();

      expect(index.domains.has('obj')).toBe(true);
      expect(index.domains.has('prd')).toBe(true);
      expect(index.domains.has('gokr')).toBe(true);
    });

    it('loads base context (RTB_CONTEXT.md)', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const base = await wiki.getBaseContext();

      expect(base.length).toBeGreaterThan(0);
      expect(base).toContain('RTB');
    });

    it('loads a specific table document', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const doc = await wiki.getTableDoc('obj_bld_mst');

      expect(doc).not.toBeNull();
      expect(doc).toContain('bld_id');
    });

    it('loads a domain overview', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const overview = await wiki.getDomainOverview('obj');

      expect(overview).not.toBeNull();
      expect(overview!.length).toBeGreaterThan(0);
    });

    it('searchForContext returns relevant knowledge for table references', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const result = await wiki.searchForContext(
        '빌딩 매물 목록 조회 API 성능 개선 — obj_bld_mst와 prd_pdm_mst 조인'
      );

      expect(result.length).toBeGreaterThan(0);
      // Should include base context
      expect(result).toContain('RTB');
      // Should include matched table doc
      expect(result).toContain('obj_bld_mst');
    });

    it('searchForContext returns relevant knowledge for Korean keywords', async () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const result = await wiki.searchForContext('딜 관리 기능 개선');

      expect(result.length).toBeGreaterThan(0);
      // Should detect gtd domain from "딜" keyword
      expect(result).toContain('RTB');
    });

    it('returns empty string when wiki path is invalid', async () => {
      const wiki = new WikiKnowledge('/nonexistent/path');
      const result = await wiki.searchForContext('anything');

      expect(result).toBe('');
    });
  });

  describe('extractTableNames', () => {
    it('extracts manage table names', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const names = wiki.extractTableNames(
        'JOIN obj_bld_mst ON prd_pdm_mst.bld_id = obj_bld_mst.bld_id'
      );

      expect(names).toContain('obj_bld_mst');
      expect(names).toContain('prd_pdm_mst');
    });

    it('extracts gokr table references', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const names = wiki.extractTableNames('조인 대상: gokr.buildings');

      expect(names).toContain('buildings');
    });

    it('returns empty array for no matches', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const names = wiki.extractTableNames('일반적인 텍스트');

      expect(names).toHaveLength(0);
    });

    it('deduplicates table names', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const names = wiki.extractTableNames('obj_bld_mst JOIN obj_bld_mst');

      expect(names.filter((n) => n === 'obj_bld_mst')).toHaveLength(1);
    });
  });

  describe('extractDomains', () => {
    it('matches Korean keywords to domains', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const domains = wiki.extractDomains('빌딩 매물 관리');

      expect(domains).toContain('obj');
      expect(domains).toContain('prd');
    });

    it('matches English keywords', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const domains = wiki.extractDomains('building unit management');

      expect(domains).toContain('obj');
    });

    it('detects domain from table prefix', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      const domains = wiki.extractDomains('gtd_task_mst status update');

      expect(domains).toContain('gtd');
    });
  });

  describe('isAvailable', () => {
    it('returns true when wiki path is set', () => {
      const wiki = new WikiKnowledge(WIKI_PATH);
      expect(wiki.isAvailable).toBe(true);
    });

    it('returns false when wiki path is empty', () => {
      const wiki = new WikiKnowledge('');
      expect(wiki.isAvailable).toBe(false);
    });
  });
});
