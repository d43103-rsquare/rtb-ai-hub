import { z } from 'zod';
import { getOctokit } from '../client.js';

export const mergePullRequestTool = {
  name: 'mergePullRequest',
  description: 'Merge a pull request',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    pullNumber: z.number().describe('Pull request number'),
    mergeMethod: z
      .enum(['merge', 'squash', 'rebase'])
      .optional()
      .describe('Merge method (defaults to merge)'),
  },
  handler: async ({
    owner,
    repo,
    pullNumber,
    mergeMethod,
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
  }) => {
    const octokit = getOctokit();

    const { data: result } = await octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: mergeMethod || 'merge',
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            merged: result.merged,
            sha: result.sha,
            message: result.message,
          }),
        },
      ],
    };
  },
};
