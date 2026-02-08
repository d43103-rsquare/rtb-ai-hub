import { z } from 'zod';
import { getOctokit } from '../client.js';

export const createCommitTool = {
  name: 'createCommit',
  description: 'Create a commit with file changes on a branch',
  schema: {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    branch: z.string().describe('Branch to commit to'),
    message: z.string().describe('Commit message'),
    files: z
      .array(
        z.object({
          path: z.string().describe('File path'),
          content: z.string().describe('File content'),
        })
      )
      .describe('Files to commit'),
  },
  handler: async ({
    owner,
    repo,
    branch,
    message,
    files,
  }: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: Array<{ path: string; content: string }>;
  }) => {
    const octokit = getOctokit();

    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const parentSha = ref.object.sha;

    const { data: parentCommit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: parentSha,
    });

    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        return { path: file.path, sha: blob.sha, mode: '100644' as const, type: 'blob' as const };
      })
    );

    const { data: tree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: parentCommit.tree.sha,
      tree: blobs,
    });

    const { data: commit } = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: [parentSha],
    });

    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.sha,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            sha: commit.sha,
            message: commit.message,
            filesChanged: files.length,
          }),
        },
      ],
    };
  },
};
