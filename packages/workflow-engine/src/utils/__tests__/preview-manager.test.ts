import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  PreviewStartResult,
  PreviewStopResult,
  PreviewCleanupResult,
} from '../preview-manager';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
}));

// Mock the Drizzle ORM interactions via getDb from shared
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbDelete = vi.fn();

const mockDb = {
  select: mockDbSelect,
  insert: mockDbInsert,
  delete: mockDbDelete,
};

vi.mock('@rtb-ai-hub/shared', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  loadPreviewConfig: () => ({
    enabled: true,
    webBasePort: 5000,
    apiBasePort: 6000,
    worktreeBasePath: '/tmp/worktrees',
    workDir: '/workspace/repo',
    templateDbUrl: 'postgresql://admin@localhost:5432/template_db',
    dbAdminUrl: 'postgresql://admin@localhost:5432/postgres',
    templateDbName: 'template_dev',
    maxInstances: 5,
    ttlHours: 24,
    host: 'localhost',
    installCmd: 'pnpm install',
    migrateCmd: 'pnpm db:migrate',
    webCmd: 'pnpm dev:web',
    apiCmd: 'pnpm dev:api',
  }),
  getDb: () => mockDb,
  dbSchema: {
    previewInstances: {
      id: 'id',
      status: 'status',
      expiresAt: 'expiresAt',
      $inferSelect: {} as Record<string, unknown>,
    },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _col: col, _val: val, _op: 'eq' })),
  ne: vi.fn((col: unknown, val: unknown) => ({ _col: col, _val: val, _op: 'ne' })),
  lt: vi.fn((col: unknown, val: unknown) => ({ _col: col, _val: val, _op: 'lt' })),
}));

const { exec, spawn } = await import('node:child_process');
const { access, mkdir, rm } = await import('node:fs/promises');

function mockExecSuccess(stdout = '', stderr = '') {
  (exec as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout, stderr });
}

function mockExecFail(stderr = 'command failed', code = 1) {
  (exec as unknown as ReturnType<typeof vi.fn>).mockRejectedValue({
    code,
    stderr,
    stdout: '',
    message: stderr,
  });
}

function mockSpawnSuccess(pid = 12345) {
  (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    pid,
    unref: vi.fn(),
    on: vi.fn(),
  });
}

// Helper: set up mockDb to return rows from select queries
function setupDbSelect(rows: Record<string, unknown>[]) {
  const mockWhere = vi.fn().mockResolvedValue(rows);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
  return { mockFrom, mockWhere };
}

// Helper: set up mockDb for insert (upsert) calls
function setupDbInsert() {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  mockDbInsert.mockReturnValue({ values: mockValues });
  return { mockValues, mockOnConflictDoUpdate };
}

// Helper: set up mockDb for delete calls
function setupDbDelete() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  mockDbDelete.mockReturnValue({ where: mockWhere });
  return { mockWhere };
}

// Helper to create a DB row that looks like what Drizzle returns
function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prev_PROJ-1',
    issueKey: 'PROJ-1',
    branchName: 'feature/test',
    env: 'int',
    status: 'running',
    webPort: 5000,
    apiPort: 6000,
    dbName: 'preview_proj_1',
    worktreePath: '/tmp/worktrees/PROJ-1',
    webUrl: 'http://localhost:5000',
    apiUrl: 'http://localhost:6000',
    webPid: null,
    apiPid: null,
    error: null,
    createdAt: new Date(),
    lastAccessedAt: null,
    expiresAt: new Date(Date.now() + 86400 * 1000),
    ...overrides,
  };
}

describe('PreviewManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mkdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (rm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default config from loadPreviewConfig', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const manager = new PreviewManager();

      expect(manager).toBeDefined();
    });

    it('merges custom config overrides', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const manager = new PreviewManager({ maxInstances: 10, host: '0.0.0.0' });

      // getInstance returns null (no existing preview)
      setupDbSelect([]);
      // listPreviews returns empty (no running)
      // Note: after first select for getInstance, we need a second for listPreviews
      const selectCalls: Record<string, unknown>[][] = [[], []];
      let selectCallIdx = 0;
      mockDbSelect.mockImplementation(() => {
        const rows = selectCalls[selectCallIdx] || [];
        selectCallIdx++;
        const mockWhere = vi.fn().mockResolvedValue(rows);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      });
      setupDbInsert();
      mockExecSuccess();
      mockSpawnSuccess();

      const result = await manager.startPreview({
        branchName: 'feature/test',
        issueKey: 'PROJ-1',
        env: 'int',
      });

      expect(result.success).toBe(true);
      expect(result.preview?.webUrl).toContain('0.0.0.0');
    });
  });

  describe('startPreview', () => {
    it('successfully creates a preview environment', async () => {
      const { PreviewManager } = await import('../preview-manager');

      // Mock DB: getInstance returns null, listPreviews returns empty, allocateSlot returns empty
      let selectCallIdx = 0;
      mockDbSelect.mockImplementation(() => {
        const rows = selectCallIdx === 0 ? [] : []; // getInstance empty, listPreviews empty, allocateSlot empty
        selectCallIdx++;
        const mockWhere = vi.fn().mockResolvedValue(rows);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      });
      setupDbInsert();
      mockExecSuccess();
      mockSpawnSuccess(99999);

      const manager = new PreviewManager();
      const result: PreviewStartResult = await manager.startPreview({
        branchName: 'feature/PROJ-123-login',
        issueKey: 'PROJ-123',
        env: 'int',
      });

      expect(result.success).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview!.id).toBe('prev_PROJ-123');
      expect(result.preview!.branchName).toBe('feature/PROJ-123-login');
      expect(result.preview!.status).toBe('running');
      expect(result.preview!.webPort).toBe(5000);
      expect(result.preview!.apiPort).toBe(6000);
      expect(result.preview!.dbName).toBe('preview_proj_123');
      expect(result.preview!.webPid).toBe(99999);
      expect(result.preview!.apiPid).toBe(99999);

      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('returns existing preview if already running', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const existingRow = makeDbRow({
        id: 'prev_PROJ-1',
        issueKey: 'PROJ-1',
        branchName: 'feature/test',
        status: 'running',
      });

      // getInstance returns existing row
      setupDbSelect([existingRow]);

      const manager = new PreviewManager();
      const result = await manager.startPreview({
        branchName: 'feature/test',
        issueKey: 'PROJ-1',
        env: 'int',
      });

      expect(result.success).toBe(true);
      expect(result.preview!.status).toBe('running');
      expect(exec).not.toHaveBeenCalled();
    });

    it('returns error when max instances reached', async () => {
      const { PreviewManager } = await import('../preview-manager');

      const runningRows = Array.from({ length: 5 }, (_, i) =>
        makeDbRow({
          id: `prev_${String.fromCharCode(65 + i)}`,
          status: 'running',
          webPort: 5000 + i * 100,
          apiPort: 6000 + i * 100,
        })
      );

      // getInstance returns null (no existing preview for this issue), listPreviews returns 5 running
      let selectCallIdx = 0;
      mockDbSelect.mockImplementation(() => {
        const rows = selectCallIdx === 0 ? [] : runningRows;
        selectCallIdx++;
        const mockWhere = vi.fn().mockResolvedValue(rows);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      });

      const manager = new PreviewManager();
      const result = await manager.startPreview({
        branchName: 'feature/overflow',
        issueKey: 'PROJ-99',
        env: 'int',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max preview instances');
    });

    it('saves failed state on error', async () => {
      const { PreviewManager } = await import('../preview-manager');

      // getInstance null, listPreviews empty, allocateSlot empty
      let selectCallIdx = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallIdx++;
        const mockWhere = vi.fn().mockResolvedValue([]);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      });
      setupDbInsert();
      mockExecFail('psql: connection refused');

      const manager = new PreviewManager();
      const result = await manager.startPreview({
        branchName: 'feature/broken',
        issueKey: 'PROJ-ERR',
        env: 'int',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Verify DB insert was called (for saving failed state)
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('stopPreview', () => {
    it('successfully stops a running preview', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const previewRow = makeDbRow({
        id: 'prev_PROJ-1',
        status: 'running',
        webPid: 11111,
        apiPid: 22222,
        dbName: 'preview_proj_1',
        worktreePath: '/tmp/worktrees/PROJ-1',
      });

      // getInstance returns the preview
      setupDbSelect([previewRow]);
      setupDbInsert();
      setupDbDelete();
      mockExecSuccess();

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const manager = new PreviewManager();
      const result: PreviewStopResult = await manager.stopPreview('prev_PROJ-1');

      expect(result.success).toBe(true);
      expect(result.previewId).toBe('prev_PROJ-1');
      expect(killSpy).toHaveBeenCalledWith(-11111, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(-22222, 'SIGTERM');
      expect(mockDbDelete).toHaveBeenCalled();

      killSpy.mockRestore();
    });

    it('returns error for non-existent preview', async () => {
      const { PreviewManager } = await import('../preview-manager');

      setupDbSelect([]);

      const manager = new PreviewManager();
      const result = await manager.stopPreview('prev_NONEXISTENT');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Preview not found');
    });
  });

  describe('getPreview', () => {
    it('returns preview instance from DB', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const row = makeDbRow({
        id: 'prev_PROJ-5',
        issueKey: 'PROJ-5',
        status: 'running',
        webPort: 5000,
      });

      setupDbSelect([row]);

      const manager = new PreviewManager();
      const result = await manager.getPreview('prev_PROJ-5');

      expect(result).toBeDefined();
      expect(result!.id).toBe('prev_PROJ-5');
      expect(result!.status).toBe('running');
    });

    it('returns null for missing preview', async () => {
      const { PreviewManager } = await import('../preview-manager');

      setupDbSelect([]);

      const manager = new PreviewManager();
      const result = await manager.getPreview('prev_MISSING');

      expect(result).toBeNull();
    });
  });

  describe('listPreviews', () => {
    it('returns all active preview instances', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const row1 = makeDbRow({ id: 'prev_A', status: 'running' });
      const row2 = makeDbRow({ id: 'prev_B', status: 'starting' });

      const mockWhere = vi.fn().mockResolvedValue([row1, row2]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const manager = new PreviewManager();
      const result = await manager.listPreviews();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prev_A');
      expect(result[1].id).toBe('prev_B');
    });

    it('returns empty array when no previews exist', async () => {
      const { PreviewManager } = await import('../preview-manager');

      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const manager = new PreviewManager();
      const result = await manager.listPreviews();

      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupExpired', () => {
    it('removes previews older than TTL', async () => {
      const { PreviewManager } = await import('../preview-manager');

      const expiredRow = makeDbRow({
        id: 'prev_OLD',
        status: 'running',
        webPid: 111,
        apiPid: 222,
        dbName: 'preview_old',
        worktreePath: '/tmp/worktrees/OLD',
        expiresAt: new Date(Date.now() - 1000), // already expired
      });

      // cleanupExpired calls: select expired rows, then getInstance for stopPreview, then delete
      let selectCallIdx = 0;
      mockDbSelect.mockImplementation(() => {
        const rows = selectCallIdx === 0 ? [expiredRow] : [expiredRow]; // expired query, getInstance
        selectCallIdx++;
        const mockWhere = vi.fn().mockResolvedValue(rows);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      });
      setupDbInsert();
      setupDbDelete();
      mockExecSuccess();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const manager = new PreviewManager();
      const result: PreviewCleanupResult = await manager.cleanupExpired();

      expect(result.removed).toContain('prev_OLD');

      killSpy.mockRestore();
    });

    it('returns success true when nothing to clean', async () => {
      const { PreviewManager } = await import('../preview-manager');

      // No expired rows
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const manager = new PreviewManager();
      const result = await manager.cleanupExpired();

      expect(result.success).toBe(true);
      expect(result.removed).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('port allocation', () => {
    it('allocates sequential port slots', async () => {
      const { PreviewManager } = await import('../preview-manager');

      const existingRow = makeDbRow({
        id: 'prev_FIRST',
        status: 'running',
        webPort: 5000,
        apiPort: 6000,
      });

      // getInstance null, listPreviews returns existing, allocateSlot returns existing
      let selectCallIdx = 0;
      mockDbSelect.mockImplementation(() => {
        const rows = selectCallIdx === 0 ? [] : [existingRow];
        selectCallIdx++;
        const mockWhere = vi.fn().mockResolvedValue(rows);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      });
      setupDbInsert();
      mockExecSuccess();
      mockSpawnSuccess();

      const manager = new PreviewManager();
      const result = await manager.startPreview({
        branchName: 'feature/second',
        issueKey: 'PROJ-2',
        env: 'int',
      });

      expect(result.success).toBe(true);
      expect(result.preview!.webPort).toBe(5100);
      expect(result.preview!.apiPort).toBe(6100);
    });
  });

  describe('convenience exports', () => {
    it('getPreviewManager returns a singleton', async () => {
      vi.resetModules();
      const { getPreviewManager } = await import('../preview-manager');

      const m1 = getPreviewManager();
      const m2 = getPreviewManager();

      expect(m1).toBe(m2);
    });
  });
});
