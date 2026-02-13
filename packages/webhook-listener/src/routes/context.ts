import { Router } from 'express';
import { createLogger, queryRaw } from '@rtb-ai-hub/shared';

const logger = createLogger('context-api');

export function createContextRouter() {
  const router = Router();

  router.get('/api/context/:jiraKey', async (req, res) => {
    const { jiraKey } = req.params;

    try {
      const rows = await queryRaw('SELECT * FROM context_links WHERE jira_key = $1 LIMIT 1', [
        jiraKey,
      ]);

      if (rows.length === 0) {
        res.status(404).json({ error: `No context found for ${jiraKey}` });
        return;
      }

      res.json(rows[0]);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), jiraKey },
        'Failed to fetch context'
      );
      res.status(500).json({ error: 'Failed to fetch context' });
    }
  });

  return router;
}
