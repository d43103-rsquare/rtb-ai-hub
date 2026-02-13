import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@rtb-ai-hub/shared';
import { WikiKnowledge } from '../utils/wiki-knowledge';
import { internalAuth } from '../middleware/internal-auth';

const logger = createLogger('knowledge-api');

let wikiInstance: WikiKnowledge | null = null;

function getWiki(): WikiKnowledge {
  if (!wikiInstance) {
    wikiInstance = new WikiKnowledge();
  }
  return wikiInstance;
}

export function resetWikiInstance(): void {
  wikiInstance = null;
}

export function createKnowledgeRouter(): Router {
  const router = Router();

  router.post('/api/knowledge/search', internalAuth, async (req, res) => {
    try {
      const { query, maxDocs } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'query string is required' });
        return;
      }

      const wiki = getWiki();
      if (!wiki.isAvailable) {
        res.json({ context: '', tables: [], domains: [], available: false });
        return;
      }

      const context = await wiki.searchForContext(query, maxDocs ?? 4);
      const tables = wiki.extractTableNames(query);
      const domains = wiki.extractDomains(query);

      res.json({ context, tables, domains });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Search failed'
      );
      res.status(500).json({ error: 'Knowledge search failed' });
    }
  });

  router.get('/api/knowledge/table/:tableName', internalAuth, async (req, res) => {
    try {
      const { tableName } = req.params;
      const wiki = getWiki();

      if (!wiki.isAvailable) {
        res.json({ content: '', found: false, available: false });
        return;
      }

      const content = await wiki.getTableDoc(tableName);
      res.json({ content: content ?? '', found: content !== null });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Table lookup failed'
      );
      res.status(500).json({ error: 'Table lookup failed' });
    }
  });

  router.get('/api/knowledge/domain/:domainKey', internalAuth, async (req, res) => {
    try {
      const { domainKey } = req.params;
      const wiki = getWiki();

      if (!wiki.isAvailable) {
        res.json({ content: '', found: false, available: false });
        return;
      }

      const content = await wiki.getDomainOverview(domainKey);
      res.json({ content: content ?? '', found: content !== null });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Domain lookup failed'
      );
      res.status(500).json({ error: 'Domain lookup failed' });
    }
  });

  router.post('/api/knowledge/refine', internalAuth, async (req, res) => {
    try {
      const { requirement, jiraKey } = req.body;

      if (!requirement || typeof requirement !== 'string') {
        res.status(400).json({ error: 'requirement string is required' });
        return;
      }

      const wiki = getWiki();
      const searchText = jiraKey ? `${jiraKey} ${requirement}` : requirement;

      let wikiContext = '';
      let suggestedTables: string[] = [];

      if (wiki.isAvailable) {
        wikiContext = await wiki.searchForContext(searchText, 6);
        suggestedTables = wiki.extractTableNames(searchText);
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.json({
          refinedSpec: requirement,
          wikiContext,
          suggestedTables,
          note: 'ANTHROPIC_API_KEY not configured — returning unrefined requirement',
        });
        return;
      }

      const anthropic = new Anthropic({ apiKey });

      const systemPrompt = `You are an RTB domain expert. Refine the given requirement into a precise technical specification.
Use the provided wiki context (DB schemas, domain knowledge) to:
1. Identify exact table names and column names
2. Clarify ambiguous business terms using RTB domain definitions
3. Add technical constraints and edge cases
4. Suggest the implementation approach

Output a refined specification in Korean, structured with clear sections.`;

      const userMessage = wikiContext
        ? `## Wiki Context\n\n${wikiContext}\n\n## Original Requirement\n\n${requirement}${jiraKey ? `\n\nJira Key: ${jiraKey}` : ''}`
        : `## Original Requirement\n\n${requirement}${jiraKey ? `\n\nJira Key: ${jiraKey}` : ''}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const refinedSpec = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      res.json({ refinedSpec, wikiContext, suggestedTables });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Refine failed'
      );
      res.status(500).json({ error: 'Requirement refinement failed' });
    }
  });

  return router;
}
