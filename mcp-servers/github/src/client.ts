import { Octokit } from '@octokit/rest';

let octokitInstance: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!octokitInstance) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    octokitInstance = new Octokit({ auth: token });
  }
  return octokitInstance;
}
