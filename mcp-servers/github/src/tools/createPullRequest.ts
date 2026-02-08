import { z } from 'zod';
import { getOctokit } from '../client.js';

export const createPullRequestTool = {
  name: 'createPullRequest',
  description: 'Create a pull request',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    title: z.string().describe('PR title'),
    body: z.string().describe('PR description'),
    head: z.string().describe('Head branch'),
    base: z.string().describe('Base branch'),
  },
  handler: async ({
    owner,
    repo,
    title,
    body,
    head,
    base,
  }: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }) => {
    const octokit = getOctokit();

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            number: pr.number,
            url: pr.html_url,
            title: pr.title,
            state: pr.state,
          }),
        },
      ],
    };
  },
};
