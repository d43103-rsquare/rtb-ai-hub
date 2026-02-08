import { z } from 'zod';
import { getOctokit } from '../client.js';

export const createReviewCommentTool = {
  name: 'createReviewComment',
  description: 'Add an inline review comment on a pull request',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    pullNumber: z.number().describe('Pull request number'),
    body: z.string().describe('Comment body'),
    path: z.string().describe('File path to comment on'),
    line: z.number().describe('Line number to comment on'),
  },
  handler: async ({
    owner,
    repo,
    pullNumber,
    body,
    path,
    line,
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    path: string;
    line: number;
  }) => {
    const octokit = getOctokit();

    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const { data: comment } = await octokit.pulls.createReviewComment({
      owner,
      repo,
      pull_number: pullNumber,
      body,
      path,
      line,
      commit_id: pr.head.sha,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: comment.id,
            url: comment.html_url,
            path: comment.path,
            line: comment.line,
          }),
        },
      ],
    };
  },
};
