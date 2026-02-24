/**
 * Worktree Registry — PostgreSQL 기반 활성 worktree 추적
 *
 * Redis에서 Drizzle ORM (PostgreSQL)으로 마이그레이션.
 */

import type { WorktreeInfo } from '@rtb-ai-hub/shared';
import { createLogger, getDb, worktreeRegistry } from '@rtb-ai-hub/shared';
import { eq, gt, count } from 'drizzle-orm';

const logger = createLogger('worktree-registry');

const TTL_SECONDS = 72 * 60 * 60; // 72 hours

export class WorktreeRegistry {
  /** Register or update a worktree */
  async set(issueKey: string, info: WorktreeInfo): Promise<void> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

    await db
      .insert(worktreeRegistry)
      .values({
        issueKey,
        data: info,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: worktreeRegistry.issueKey,
        set: {
          data: info,
          expiresAt,
        },
      });
  }

  /** Get worktree info by issue key */
  async get(issueKey: string): Promise<WorktreeInfo | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(worktreeRegistry)
      .where(eq(worktreeRegistry.issueKey, issueKey));

    if (rows.length === 0) return null;

    const row = rows[0];

    // Check if expired
    if (new Date(row.expiresAt) < new Date()) {
      // Expired — clean up
      await this.remove(issueKey);
      return null;
    }

    try {
      return row.data as WorktreeInfo;
    } catch {
      return null;
    }
  }

  /** Remove a worktree from registry */
  async remove(issueKey: string): Promise<void> {
    const db = getDb();
    await db
      .delete(worktreeRegistry)
      .where(eq(worktreeRegistry.issueKey, issueKey));
  }

  /** Get all active worktrees (non-expired) */
  async getActive(): Promise<WorktreeInfo[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(worktreeRegistry)
      .where(gt(worktreeRegistry.expiresAt, new Date()));

    return rows.map((row) => row.data as WorktreeInfo);
  }

  /** Get count of active worktrees (non-expired) */
  async getActiveCount(): Promise<number> {
    const db = getDb();
    const result = await db
      .select({ value: count() })
      .from(worktreeRegistry)
      .where(gt(worktreeRegistry.expiresAt, new Date()));

    return result[0]?.value ?? 0;
  }

  /** Check if a worktree exists for this issue (and is not expired) */
  async exists(issueKey: string): Promise<boolean> {
    const info = await this.get(issueKey);
    return info !== null;
  }
}

export function createWorktreeRegistry(): WorktreeRegistry {
  return new WorktreeRegistry();
}
