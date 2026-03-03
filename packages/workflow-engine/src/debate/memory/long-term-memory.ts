/**
 * Long-term Memory — Past Debate Retrieval
 *
 * Finds similar past debates by topic using pg_trgm similarity search.
 * Used to inject relevant historical context into new debates.
 */

import { createLogger } from '@rtb-ai-hub/shared';
import { Database } from '../../clients/database';

const logger = createLogger('long-term-memory');

export type PastDebateSummary = {
  id: string;
  topic: string;
  consensusSummary: string;
  tags: string[];
  similarity: number;
  createdAt: string;
};

/**
 * Find past debates similar to the given topic.
 *
 * Uses PostgreSQL pg_trgm similarity for fuzzy text matching.
 * Falls back to ILIKE if pg_trgm extension is not available.
 */
export async function findSimilarDebates(
  db: Database,
  topic: string,
  options?: { limit?: number; minSimilarity?: number }
): Promise<PastDebateSummary[]> {
  const limit = options?.limit ?? 3;
  const minSimilarity = options?.minSimilarity ?? 0.2;

  try {
    // Try pg_trgm similarity search first
    const rows = await db.query(
      `SELECT id, config->>'topic' AS topic, consensus_summary, tags,
              similarity(config->>'topic', $1) AS sim, created_at
       FROM debate_sessions
       WHERE consensus_summary IS NOT NULL
         AND similarity(config->>'topic', $1) > $2
       ORDER BY sim DESC
       LIMIT $3`,
      [topic, minSimilarity, limit]
    );

    if (rows && rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.id,
        topic: r.topic ?? '',
        consensusSummary: r.consensus_summary ?? '',
        tags: Array.isArray(r.tags) ? r.tags : [],
        similarity: parseFloat(r.sim ?? '0'),
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      }));
    }

    return [];
  } catch (err) {
    // pg_trgm not available — fallback to ILIKE keyword search
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'pg_trgm search failed — falling back to ILIKE'
    );

    return findSimilarDebatesFallback(db, topic, limit);
  }
}

async function findSimilarDebatesFallback(
  db: Database,
  topic: string,
  limit: number
): Promise<PastDebateSummary[]> {
  // Extract significant keywords (3+ chars) for ILIKE search
  const keywords = topic
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  const conditions = keywords.map((_, i) => `config->>'topic' ILIKE $${i + 1}`);
  const params = keywords.map((kw) => `%${kw}%`);

  try {
    const rows = await db.query(
      `SELECT id, config->>'topic' AS topic, consensus_summary, tags, created_at
       FROM debate_sessions
       WHERE consensus_summary IS NOT NULL
         AND (${conditions.join(' OR ')})
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );

    if (!rows) return [];

    return rows.map((r: any) => ({
      id: r.id,
      topic: r.topic ?? '',
      consensusSummary: r.consensus_summary ?? '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      similarity: 0, // ILIKE doesn't provide similarity score
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    }));
  } catch (error) {
    logger.error({ error }, 'ILIKE fallback search failed');
    return [];
  }
}

/**
 * Extract tags from debate topic and outcome for indexing.
 * Simple keyword extraction — no AI needed.
 */
export function extractDebateTags(topic: string, decision?: string): string[] {
  const text = `${topic} ${decision ?? ''}`.toLowerCase();
  const tags: string[] = [];

  const tagPatterns: Record<string, RegExp> = {
    'frontend': /프론트엔드|frontend|react|vue|ui|ux|component/,
    'backend': /백엔드|backend|api|서버|server|database|db/,
    'infra': /인프라|infrastructure|devops|deploy|배포|ci\/cd|kubernetes|docker/,
    'security': /보안|security|auth|인증|인가/,
    'performance': /성능|performance|최적화|optimization|캐시|cache/,
    'design': /디자인|design|figma|ui\/ux/,
    'testing': /테스트|test|qa|품질/,
    'architecture': /아키텍처|architecture|설계|구조|패턴|pattern/,
    'data': /데이터|data|스키마|schema|migration/,
    'mobile': /모바일|mobile|앱|app|ios|android/,
  };

  for (const [tag, pattern] of Object.entries(tagPatterns)) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }

  return tags;
}
