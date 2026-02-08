import { z } from 'zod';
import { getOctokit } from '../client.js';

export const createIssueCommentTool = {
  name: 'createIssueComment',
  description: 'Add a comment to an issue or pull request',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    issueNumber: z.number().describe('Issue or PR number'),
    body: z.string().describe('Comment body'),
  },
  handler: async ({
    owner,
    repo,
    issueNumber,
    body,
  }: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }) => {
    const octokit = getOctokit();

    const { data: comment } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            id: comment.id,
            url: comment.html_url,
            createdAt: comment.created_at,
          }),
        },
      ],
    };
  },
};
