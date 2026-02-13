import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type Redis from 'ioredis';
import {
  createLogger,
  loadPreviewConfig,
  type PreviewConfig,
  type PreviewInstance,
  type Environment,
} from '@rtb-ai-hub/shared';

const execAsync = promisify(exec);
const logger = createLogger('preview-manager');

// ─── Constants ────────────────────────────────────────────────────────────────

const PREVIEW_PREFIX = 'preview:instance:';
const PREVIEW_LIST_KEY = 'preview:active-list';
const PREVIEW_TTL = 86400;

// ─── Result Types ─────────────────────────────────────────────────────────────

export type PreviewStartResult = {
  success: boolean;
  preview?: PreviewInstance;
  error?: string;
};

export type PreviewStopResult = {
  success: boolean;
  previewId: string;
  error?: string;
};

export type PreviewCleanupResult = {
  success: boolean;
  removed: string[];
  errors: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeForDb(issueKey: string): string {
  return issueKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function generatePreviewId(issueKey: string): string {
  return `prev_${issueKey}`;
}

// ─── PreviewManager Class ─────────────────────────────────────────────────────

export class PreviewManager {
  private config: PreviewConfig;

  constructor(
    private redis: Redis,
    config?: Partial<PreviewConfig>
  ) {
    this.config = { ...loadPreviewConfig(), ...config };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Create and start a preview environment for a branch.
   *
   * Steps:
   *   1. Check if preview already exists → return existing if running
   *   2. Check maxInstances limit
   *   3. Allocate port slot
   *   4. Create database from template
   *   5. Create git worktree
   *   6. Run install command
   *   7. Run migration command
   *   8. Spawn web + API processes
   *   9. Save state to Redis
   */
  async startPreview(opts: {
    branchName: string;
    issueKey: string;
    env: Environment;
  }): Promise<PreviewStartResult> {
    const { branchName, issueKey, env } = opts;
    const previewId = generatePreviewId(issueKey);

    logger.info({ previewId, branchName, issueKey, env }, 'Starting preview environment');

    try {
      const existing = await this.getInstance(previewId);
      if (existing && existing.status === 'running') {
        logger.info({ previewId }, 'Preview already running — returning existing');
        return { success: true, preview: existing };
      }

      const activePreviews = await this.listPreviews();
      const runningCount = activePreviews.filter((p) => p.status === 'running').length;
      if (runningCount >= this.config.maxInstances) {
        const msg = `Max preview instances reached (${this.config.maxInstances})`;
        logger.warn({ previewId, runningCount }, msg);
        return { success: false, error: msg };
      }

      const slot = await this.allocateSlot();
      const webPort = this.config.webBasePort + slot * 100;
      const apiPort = this.config.apiBasePort + slot * 100;

      const dbName = `preview_${sanitizeForDb(issueKey)}`;
      const worktreePath = join(this.config.worktreeBasePath, issueKey);
      const preview: PreviewInstance = {
        id: previewId,
        issueKey,
        branchName,
        env,
        status: 'starting',
        webPort,
        apiPort,
        dbName,
        worktreePath,
        webUrl: `http://${this.config.host}:${webPort}`,
        apiUrl: `http://${this.config.host}:${apiPort}`,
        createdAt: new Date().toISOString(),
      };

      await this.saveInstance(preview);

      await this.createDatabase(dbName);
      logger.info({ dbName }, 'Preview database created');

      await this.createWorktree(worktreePath, branchName);
      logger.info({ worktreePath, branchName }, 'Git worktree created');

      await this.runCommand(this.config.installCmd, worktreePath, 'install', 300000);
      logger.info({ worktreePath }, 'Dependencies installed');

      const previewDbUrl = this.buildDatabaseUrl(dbName);
      await this.runCommand(this.config.migrateCmd, worktreePath, 'migrate', 120000, {
        DATABASE_URL: previewDbUrl,
      });
      logger.info({ dbName }, 'Database migrations applied');

      const webPid = this.spawnProcess(this.config.webCmd, worktreePath, {
        PORT: String(webPort),
        NEXT_PUBLIC_API_URL: `http://${this.config.host}:${apiPort}`,
      });

      const apiPid = this.spawnProcess(this.config.apiCmd, worktreePath, {
        PORT: String(apiPort),
        DATABASE_URL: previewDbUrl,
        CORS_ORIGIN: `http://${this.config.host}:${webPort}`,
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
      });

      preview.status = 'running';
      preview.webPid = webPid;
      preview.apiPid = apiPid;
      await this.saveInstance(preview);

      logger.info(
        { previewId, webPort, apiPort, webPid, apiPid },
        'Preview environment started successfully'
      );

      return { success: true, preview };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ previewId, error: msg }, 'Failed to start preview environment');

      const failedPreview: PreviewInstance = {
        id: previewId,
        issueKey,
        branchName,
        env,
        status: 'failed',
        webPort: 0,
        apiPort: 0,
        dbName: `preview_${sanitizeForDb(issueKey)}`,
        worktreePath: join(this.config.worktreeBasePath, issueKey),
        webUrl: '',
        apiUrl: '',
        createdAt: new Date().toISOString(),
        error: msg,
      };
      await this.saveInstance(failedPreview).catch(() => {});

      return { success: false, error: msg };
    }
  }

  async stopPreview(previewId: string): Promise<PreviewStopResult> {
    logger.info({ previewId }, 'Stopping preview environment');

    try {
      const preview = await this.getInstance(previewId);
      if (!preview) {
        return { success: false, previewId, error: 'Preview not found' };
      }

      preview.status = 'stopping';
      await this.saveInstance(preview);

      if (preview.webPid) {
        this.killProcess(preview.webPid, 'web');
      }
      if (preview.apiPid) {
        this.killProcess(preview.apiPid, 'api');
      }

      await this.dropDatabase(preview.dbName);
      logger.info({ dbName: preview.dbName }, 'Preview database dropped');

      await this.removeWorktree(preview.worktreePath);
      logger.info({ worktreePath: preview.worktreePath }, 'Git worktree removed');

      await this.removeInstance(previewId);

      logger.info({ previewId }, 'Preview environment stopped and cleaned up');
      return { success: true, previewId };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ previewId, error: msg }, 'Failed to stop preview environment');

      await this.removeInstance(previewId).catch(() => {});

      return { success: false, previewId, error: msg };
    }
  }

  async getPreview(previewId: string): Promise<PreviewInstance | null> {
    return this.getInstance(previewId);
  }

  async listPreviews(): Promise<PreviewInstance[]> {
    const ids = await this.redis.smembers(PREVIEW_LIST_KEY);
    if (ids.length === 0) return [];

    const previews: PreviewInstance[] = [];
    for (const id of ids) {
      const preview = await this.getInstance(id);
      if (preview) {
        previews.push(preview);
      } else {
        await this.redis.srem(PREVIEW_LIST_KEY, id);
      }
    }

    return previews;
  }

  async cleanupExpired(): Promise<PreviewCleanupResult> {
    logger.info('Running preview cleanup');
    const previews = await this.listPreviews();
    const now = Date.now();
    const ttlMs = this.config.ttlHours * 3600 * 1000;
    const removed: string[] = [];
    const errors: string[] = [];

    for (const preview of previews) {
      const createdAt = new Date(preview.createdAt).getTime();
      const age = now - createdAt;

      if (age > ttlMs) {
        logger.info(
          { previewId: preview.id, ageHours: Math.round(age / 3600000) },
          'Preview expired — cleaning up'
        );

        const result = await this.stopPreview(preview.id);
        if (result.success) {
          removed.push(preview.id);
        } else {
          errors.push(`${preview.id}: ${result.error}`);
        }
      }
    }

    logger.info({ removed: removed.length, errors: errors.length }, 'Preview cleanup complete');
    return { success: errors.length === 0, removed, errors };
  }

  // ─── Redis State Management ───────────────────────────────────────────────

  private async saveInstance(preview: PreviewInstance): Promise<void> {
    const key = `${PREVIEW_PREFIX}${preview.id}`;
    const ttl = this.config.ttlHours * 3600 || PREVIEW_TTL;
    await this.redis.set(key, JSON.stringify(preview), 'EX', ttl);
    await this.redis.sadd(PREVIEW_LIST_KEY, preview.id);
    logger.debug({ previewId: preview.id, status: preview.status }, 'Preview state saved');
  }

  private async getInstance(previewId: string): Promise<PreviewInstance | null> {
    const key = `${PREVIEW_PREFIX}${previewId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PreviewInstance;
    } catch {
      logger.warn({ previewId }, 'Failed to parse preview instance from Redis');
      return null;
    }
  }

  private async removeInstance(previewId: string): Promise<void> {
    await this.redis.del(`${PREVIEW_PREFIX}${previewId}`);
    await this.redis.srem(PREVIEW_LIST_KEY, previewId);
  }

  // ─── Port Allocation ──────────────────────────────────────────────────────

  /**
   * Find the first available port slot.
   * Slot 0: web=webBasePort, api=apiBasePort
   * Slot 1: web=webBasePort+100, api=apiBasePort+100
   * Slot N: web=webBasePort+N*100, api=apiBasePort+N*100
   */
  private async allocateSlot(): Promise<number> {
    const previews = await this.listPreviews();
    const usedSlots = new Set(
      previews
        .filter((p) => p.status === 'running' || p.status === 'starting')
        .map((p) => Math.floor((p.webPort - this.config.webBasePort) / 100))
    );

    for (let i = 0; i < this.config.maxInstances; i++) {
      if (!usedSlots.has(i)) return i;
    }

    throw new Error(`No available port slots (max: ${this.config.maxInstances})`);
  }

  // ─── Database Operations ──────────────────────────────────────────────────

  private async createDatabase(dbName: string): Promise<void> {
    const adminUrl = this.config.dbAdminUrl;
    if (!adminUrl) {
      throw new Error('No dbAdminUrl configured — cannot create preview database');
    }

    await execAsync(`psql "${adminUrl}" -c 'DROP DATABASE IF EXISTS "${dbName}"'`, {
      timeout: 30000,
    }).catch(() => {});

    await execAsync(
      `psql "${adminUrl}" -c 'CREATE DATABASE "${dbName}" TEMPLATE "${this.config.templateDbName}"'`,
      { timeout: 300000 }
    );
  }

  private async dropDatabase(dbName: string): Promise<void> {
    const adminUrl = this.config.dbAdminUrl;
    if (!adminUrl) return;

    await execAsync(
      `psql "${adminUrl}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid()"`,
      { timeout: 10000 }
    ).catch(() => {});

    await execAsync(`psql "${adminUrl}" -c 'DROP DATABASE IF EXISTS "${dbName}"'`, {
      timeout: 60000,
    });
  }

  private buildDatabaseUrl(dbName: string): string {
    return this.config.dbAdminUrl.replace(/\/[^/]+$/, `/${dbName}`);
  }

  // ─── Git Worktree Operations ──────────────────────────────────────────────

  private async createWorktree(worktreePath: string, branchName: string): Promise<void> {
    const workDir = this.config.workDir;
    if (!workDir) {
      throw new Error('No workDir configured — cannot create worktree');
    }

    await access(workDir);
    await mkdir(this.config.worktreeBasePath, { recursive: true });

    await execAsync('git fetch origin --prune', {
      cwd: workDir,
      timeout: 60000,
    });

    await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, {
      cwd: workDir,
      timeout: 30000,
    });
  }

  private async removeWorktree(worktreePath: string): Promise<void> {
    const workDir = this.config.workDir;
    if (!workDir) return;

    await execAsync(`git worktree remove "${worktreePath}" --force`, {
      cwd: workDir,
      timeout: 30000,
    }).catch((err: unknown) => {
      logger.warn(
        { worktreePath, error: err instanceof Error ? err.message : String(err) },
        'git worktree remove failed — attempting manual cleanup'
      );
    });

    await rm(worktreePath, { recursive: true, force: true }).catch(() => {});

    await execAsync('git worktree prune', {
      cwd: workDir,
      timeout: 10000,
    }).catch(() => {});
  }

  // ─── Process Management ───────────────────────────────────────────────────

  private spawnProcess(command: string, cwd: string, envVars: Record<string, string>): number {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...envVars },
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    const pid = child.pid;
    if (!pid) {
      throw new Error(`Failed to spawn process: ${command}`);
    }

    logger.debug({ command, pid, cwd }, 'Process spawned');
    return pid;
  }

  private killProcess(pid: number, label: string): void {
    try {
      // Kill the process group (negative PID) since we used detached: true
      process.kill(-pid, 'SIGTERM');
      logger.debug({ pid, label }, 'Process killed');
    } catch (err: unknown) {
      // ESRCH = process not found (already dead) — that's fine
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        logger.warn(
          { pid, label, error: err instanceof Error ? err.message : String(err) },
          'Failed to kill process'
        );
      }
    }
  }

  // ─── Command Execution ────────────────────────────────────────────────────

  private async runCommand(
    command: string,
    cwd: string,
    label: string,
    timeoutMs = 120000,
    extraEnv?: Record<string, string>
  ): Promise<void> {
    logger.info({ command, cwd, label }, `Running ${label} command`);

    try {
      await execAsync(command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...extraEnv },
      });
    } catch (error: unknown) {
      const execError = error as {
        code?: number;
        stderr?: string;
        message?: string;
      };
      const msg = execError.stderr || execError.message || String(error);
      throw new Error(`${label} failed (exit ${execError.code ?? 1}): ${msg.slice(-2000)}`);
    }
  }
}

// ─── Singleton Accessor ───────────────────────────────────────────────────────

let _manager: PreviewManager | null = null;

export function getPreviewManager(redis: Redis): PreviewManager {
  if (!_manager) {
    _manager = new PreviewManager(redis);
  }
  return _manager;
}

// ─── Convenience Exports ──────────────────────────────────────────────────────

export async function startPreview(
  redis: Redis,
  opts: { branchName: string; issueKey: string; env: Environment }
): Promise<PreviewStartResult> {
  return getPreviewManager(redis).startPreview(opts);
}

export async function stopPreview(redis: Redis, previewId: string): Promise<PreviewStopResult> {
  return getPreviewManager(redis).stopPreview(previewId);
}

export async function getPreview(redis: Redis, previewId: string): Promise<PreviewInstance | null> {
  return getPreviewManager(redis).getPreview(previewId);
}

export async function listPreviews(redis: Redis): Promise<PreviewInstance[]> {
  return getPreviewManager(redis).listPreviews();
}

export async function cleanupExpired(redis: Redis): Promise<PreviewCleanupResult> {
  return getPreviewManager(redis).cleanupExpired();
}
