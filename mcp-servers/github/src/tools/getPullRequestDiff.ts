import { z } from 'zod';
import { getOctokit } from '../client.js';

export const getPullRequestDiffTool = {
  name: 'getPullRequestDiff',
  description: 'Get the diff of a pull request',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    pullNumber: z.number().describe('Pull request number'),
  },
  handler: async ({
    owner,
    repo,
    pullNumber,
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
  }) => {
    const octokit = getOctokit();

    const { data: diff } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: { format: 'diff' },
    });

    return {
      content: [{ type: 'text' as const, text: diff as unknown as string }],
    };
  },
};
