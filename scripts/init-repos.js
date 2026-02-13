#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');

const WIKI_REPO_URL = process.env.WIKI_REPO_URL || '';
const WIKI_LOCAL_PATH = process.env.WIKI_LOCAL_PATH || '';
const WORK_REPO_URL = process.env.WORK_REPO_URL || '';
const WORK_REPO_LOCAL_PATH = process.env.WORK_REPO_LOCAL_PATH || '';

function log(message) {
  console.log(`[init-repos] ${message}`);
}

function execCmd(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    console.error(`[init-repos] Error: ${error.message}`);
    return false;
  }
}

function ensureRepo(repoUrl, localPath, label) {
  if (!repoUrl || !localPath) {
    log(`${label}: Skipped (not configured)`);
    return true;
  }

  if (existsSync(localPath)) {
    log(`${label}: Already exists at ${localPath}`);
    log(`${label}: Updating...`);
    return execCmd('git pull', { cwd: localPath });
  }

  log(`${label}: Cloning ${repoUrl} to ${localPath}...`);
  const parentDir = dirname(localPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  return execCmd(`git clone ${repoUrl} ${localPath}`);
}

function main() {
  log('Initializing repositories...');

  const wikiSuccess = ensureRepo(WIKI_REPO_URL, WIKI_LOCAL_PATH, 'Wiki repo');
  const workSuccess = ensureRepo(WORK_REPO_URL, WORK_REPO_LOCAL_PATH, 'Work repo');

  if (wikiSuccess && workSuccess) {
    log('Repository initialization completed');
    process.exit(0);
  } else {
    log('Repository initialization completed with warnings');
    process.exit(0);
  }
}

main();
