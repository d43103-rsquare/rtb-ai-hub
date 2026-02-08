import { z } from 'zod';
import { getOctokit } from '../client.js';

export const createBranchTool = {
  name: 'createBranch',
  description: 'Create a new git branch in a GitHub repository',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    branch: z.string().describe('New branch name'),
    fromBranch: z.string().optional().describe('Base branch (defaults to default branch)'),
  },
  handler: async ({
    owner,
    repo,
    branch,
    fromBranch,
  }: {
    owner: string;
    repo: string;
    branch: string;
    fromBranch?: string;
  }) => {
    const octokit = getOctokit();

    const baseBranch = fromBranch || (await octokit.repos.get({ owner, repo })).data.default_branch;
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    const { data: newRef } = await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: ref.object.sha,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            branch,
            sha: newRef.object.sha,
            baseBranch,
          }),
        },
      ],
    };
  },
};
