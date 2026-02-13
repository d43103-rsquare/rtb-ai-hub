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

function createMockRedis(data: Record<string, string> = {}, setMembers: string[] = []) {
  const store = { ...data };
  const members = new Set(setMembers);

  return {
    get: vi.fn((key: string) => Promise.resolve(store[key] || null)),
    set: vi.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      delete store[key];
      return Promise.resolve(1);
    }),
    sadd: vi.fn((_key: string, member: string) => {
      members.add(member);
      return Promise.resolve(1);
    }),
    srem: vi.fn((_key: string, member: string) => {
      members.delete(member);
      return Promise.resolve(1);
    }),
    smembers: vi.fn(() => Promise.resolve([...members])),
    expire: vi.fn(() => Promise.resolve(1)),
    _store: store,
    _members: members,
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
      const redis = createMockRedis();
      const manager = new PreviewManager(redis as never);

      expect(manager).toBeDefined();
    });

    it('merges custom config overrides', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis();
      const manager = new PreviewManager(redis as never, { maxInstances: 10, host: '0.0.0.0' });

      mockExecSuccess();
      mockSpawnSuccess();
      redis.smembers.mockResolvedValue([]);

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
      const redis = createMockRedis();
      mockExecSuccess();
      mockSpawnSuccess(99999);

      const manager = new PreviewManager(redis as never);
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

      expect(redis.set).toHaveBeenCalled();
      expect(redis.sadd).toHaveBeenCalled();
    });

    it('returns existing preview if already running', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const existingPreview = {
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
        createdAt: new Date().toISOString(),
      };

      const redis = createMockRedis({
        'preview:instance:prev_PROJ-1': JSON.stringify(existingPreview),
      });

      const manager = new PreviewManager(redis as never);
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

      const runningIds = ['prev_A', 'prev_B', 'prev_C', 'prev_D', 'prev_E'];
      const store: Record<string, string> = {};
      for (let i = 0; i < runningIds.length; i++) {
        store[`preview:instance:${runningIds[i]}`] = JSON.stringify({
          id: runningIds[i],
          status: 'running',
          webPort: 5000 + i * 100,
          createdAt: new Date().toISOString(),
        });
      }

      const redis = createMockRedis(store, runningIds);
      const manager = new PreviewManager(redis as never);

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
      const redis = createMockRedis();
      mockExecFail('psql: connection refused');

      const manager = new PreviewManager(redis as never);
      const result = await manager.startPreview({
        branchName: 'feature/broken',
        issueKey: 'PROJ-ERR',
        env: 'int',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      const savedCalls = redis.set.mock.calls;
      const lastSave = savedCalls[savedCalls.length - 1];
      if (lastSave) {
        const saved = JSON.parse(lastSave[1] as string);
        expect(saved.status).toBe('failed');
      }
    });
  });

  describe('stopPreview', () => {
    it('successfully stops a running preview', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const preview = {
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
        webPid: 11111,
        apiPid: 22222,
        createdAt: new Date().toISOString(),
      };

      const redis = createMockRedis({ 'preview:instance:prev_PROJ-1': JSON.stringify(preview) }, [
        'prev_PROJ-1',
      ]);

      mockExecSuccess();

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const manager = new PreviewManager(redis as never);
      const result: PreviewStopResult = await manager.stopPreview('prev_PROJ-1');

      expect(result.success).toBe(true);
      expect(result.previewId).toBe('prev_PROJ-1');
      expect(killSpy).toHaveBeenCalledWith(-11111, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(-22222, 'SIGTERM');
      expect(redis.del).toHaveBeenCalledWith('preview:instance:prev_PROJ-1');
      expect(redis.srem).toHaveBeenCalledWith('preview:active-list', 'prev_PROJ-1');

      killSpy.mockRestore();
    });

    it('returns error for non-existent preview', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis();

      const manager = new PreviewManager(redis as never);
      const result = await manager.stopPreview('prev_NONEXISTENT');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Preview not found');
    });
  });

  describe('getPreview', () => {
    it('returns preview instance from Redis', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const preview = {
        id: 'prev_PROJ-5',
        issueKey: 'PROJ-5',
        status: 'running',
        webPort: 5000,
        createdAt: new Date().toISOString(),
      };

      const redis = createMockRedis({
        'preview:instance:prev_PROJ-5': JSON.stringify(preview),
      });

      const manager = new PreviewManager(redis as never);
      const result = await manager.getPreview('prev_PROJ-5');

      expect(result).toBeDefined();
      expect(result!.id).toBe('prev_PROJ-5');
      expect(result!.status).toBe('running');
    });

    it('returns null for missing preview', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis();

      const manager = new PreviewManager(redis as never);
      const result = await manager.getPreview('prev_MISSING');

      expect(result).toBeNull();
    });

    it('returns null for invalid JSON in Redis', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis({
        'preview:instance:prev_BAD': '{invalid json',
      });

      const manager = new PreviewManager(redis as never);
      const result = await manager.getPreview('prev_BAD');

      expect(result).toBeNull();
    });
  });

  describe('listPreviews', () => {
    it('returns all active preview instances', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const preview1 = { id: 'prev_A', status: 'running', createdAt: new Date().toISOString() };
      const preview2 = { id: 'prev_B', status: 'starting', createdAt: new Date().toISOString() };

      const redis = createMockRedis(
        {
          'preview:instance:prev_A': JSON.stringify(preview1),
          'preview:instance:prev_B': JSON.stringify(preview2),
        },
        ['prev_A', 'prev_B']
      );

      const manager = new PreviewManager(redis as never);
      const result = await manager.listPreviews();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prev_A');
      expect(result[1].id).toBe('prev_B');
    });

    it('returns empty array when no previews exist', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis();

      const manager = new PreviewManager(redis as never);
      const result = await manager.listPreviews();

      expect(result).toHaveLength(0);
    });

    it('cleans up stale entries from the set', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis({}, ['prev_STALE']);

      const manager = new PreviewManager(redis as never);
      const result = await manager.listPreviews();

      expect(result).toHaveLength(0);
      expect(redis.srem).toHaveBeenCalledWith('preview:active-list', 'prev_STALE');
    });
  });

  describe('cleanupExpired', () => {
    it('removes previews older than TTL', async () => {
      const { PreviewManager } = await import('../preview-manager');

      const expiredDate = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
      const freshDate = new Date().toISOString();

      const expired = {
        id: 'prev_OLD',
        status: 'running',
        webPid: 111,
        apiPid: 222,
        dbName: 'preview_old',
        worktreePath: '/tmp/worktrees/OLD',
        createdAt: expiredDate,
      };
      const fresh = {
        id: 'prev_NEW',
        status: 'running',
        createdAt: freshDate,
      };

      const redis = createMockRedis(
        {
          'preview:instance:prev_OLD': JSON.stringify(expired),
          'preview:instance:prev_NEW': JSON.stringify(fresh),
        },
        ['prev_OLD', 'prev_NEW']
      );

      mockExecSuccess();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const manager = new PreviewManager(redis as never);
      const result: PreviewCleanupResult = await manager.cleanupExpired();

      expect(result.removed).toContain('prev_OLD');
      expect(result.removed).not.toContain('prev_NEW');

      killSpy.mockRestore();
    });

    it('returns success true when nothing to clean', async () => {
      const { PreviewManager } = await import('../preview-manager');
      const redis = createMockRedis();

      const manager = new PreviewManager(redis as never);
      const result = await manager.cleanupExpired();

      expect(result.success).toBe(true);
      expect(result.removed).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('port allocation', () => {
    it('allocates sequential port slots', async () => {
      const { PreviewManager } = await import('../preview-manager');

      const existing = {
        id: 'prev_FIRST',
        status: 'running',
        webPort: 5000,
        apiPort: 6000,
        createdAt: new Date().toISOString(),
      };

      const redis = createMockRedis({ 'preview:instance:prev_FIRST': JSON.stringify(existing) }, [
        'prev_FIRST',
      ]);

      mockExecSuccess();
      mockSpawnSuccess();

      const manager = new PreviewManager(redis as never);
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
      const redis = createMockRedis();

      const m1 = getPreviewManager(redis as never);
      const m2 = getPreviewManager(redis as never);

      expect(m1).toBe(m2);
    });
  });
});
