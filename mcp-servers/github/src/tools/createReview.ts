import { z } from 'zod';
import { getOctokit } from '../client.js';

export const createReviewTool = {
  name: 'createReview',
  description: 'Submit a review on a pull request',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    pullNumber: z.number().describe('Pull request number'),
    event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe('Review action'),
    body: z.string().describe('Review body'),
  },
  handler: async ({
    owner,
    repo,
    pullNumber,
    event,
    body,
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    body: string;
  }) => {
    const octokit = getOctokit();

    const { data: review } = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event,
      body,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: review.id,
            state: review.state,
            htmlUrl: review.html_url,
          }),
        },
      ],
    };
  },
};
