import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createKnowledgeRouter, resetWikiInstance } from '../routes/knowledge';

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
    getEnv: (key: string, defaultValue: string) => process.env[key] ?? defaultValue,
  };
});

const mockSearchForContext = vi.fn().mockResolvedValue('# RTB Context\n\nSample wiki content');
const mockExtractTableNames = vi.fn().mockReturnValue(['obj_bld_mst']);
const mockExtractDomains = vi.fn().mockReturnValue(['obj']);
const mockGetTableDoc = vi.fn().mockResolvedValue('# obj_bld_mst\n\nBuilding master table');
const mockGetDomainOverview = vi.fn().mockResolvedValue('# OBJ Domain\n\nBuilding management');

vi.mock('../utils/wiki-knowledge', () => {
  class MockWikiKnowledge {
    isAvailable = true;
    searchForContext = mockSearchForContext;
    extractTableNames = mockExtractTableNames;
    extractDomains = mockExtractDomains;
    getTableDoc = mockGetTableDoc;
    getDomainOverview = mockGetDomainOverview;
    buildIndex = vi.fn().mockResolvedValue({ tables: new Map(), domains: new Map() });
  }
  return { WikiKnowledge: MockWikiKnowledge };
});

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Refined specification content' }],
      }),
    };
  }
  return { default: MockAnthropic };
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(createKnowledgeRouter());
  return app;
}

describe('Knowledge API', () => {
  let app: express.Express;

  beforeEach(() => {
    resetWikiInstance();
    app = createTestApp();
    delete process.env.RTB_INTERNAL_API_TOKEN;
    vi.clearAllMocks();
    mockSearchForContext.mockResolvedValue('# RTB Context\n\nSample wiki content');
    mockExtractTableNames.mockReturnValue(['obj_bld_mst']);
    mockExtractDomains.mockReturnValue(['obj']);
    mockGetTableDoc.mockResolvedValue('# obj_bld_mst\n\nBuilding master table');
    mockGetDomainOverview.mockResolvedValue('# OBJ Domain\n\nBuilding management');
  });

  describe('POST /api/knowledge/search', () => {
    it('returns search results for valid query', async () => {
      const res = await request(app)
        .post('/api/knowledge/search')
        .send({ query: '빌딩 정보 조회 obj_bld_mst' });

      expect(res.status).toBe(200);
      expect(res.body.context).toContain('RTB Context');
      expect(res.body.tables).toContain('obj_bld_mst');
      expect(res.body.domains).toContain('obj');
    });

    it('returns 400 when query is missing', async () => {
      const res = await request(app).post('/api/knowledge/search').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('query string is required');
    });

    it('returns 400 when query is not a string', async () => {
      const res = await request(app).post('/api/knowledge/search').send({ query: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('query string is required');
    });

    it('passes maxDocs to searchForContext', async () => {
      await request(app).post('/api/knowledge/search').send({ query: 'test', maxDocs: 8 });

      expect(mockSearchForContext).toHaveBeenCalledWith('test', 8);
    });
  });

  describe('GET /api/knowledge/table/:tableName', () => {
    it('returns table content when found', async () => {
      const res = await request(app).get('/api/knowledge/table/obj_bld_mst');

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(true);
      expect(res.body.content).toContain('obj_bld_mst');
    });

    it('returns found=false when table not found', async () => {
      mockGetTableDoc.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/knowledge/table/nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(false);
      expect(res.body.content).toBe('');
    });
  });

  describe('GET /api/knowledge/domain/:domainKey', () => {
    it('returns domain overview when found', async () => {
      const res = await request(app).get('/api/knowledge/domain/obj');

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(true);
      expect(res.body.content).toContain('OBJ Domain');
    });

    it('returns found=false when domain not found', async () => {
      mockGetDomainOverview.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/knowledge/domain/nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(false);
    });
  });

  describe('POST /api/knowledge/refine', () => {
    it('returns 400 when requirement is missing', async () => {
      const res = await request(app).post('/api/knowledge/refine').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('requirement string is required');
    });

    it('returns unrefined result when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const res = await request(app)
        .post('/api/knowledge/refine')
        .send({ requirement: '빌딩 목록 조회 API' });

      expect(res.status).toBe(200);
      expect(res.body.refinedSpec).toBe('빌딩 목록 조회 API');
      expect(res.body.note).toContain('ANTHROPIC_API_KEY');
    });

    it('returns refined spec when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const res = await request(app)
        .post('/api/knowledge/refine')
        .send({ requirement: '빌딩 목록 조회 API', jiraKey: 'PROJ-123' });

      expect(res.status).toBe(200);
      expect(res.body.refinedSpec).toBe('Refined specification content');
      expect(res.body.suggestedTables).toEqual(expect.any(Array));
    });
  });
});
