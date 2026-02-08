import { z } from 'zod';
import { getOctokit } from '../client.js';

export const searchIssuesTool = {
  name: 'searchIssues',
  description: 'Search GitHub issues and pull requests',
  schema: {
    query: z.string().describe('Search query (GitHub search syntax)'),
    sort: z.enum(['comments', 'reactions', 'created', 'updated']).optional().describe('Sort field'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
  },
  handler: async ({
    query,
    sort,
    order,
  }: {
    query: string;
    sort?: 'comments' | 'reactions' | 'created' | 'updated';
    order?: 'asc' | 'desc';
  }) => {
    const octokit = getOctokit();

    const { data: results } = await octokit.search.issuesAndPullRequests({
      q: query,
      sort,
      order,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            totalCount: results.total_count,
            items: results.items.map((item) => ({
              number: item.number,
              title: item.title,
              state: item.state,
              url: item.html_url,
              user: item.user?.login,
              labels: item.labels.map((l) => (typeof l === 'string' ? l : l.name)),
              createdAt: item.created_at,
              updatedAt: item.updated_at,
            })),
          }),
        },
      ],
    };
  },
};
