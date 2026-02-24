import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createLogger,
  generateId,
  loadPollingConfig,
  type PollingConfig,
  type TrackedBranch,
} from '@rtb-ai-hub/shared';
import type { GitHubWebhookEvent } from '@rtb-ai-hub/shared';
import { sendToGithubQueue } from '../queue/queues';

const execAsync = promisify(exec);
const logger = createLogger('branch-poller');

type BranchRef = { branch: string; sha: string };

export class BranchPoller {
  private config: PollingConfig;
  private previousRefs = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config?: Partial<PollingConfig>) {
    this.config = { ...loadPollingConfig(), ...config };
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Branch polling disabled');
      return;
    }

    if (!this.config.workDir) {
      logger.warn('No WORK_REPO_LOCAL_PATH — cannot poll branches');
      return;
    }

    const initialRefs = await this.fetchAllRefs();
    for (const ref of initialRefs) {
      this.previousRefs.set(ref.branch, ref.sha);
    }

    logger.info(
      { interval: this.config.intervalMs, branches: initialRefs.length },
      'Branch poller started'
    );

    this.timer = setInterval(() => this.poll(), this.config.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Branch poller stopped');
  }

  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.gitFetch();
      const currentRefs = await this.fetchAllRefs();

      for (const ref of currentRefs) {
        const previousSha = this.previousRefs.get(ref.branch);

        if (previousSha && previousSha !== ref.sha) {
          const tracked = this.matchBranch(ref.branch);
          if (tracked) {
            logger.info(
              {
                branch: ref.branch,
                env: tracked.env,
                from: previousSha.slice(0, 8),
                to: ref.sha.slice(0, 8),
              },
              'Branch updated — enqueuing push event'
            );
            await this.enqueuePushEvent(ref, tracked);
          }
        }

        this.previousRefs.set(ref.branch, ref.sha);
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Poll cycle failed'
      );
    } finally {
      this.running = false;
    }
  }

  private async gitFetch(): Promise<void> {
    await execAsync('git fetch origin --prune', {
      cwd: this.config.workDir,
      timeout: 30000,
    });
  }

  private async fetchAllRefs(): Promise<BranchRef[]> {
    const refs: BranchRef[] = [];

    for (const tracked of this.config.trackedBranches) {
      const branchRefs = await this.getRemoteRefs(tracked.pattern);
      refs.push(...branchRefs);
    }

    return refs;
  }

  private async getRemoteRefs(pattern: string): Promise<BranchRef[]> {
    try {
      if (pattern.includes('*')) {
        const { stdout } = await execAsync(
          `git for-each-ref --format='%(refname:short) %(objectname)' refs/remotes/origin/${pattern.replace('*', '**')}`,
          { cwd: this.config.workDir, timeout: 10000 }
        );
        return this.parseRefOutput(stdout);
      }

      const { stdout } = await execAsync(`git rev-parse origin/${pattern}`, {
        cwd: this.config.workDir,
        timeout: 10000,
      });

      const sha = stdout.trim();
      if (sha) {
        return [{ branch: pattern, sha }];
      }
      return [];
    } catch {
      return [];
    }
  }

  private parseRefOutput(stdout: string): BranchRef[] {
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const cleaned = line.replace(/^'|'$/g, '');
        const parts = cleaned.split(' ');
        const sha = parts.pop() || '';
        const fullRef = parts.join(' ').replace('origin/', '');
        return { branch: fullRef, sha };
      })
      .filter((r) => r.sha.length >= 7);
  }

  private matchBranch(branch: string): TrackedBranch | null {
    for (const tracked of this.config.trackedBranches) {
      if (tracked.pattern.includes('*')) {
        const prefix = tracked.pattern.replace('*', '');
        if (branch.startsWith(prefix)) return tracked;
      } else if (tracked.pattern === branch) {
        return tracked;
      }
    }
    return null;
  }

  private async enqueuePushEvent(ref: BranchRef, tracked: TrackedBranch): Promise<void> {
    const repoName = await this.getRepoName();

    const event: GitHubWebhookEvent = {
      source: 'github',
      type: 'push',
      repository: repoName,
      branch: ref.branch,
      sha: ref.sha,
      timestamp: new Date().toISOString(),
      payload: {
        ref: `refs/heads/${ref.branch}`,
        polled: true,
        autoDeploy: tracked.autoDeploy,
      },
    };

    await sendToGithubQueue(
      { event, userId: null, env: tracked.env },
      { jobId: generateId('poll') }
    );
  }

  private async getRepoName(): Promise<string> {
    try {
      const { stdout } = await execAsync('git remote get-url origin', {
        cwd: this.config.workDir,
        timeout: 5000,
      });
      const url = stdout.trim();
      const match = url.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
      return match?.[1] || url;
    } catch {
      return 'unknown/repo';
    }
  }
}

let pollerInstance: BranchPoller | null = null;

export function startBranchPoller(config?: Partial<PollingConfig>): BranchPoller {
  if (pollerInstance) return pollerInstance;

  pollerInstance = new BranchPoller(config);
  pollerInstance.start().catch((err) => {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to start branch poller'
    );
  });

  return pollerInstance;
}

export function stopBranchPoller(): Promise<void> {
  if (!pollerInstance) return Promise.resolve();
  const p = pollerInstance.stop();
  pollerInstance = null;
  return p;
}
