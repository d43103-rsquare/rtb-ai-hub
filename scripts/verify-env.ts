// scripts/verify-env.ts
// Environment verification script for the bug-fix workflow.
// Checks required env vars, CLI tools, infrastructure, and repository status.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, fn: () => string): void {
  try {
    const message = fn();
    results.push({ name, status: 'pass', message });
  } catch (err) {
    results.push({ name, status: 'fail', message: (err as Error).message });
  }
}

function warn(name: string, fn: () => string): void {
  try {
    const message = fn();
    results.push({ name, status: 'pass', message });
  } catch (err) {
    results.push({ name, status: 'warn', message: (err as Error).message });
  }
}

function checkEnvVar(name: string, required: boolean = true): void {
  const fn = () => {
    const value = process.env[name];
    if (!value) throw new Error('Not set');
    // Mask sensitive values
    if (
      name.includes('KEY') ||
      name.includes('TOKEN') ||
      name.includes('PASSWORD')
    ) {
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    return value;
  };
  if (required) check(`ENV: ${name}`, fn);
  else warn(`ENV: ${name}`, fn);
}

function checkCli(name: string, command: string, args: string[]): void {
  check(`CLI: ${name}`, () => {
    const output = execFileSync(command, args, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const firstLine = output.split('\n')[0];
    if (!firstLine || firstLine.includes('not found')) {
      throw new Error('Not installed');
    }
    return firstLine;
  });
}

function checkWorkRepo(): void {
  const repoPath = process.env.WORK_REPO_LOCAL_PATH;
  if (!repoPath) {
    results.push({
      name: 'REPO: Checks skipped',
      status: 'warn',
      message: 'WORK_REPO_LOCAL_PATH not set',
    });
    return;
  }

  check('REPO: Directory exists', () => {
    if (!fs.existsSync(repoPath)) throw new Error(`${repoPath} not found`);
    return repoPath;
  });

  check('REPO: Is git repository', () => {
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) throw new Error('Not a git repository');
    return 'Yes';
  });

  check('REPO: Has remote origin', () => {
    const output = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return output;
  });
}

function checkDatabase(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    results.push({
      name: 'DB: Checks skipped',
      status: 'warn',
      message: 'DATABASE_URL not set',
    });
    return;
  }

  check('DB: PostgreSQL connection', () => {
    // Try psql first
    try {
      execFileSync('psql', [dbUrl, '-c', 'SELECT 1', '-t', '-A'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return 'Connected';
    } catch {
      // Fallback: try pg_isready
      try {
        const url = new URL(dbUrl);
        const args = ['-h', url.hostname, '-p', url.port || '5432'];
        execFileSync('pg_isready', args, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return 'Ready (pg_isready)';
      } catch {
        throw new Error('Cannot connect to PostgreSQL');
      }
    }
  });
}

// --- Run checks ---
console.log('\n🔍 RTB AI Hub — Bug Fix Workflow Environment Check\n');
console.log('='.repeat(60));

// 1. Required env vars
console.log('\n📋 Required Environment Variables:');
checkEnvVar('ANTHROPIC_API_KEY');
checkEnvVar('DATABASE_URL');
checkEnvVar('WORK_REPO_LOCAL_PATH');
// Accept either GITHUB_TOKEN or GH_TOKEN
if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
  const tokenName = process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'GH_TOKEN';
  checkEnvVar(tokenName);
} else {
  check('ENV: GITHUB_TOKEN (or GH_TOKEN)', () => {
    throw new Error('Not set');
  });
}

// 2. Optional env vars
console.log('\n📋 Optional Environment Variables:');
checkEnvVar('JIRA_API_TOKEN', false);
checkEnvVar('WORKTREE_ENABLED', false);
checkEnvVar('CLAUDE_CODE_CLI_PATH', false);

// 3. CLI tools
console.log('\n🔧 CLI Tools:');
checkCli('git', 'git', ['--version']);
checkCli('pnpm', 'pnpm', ['--version']);
checkCli('gh (GitHub CLI)', 'gh', ['--version']);
checkCli('claude (Claude CLI)', 'claude', ['--version']);

// 4. Work repository
console.log('\n📂 Work Repository:');
checkWorkRepo();

// 5. Database
console.log('\n🗄️  Database:');
checkDatabase();

// --- Print results ---
console.log('\n' + '='.repeat(60));
console.log('\n📊 Results:\n');

const icons = { pass: '✅', fail: '❌', warn: '⚠️' };
for (const r of results) {
  console.log(`  ${icons[r.status]} ${r.name}: ${r.message}`);
}

const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.filter((r) => r.status === 'fail').length;
const warned = results.filter((r) => r.status === 'warn').length;

console.log(`\n  Total: ${passed} passed, ${failed} failed, ${warned} warnings`);

if (failed > 0) {
  console.log(
    '\n❌ Some required checks failed. Fix them before running the bug-fix workflow.'
  );
  process.exit(1);
} else {
  console.log('\n✅ All required checks passed!');
  if (warned > 0) console.log(`   (${warned} optional items not configured)`);
}
