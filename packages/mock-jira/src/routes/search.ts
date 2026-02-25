import { Router, Request, Response } from 'express';
import { MockJiraStore, SearchQuery } from '../store';

/**
 * Parse simple JQL into a SearchQuery object.
 * Supports: project = X, status = "X", issuetype = X combined with AND.
 */
function parseJql(jql: string): SearchQuery {
  const query: SearchQuery = {};

  const projectMatch = jql.match(/project\s*=\s*"?(\w+)"?/i);
  if (projectMatch) query.project = projectMatch[1];

  const statusMatch = jql.match(/status\s*=\s*"([^"]+)"/i);
  if (statusMatch) query.status = statusMatch[1];

  const issuetypeMatch = jql.match(/issuetype\s*=\s*"?(\w+)"?/i);
  if (issuetypeMatch) query.issuetype = issuetypeMatch[1];

  return query;
}

export function searchRouter(store: MockJiraStore): Router {
  const router = Router();

  // GET /search — JQL search
  router.get('/search', (req: Request, res: Response) => {
    const jql = req.query.jql as string | undefined;

    let issues;
    if (jql) {
      const query = parseJql(jql);
      issues = store.search(query);
    } else {
      issues = store.listAll();
    }

    res.json({
      startAt: 0,
      maxResults: issues.length,
      total: issues.length,
      issues,
    });
  });

  return router;
}
