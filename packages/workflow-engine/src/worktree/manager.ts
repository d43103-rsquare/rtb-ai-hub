/**
 * Worktree Manager — Git Worktree 기반 Jira 이슈별 작업 격리
 *
 * 생명주기: CREATING → ACTIVE → GATING → PR_CREATED → MERGED → CLEANED
 *
 * 기존 local-git-ops.ts, preview-manager.ts, target-ci.ts 패턴 재활용.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  WorktreeInfo,
  Environment,
  GateResult,
  GatePipelineResult,
  GateType,
} from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { determineBranchType, generateBranchName, resolveBaseBranch } from '../utils/local-git-ops';
import { WorktreeRegistry } from './registry';

const execAsync = promisify(exec);
const logger = createLogger('worktree-manager');

const WORK_REPO = process.env.WORK_REPO_LOCAL_PATH || '';
const WORKTREE_BASE_DIR = process.env.WORKTREE_BASE_DIR || '.worktrees';
const MAX_ACTIVE = parseInt(process.env.WORKTREE_MAX_ACTIVE || '10', 10);
const STALE_HOURS = parseInt(process.env.WORKTREE_STALE_HOURS || '72', 10);

export class WorktreeManager {
  private registry: WorktreeRegistry;

  constructor(registry: WorktreeRegistry) {
    this.registry = registry;
  }

  /** Create a worktree for a Jira issue */
  async createWorktree(
    issueKey: string,
    summary: string,
    env: Environment,
    issueType?: string
  ): Promise<WorktreeInfo> {
    // Check capacity
    const active = await this.registry.getActive();
    if (active.length >= MAX_ACTIVE) {
      throw new Error(`Maximum active worktrees (${MAX_ACTIVE}) reached. Clean up old worktrees first.`);
    }

    const branchType = determineBranchType(issueType, env);
    const branchName = generateBranchName(
      { issueKey, summary, issueType } as any,
      env,
      branchType
    );
    const worktreePath = path.join(WORK_REPO, WORKTREE_BASE_DIR, issueKey);
    const baseBranch = await resolveBaseBranch(env, WORK_REPO);

    const info: WorktreeInfo = {
      issueKey,
      branchName,
      worktreePath,
      baseBranch,
      env,
      status: 'creating',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    await this.registry.set(issueKey, info);

    try {
      // Fetch latest
      await execAsync('git fetch --all', { cwd: WORK_REPO });

      // Create worktree + branch
      await execAsync(
        `git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`,
        { cwd: WORK_REPO }
      );

      info.status = 'active';
      await this.registry.set(issueKey, info);

      logger.info(
        { issueKey, branchName, worktreePath, baseBranch },
        'Worktree created'
      );

      return info;
    } catch (error) {
      info.status = 'failed';
      info.error = error instanceof Error ? error.message : String(error);
      await this.registry.set(issueKey, info);

      logger.error({ issueKey, error: info.error }, 'Failed to create worktree');
      throw error;
    }
  }

  /** Run hard gates (lint, typecheck, test, build) in worktree */
  async runGates(issueKey: string): Promise<GatePipelineResult> {
    const info = await this.registry.get(issueKey);
    if (!info) throw new Error(`Worktree not found: ${issueKey}`);

    info.status = 'gating';
    await this.registry.set(issueKey, info);

    const gates: GateType[] = ['lint', 'typecheck', 'test', 'build'];
    const results: GateResult[] = [];
    let allPassed = true;
    const pipelineStart = Date.now();

    for (const gate of gates) {
      const cmd = getGateCommand(gate);
      if (!cmd) continue;

      const gateStart = Date.now();
      try {
        const { stdout } = await execAsync(cmd, {
          cwd: info.worktreePath,
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
        });

        results.push({
          gate,
          passed: true,
          output: stdout.slice(0, 5000),
          durationMs: Date.now() - gateStart,
        });
      } catch (error: any) {
        allPassed = false;
        results.push({
          gate,
          passed: false,
          output: (error.stderr || error.stdout || error.message || '').slice(0, 5000),
          durationMs: Date.now() - gateStart,
        });

        logger.warn({ issueKey, gate, error: error.message }, 'Gate failed');
        break; // Stop on first required gate failure
      }
    }

    info.status = allPassed ? 'active' : 'failed';
    info.lastActivityAt = new Date().toISOString();
    await this.registry.set(issueKey, info);

    return {
      allPassed,
      gates: results,
      totalDurationMs: Date.now() - pipelineStart,
    };
  }

  /** Push changes and create PR */
  async pushAndCreatePR(
    issueKey: string,
    params: { title: string; body: string; draft?: boolean }
  ): Promise<{ prNumber?: number; prUrl?: string }> {
    const info = await this.registry.get(issueKey);
    if (!info) throw new Error(`Worktree not found: ${issueKey}`);

    // Push branch
    await execAsync(
      `git push -u origin ${info.branchName}`,
      { cwd: info.worktreePath }
    );

    // Create PR using gh CLI
    const draft = params.draft ? '--draft' : '';
    const { stdout } = await execAsync(
      `gh pr create --title "${params.title.replace(/"/g, '\\"')}" --body "${params.body.replace(/"/g, '\\"')}" --base ${info.baseBranch} ${draft} --json number,url`,
      { cwd: info.worktreePath }
    );

    try {
      const pr = JSON.parse(stdout);
      info.prNumber = pr.number;
      info.prUrl = pr.url;
      info.status = 'pr-created';
      info.lastActivityAt = new Date().toISOString();
      await this.registry.set(issueKey, info);

      logger.info({ issueKey, prNumber: pr.number, prUrl: pr.url }, 'PR created');
      return { prNumber: pr.number, prUrl: pr.url };
    } catch {
      // gh might return text instead of JSON
      info.status = 'pr-created';
      info.lastActivityAt = new Date().toISOString();
      await this.registry.set(issueKey, info);
      return {};
    }
  }

  /** Clean up a worktree */
  async cleanupWorktree(issueKey: string): Promise<void> {
    const info = await this.registry.get(issueKey);
    if (!info) return;

    info.status = 'cleaning';
    await this.registry.set(issueKey, info);

    try {
      // Check if directory exists
      try {
        await fs.access(info.worktreePath);
        await execAsync(`git worktree remove ${info.worktreePath} --force`, { cwd: WORK_REPO });
      } catch {
        // Directory doesn't exist, just prune
      }

      await execAsync('git worktree prune', { cwd: WORK_REPO });
      await this.registry.remove(issueKey);

      logger.info({ issueKey }, 'Worktree cleaned up');
    } catch (error) {
      logger.error({ issueKey, error }, 'Failed to cleanup worktree');
    }
  }

  /** Clean up stale worktrees */
  async cleanupStale(): Promise<string[]> {
    const active = await this.registry.getActive();
    const cleaned: string[] = [];
    const now = Date.now();
    const staleMs = STALE_HOURS * 60 * 60 * 1000;

    for (const info of active) {
      const lastActivity = new Date(info.lastActivityAt).getTime();
      if (now - lastActivity > staleMs && info.status !== 'pr-created') {
        await this.cleanupWorktree(info.issueKey);
        cleaned.push(info.issueKey);
      }
    }

    if (cleaned.length > 0) {
      logger.info({ cleaned }, 'Stale worktrees cleaned up');
    }

    return cleaned;
  }

  /** Get worktree info */
  async getWorktreeInfo(issueKey: string): Promise<WorktreeInfo | null> {
    return this.registry.get(issueKey);
  }

  /** List all active worktrees */
  async listActive(): Promise<WorktreeInfo[]> {
    return this.registry.getActive();
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function getGateCommand(gate: GateType): string | null {
  switch (gate) {
    case 'lint':
      return process.env.TARGET_CI_LINT_CMD || 'pnpm lint';
    case 'typecheck':
      return process.env.TARGET_CI_TYPECHECK_CMD || 'pnpm type-check';
    case 'test':
      return process.env.TARGET_CI_TEST_CMD || 'pnpm test';
    case 'build':
      return process.env.TARGET_CI_BUILD_CMD || 'pnpm build';
    case 'e2e':
      return process.env.TARGET_CI_E2E_CMD || null;
    default:
      return null;
  }
}

export function createWorktreeManager(registry: WorktreeRegistry): WorktreeManager {
  return new WorktreeManager(registry);
}
