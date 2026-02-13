import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLogger, getEnv } from '@rtb-ai-hub/shared';

const execAsync = promisify(exec);
const logger = createLogger('repo-manager');

// ─── Types ───────────────────────────────────────────────────────────────────

export type RepoConfig = {
  url: string;
  localPath: string;
  readonly: boolean; // true for wiki, false for work repo
};

// ─── RepoManager Class ───────────────────────────────────────────────────────

export class RepoManager {
  private wikiConfig: RepoConfig | null = null;
  private workConfig: RepoConfig | null = null;

  constructor() {
    // Wiki repo (읽기 전용)
    const wikiUrl = getEnv('WIKI_REPO_URL', '');
    const wikiPath = getEnv('WIKI_LOCAL_PATH', '');
    if (wikiUrl && wikiPath) {
      this.wikiConfig = {
        url: wikiUrl,
        localPath: wikiPath,
        readonly: true,
      };
    }

    // Work repo (읽기/쓰기)
    const workUrl = getEnv('WORK_REPO_URL', '');
    const workPath = getEnv('WORK_REPO_LOCAL_PATH', '');
    if (workUrl && workPath) {
      this.workConfig = {
        url: workUrl,
        localPath: workPath,
        readonly: false,
      };
    }
  }

  /**
   * Initialize both wiki and work repositories.
   * Called once on service startup.
   */
  async initialize(): Promise<void> {
    const results = await Promise.allSettled([
      this.wikiConfig ? this.ensureRepo(this.wikiConfig, 'Wiki') : Promise.resolve(),
      this.workConfig ? this.ensureRepo(this.workConfig, 'Work') : Promise.resolve(),
    ]);

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn(
        { failures: failures.map((f) => (f as PromiseRejectedResult).reason) },
        'Some repositories failed to initialize'
      );
    }

    logger.info('Repository manager initialized');
  }

  /**
   * Get wiki repository path (if configured).
   */
  get wikiPath(): string | null {
    return this.wikiConfig?.localPath || null;
  }

  /**
   * Get work repository path (if configured).
   */
  get workPath(): string | null {
    return this.workConfig?.localPath || null;
  }

  /**
   * Update wiki repository (pull latest).
   * Safe to call even if not initialized — will be no-op.
   */
  async updateWiki(): Promise<void> {
    if (!this.wikiConfig) return;
    await this.pullRepo(this.wikiConfig);
  }

  /**
   * Update work repository (fetch latest).
   */
  async updateWorkRepo(): Promise<void> {
    if (!this.workConfig) return;
    await this.fetchRepo(this.workConfig);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Ensure a repository is cloned and up-to-date.
   */
  private async ensureRepo(config: RepoConfig, label: string): Promise<void> {
    try {
      const exists = await this.pathExists(config.localPath);

      if (!exists) {
        await this.cloneRepo(config, label);
      } else {
        logger.info({ path: config.localPath }, `${label} repo already exists`);
        if (config.readonly) {
          await this.pullRepo(config);
        } else {
          await this.fetchRepo(config);
        }
      }
    } catch (error) {
      logger.error(
        { label, url: config.url, error: error instanceof Error ? error.message : String(error) },
        'Failed to ensure repository'
      );
      throw error;
    }
  }

  /**
   * Clone a git repository.
   */
  private async cloneRepo(config: RepoConfig, label: string): Promise<void> {
    logger.info({ url: config.url, path: config.localPath }, `Cloning ${label} repository...`);

    // Ensure parent directory exists
    const parentDir = dirname(config.localPath);
    await mkdir(parentDir, { recursive: true });

    try {
      const { stdout, stderr } = await execAsync(`git clone ${config.url} ${config.localPath}`, {
        timeout: 120000, // 2 minutes
      });

      if (stderr && !stderr.includes('Cloning into')) {
        logger.warn({ stderr }, `Git clone stderr for ${label}`);
      }

      logger.info({ path: config.localPath, stdout: stdout.trim() }, `${label} repo cloned`);
    } catch (error) {
      logger.error(
        {
          url: config.url,
          path: config.localPath,
          error: error instanceof Error ? error.message : String(error),
        },
        `Failed to clone ${label} repository`
      );
      throw error;
    }
  }

  /**
   * Pull latest changes (for readonly repos like wiki).
   */
  private async pullRepo(config: RepoConfig): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync('git pull', {
        cwd: config.localPath,
        timeout: 60000, // 1 minute
      });

      if (stderr && !stderr.includes('Already up to date')) {
        logger.warn({ stderr, path: config.localPath }, 'Git pull stderr');
      }

      logger.info({ path: config.localPath, result: stdout.trim() }, 'Repo updated');
    } catch (error) {
      logger.error(
        {
          path: config.localPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to pull repository'
      );
      // Don't throw — service can continue with stale wiki
    }
  }

  /**
   * Fetch latest refs (for work repos).
   */
  private async fetchRepo(config: RepoConfig): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync('git fetch', {
        cwd: config.localPath,
        timeout: 60000, // 1 minute
      });

      if (stderr) {
        logger.debug({ stderr, path: config.localPath }, 'Git fetch stderr');
      }

      logger.info({ path: config.localPath, result: stdout.trim() }, 'Repo fetched');
    } catch (error) {
      logger.error(
        {
          path: config.localPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch repository'
      );
      // Don't throw — service can continue
    }
  }

  /**
   * Check if a path exists.
   */
  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let repoManagerInstance: RepoManager | null = null;

/**
 * Get the global RepoManager instance.
 * Creates it lazily on first call.
 */
export function getRepoManager(): RepoManager {
  if (!repoManagerInstance) {
    repoManagerInstance = new RepoManager();
  }
  return repoManagerInstance;
}
