import { z } from 'zod';
import { getOctokit } from '../client.js';

export const getPullRequestTool = {
  name: 'getPullRequest',
  description: 'Get details of a pull request',
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

    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            url: pr.html_url,
            head: { ref: pr.head.ref, sha: pr.head.sha },
            base: { ref: pr.base.ref },
            user: pr.user?.login,
            mergeable: pr.mergeable,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
          }),
        },
      ],
    };
  },
};
