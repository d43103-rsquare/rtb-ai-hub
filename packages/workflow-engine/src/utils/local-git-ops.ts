import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger, REPO_ROUTING } from '@rtb-ai-hub/shared';
import type { Environment, JiraWebhookEvent } from '@rtb-ai-hub/shared';

const execAsync = promisify(exec);
const logger = createLogger('local-git-ops');

// ─── Types ───────────────────────────────────────────────────────────────────

export type BranchType = 'feature' | 'bugfix' | 'hotfix';

export type LocalBranchResult = {
  success: boolean;
  branchName: string;
  baseBranch: string;
  error?: string;
};

export type LocalCommitResult = {
  success: boolean;
  commitSha: string;
  message: string;
  filesWritten: number;
  error?: string;
};

export type LocalPushResult = {
  success: boolean;
  branchName: string;
  error?: string;
};

export type FileToWrite = {
  path: string;
  content: string;
  action: string;
};

// ─── Branch Naming ───────────────────────────────────────────────────────────

/**
 * Determine the branch type based on issue type and environment.
 * Team convention:
 *   - feature/* → for new features (from develop)
 *   - bugfix/*  → for bug fixes (from release/*)
 *   - hotfix/*  → for urgent fixes (from main)
 */
export function determineBranchType(issueType: string | undefined, env: Environment): BranchType {
  if (env === 'prd') return 'hotfix';
  if (env === 'stg') return 'bugfix';

  if (!issueType) return 'feature';

  const lowerType = issueType.toLowerCase();
  if (lowerType === 'bug' || lowerType === 'bugfix') return 'bugfix';

  return 'feature';
}

/**
 * Generate a branch name following team convention: {type}/{PROJ-123}-{short-description}
 *
 * Examples:
 *   - feature/PROJ-123-implement-login-page
 *   - bugfix/PROJ-456-fix-null-pointer
 *   - hotfix/PROJ-789-critical-auth-fix
 */
export function generateBranchName(
  event: JiraWebhookEvent,
  env: Environment,
  branchType?: BranchType
): string {
  const type = branchType || determineBranchType(event.issueType, env);
  const issueKey = event.issueKey.toUpperCase();

  const sanitized = event.summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

  return `${type}/${issueKey}-${sanitized}`;
}

/**
 * Generate a commit message following team convention: [PROJ-123] description
 */
export function generateCommitMessage(event: JiraWebhookEvent, summary?: string): string {
  const description = summary || event.summary;
  return `[${event.issueKey}] ${description}`;
}

// ─── Resolve Base Branch ─────────────────────────────────────────────────────

/**
 * Resolve the base branch for a given environment.
 * For stg, if the base is 'release/*', we need to find the actual latest release branch.
 */
export async function resolveBaseBranch(env: Environment, workDir: string): Promise<string> {
  const configured = REPO_ROUTING.branches[env] || 'main';

  if (!configured.includes('*')) {
    return configured;
  }

  try {
    const { stdout } = await execAsync(
      `git for-each-ref --sort=-creatordate --format='%(refname:short)' 'refs/remotes/origin/${configured.replace('*', '**')}' | head -1`,
      { cwd: workDir, timeout: 10000 }
    );

    const latestBranch = stdout.trim().replace('origin/', '');
    if (latestBranch) {
      logger.info(
        { env, pattern: configured, resolved: latestBranch },
        'Resolved base branch from pattern'
      );
      return latestBranch;
    }
  } catch (err) {
    logger.warn(
      { env, pattern: configured, error: err instanceof Error ? err.message : String(err) },
      'Failed to resolve branch pattern — falling back to develop'
    );
  }

  return env === 'stg' ? 'develop' : 'main';
}

// ─── Git Operations ──────────────────────────────────────────────────────────

/**
 * Run a git command in the work repo directory.
 */
async function git(
  args: string,
  workDir: string,
  timeoutMs = 30000
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(`git ${args}`, {
    cwd: workDir,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Fetch latest from remote before creating branches.
 */
export async function fetchLatest(workDir: string): Promise<void> {
  logger.info({ workDir }, 'Fetching latest from remote');
  await git('fetch origin --prune', workDir, 60000);
}

/**
 * Create a local branch from the base branch.
 * Steps:
 *   1. git fetch origin
 *   2. git checkout <baseBranch> && git pull origin <baseBranch>
 *   3. git checkout -b <newBranch>
 */
export async function createLocalBranch(
  branchName: string,
  baseBranch: string,
  workDir: string
): Promise<LocalBranchResult> {
  try {
    logger.info({ branchName, baseBranch, workDir }, 'Creating local branch');

    await fetchLatest(workDir);
    await git(`checkout ${baseBranch}`, workDir);
    await git(`pull origin ${baseBranch}`, workDir, 60000);
    await git(`checkout -b ${branchName}`, workDir);

    logger.info({ branchName, baseBranch }, 'Local branch created');
    return { success: true, branchName, baseBranch };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ branchName, baseBranch, error: msg }, 'Failed to create local branch');
    return { success: false, branchName, baseBranch, error: msg };
  }
}

/**
 * Write generated files to the work repo and commit them.
 * Steps:
 *   1. Write each file to disk
 *   2. git add <files>
 *   3. git commit -m "[PROJ-123] description"
 */
export async function writeAndCommit(
  files: FileToWrite[],
  commitMessage: string,
  workDir: string
): Promise<LocalCommitResult> {
  try {
    if (files.length === 0) {
      return {
        success: false,
        commitSha: '',
        message: commitMessage,
        filesWritten: 0,
        error: 'No files to commit',
      };
    }

    logger.info({ fileCount: files.length, commitMessage }, 'Writing files and committing');

    const writtenPaths: string[] = [];
    for (const file of files) {
      const fullPath = join(workDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
      writtenPaths.push(file.path);
    }

    await git(`add ${writtenPaths.map((p) => `"${p}"`).join(' ')}`, workDir);
    await git(`commit -m "${commitMessage.replace(/"/g, '\\"')}"`, workDir);

    const { stdout } = await git('rev-parse HEAD', workDir);
    const commitSha = stdout.trim();

    logger.info({ commitSha, filesWritten: writtenPaths.length }, 'Files committed locally');

    return {
      success: true,
      commitSha,
      message: commitMessage,
      filesWritten: writtenPaths.length,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Failed to write and commit');
    return {
      success: false,
      commitSha: '',
      message: commitMessage,
      filesWritten: 0,
      error: msg,
    };
  }
}

/**
 * Push the current branch to remote.
 */
export async function pushBranch(branchName: string, workDir: string): Promise<LocalPushResult> {
  try {
    logger.info({ branchName }, 'Pushing branch to remote');
    await git(`push -u origin ${branchName}`, workDir, 60000);

    logger.info({ branchName }, 'Branch pushed');
    return { success: true, branchName };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ branchName, error: msg }, 'Failed to push branch');
    return { success: false, branchName, error: msg };
  }
}

/**
 * Amend the last commit (used for CI retry after AI fixes).
 */
export async function amendCommit(
  files: FileToWrite[],
  workDir: string
): Promise<LocalCommitResult> {
  try {
    if (files.length === 0) {
      return { success: false, commitSha: '', message: '', filesWritten: 0, error: 'No files' };
    }

    for (const file of files) {
      const fullPath = join(workDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
    }

    const paths = files.map((f) => `"${f.path}"`).join(' ');
    await git(`add ${paths}`, workDir);
    await git('commit --amend --no-edit', workDir);

    const { stdout } = await git('rev-parse HEAD', workDir);
    const commitSha = stdout.trim();

    logger.info({ commitSha, filesWritten: files.length }, 'Commit amended with fixes');
    return { success: true, commitSha, message: '', filesWritten: files.length };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Failed to amend commit');
    return { success: false, commitSha: '', message: '', filesWritten: 0, error: msg };
  }
}

/**
 * Clean up a local branch if the workflow fails.
 * Switches back to base branch and deletes the feature branch.
 */
export async function cleanupBranch(
  branchName: string,
  baseBranch: string,
  workDir: string
): Promise<void> {
  try {
    await git(`checkout ${baseBranch}`, workDir);
    await git(`branch -D ${branchName}`, workDir);
    logger.info({ branchName }, 'Cleaned up failed branch');
  } catch (err) {
    logger.warn(
      { branchName, error: err instanceof Error ? err.message : String(err) },
      'Failed to clean up branch — may need manual cleanup'
    );
  }
}
