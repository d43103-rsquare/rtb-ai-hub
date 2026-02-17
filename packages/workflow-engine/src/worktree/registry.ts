/**
 * Worktree Registry — Redis 기반 활성 worktree 추적
 *
 * 기존 preview-manager.ts의 Redis 패턴 재활용.
 */

import type { WorktreeInfo } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import type Redis from 'ioredis';

const logger = createLogger('worktree-registry');

const REDIS_PREFIX = 'rtb:worktree:';
const REDIS_SET_KEY = 'rtb:worktree:active';
const TTL_SECONDS = 72 * 60 * 60; // 72 hours

export class WorktreeRegistry {
  constructor(private redis: Redis) {}

  /** Register or update a worktree */
  async set(issueKey: string, info: WorktreeInfo): Promise<void> {
    const key = `${REDIS_PREFIX}${issueKey}`;
    await this.redis.setex(key, TTL_SECONDS, JSON.stringify(info));
    await this.redis.sadd(REDIS_SET_KEY, issueKey);
  }

  /** Get worktree info by issue key */
  async get(issueKey: string): Promise<WorktreeInfo | null> {
    const key = `${REDIS_PREFIX}${issueKey}`;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as WorktreeInfo;
    } catch {
      return null;
    }
  }

  /** Remove a worktree from registry */
  async remove(issueKey: string): Promise<void> {
    const key = `${REDIS_PREFIX}${issueKey}`;
    await this.redis.del(key);
    await this.redis.srem(REDIS_SET_KEY, issueKey);
  }

  /** Get all active worktrees */
  async getActive(): Promise<WorktreeInfo[]> {
    const issueKeys = await this.redis.smembers(REDIS_SET_KEY);
    const results: WorktreeInfo[] = [];

    for (const issueKey of issueKeys) {
      const info = await this.get(issueKey);
      if (info) {
        results.push(info);
      } else {
        // Stale entry — remove from set
        await this.redis.srem(REDIS_SET_KEY, issueKey);
      }
    }

    return results;
  }

  /** Get count of active worktrees */
  async getActiveCount(): Promise<number> {
    return this.redis.scard(REDIS_SET_KEY);
  }

  /** Check if a worktree exists for this issue */
  async exists(issueKey: string): Promise<boolean> {
    const result = await this.redis.sismember(REDIS_SET_KEY, issueKey);
    return result === 1;
  }
}

export function createWorktreeRegistry(redis: Redis): WorktreeRegistry {
  return new WorktreeRegistry(redis);
}
