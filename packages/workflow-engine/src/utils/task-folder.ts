import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('task-folder');

const STAGE_FILES: Record<string, string> = {
  analysis: '01-analysis.md',
  design: '02-design.md',
  review: '03-review.md',
  test: '04-test.md',
  memory: '99-memory.md',
};

export async function createTaskFolder(
  issueKey: string,
  summary: string,
  basePath?: string
): Promise<string> {
  const base = basePath || process.cwd();
  const folderPath = path.join(base, 'docs', 'plans', issueKey);

  await fs.mkdir(folderPath, { recursive: true });

  const briefPath = path.join(folderPath, '00-brief.md');
  const briefContent = `# ${issueKey}: ${summary}\n\n**Created**: ${new Date().toISOString()}\n\n## Description\n\n_Populated during Analyse phase._\n`;

  // Only write if it does not already exist
  await fs.writeFile(briefPath, briefContent, { flag: 'wx' }).catch(() => {
    // Brief already exists — skip
  });

  logger.info({ issueKey, folderPath }, 'Task folder initialized');
  return folderPath;
}

export async function writeStageArtifact(
  issueKey: string,
  stage: keyof typeof STAGE_FILES,
  content: string,
  basePath?: string
): Promise<void> {
  const base = basePath || process.cwd();
  const folderPath = path.join(base, 'docs', 'plans', issueKey);
  const fileName = STAGE_FILES[stage] || `${stage}.md`;
  const filePath = path.join(folderPath, fileName);

  await fs.writeFile(filePath, content, 'utf-8');
  logger.info({ issueKey, stage, filePath }, 'Stage artifact written');
}
