/**
 * Entity Memory — Per-Component Knowledge Accumulation
 *
 * Extracts entity mentions from debate outcomes and stores
 * accumulated knowledge per entity (component, API, module, service).
 * Enables context injection for future debates involving the same entities.
 */

import type { ProviderAdapter } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { Database } from '../../clients/database';

const logger = createLogger('entity-memory');

export type EntityType = 'component' | 'api' | 'module' | 'service';

export type EntityKnowledgeRecord = {
  id: string;
  entityType: EntityType;
  entityName: string;
  knowledge: string;
  sourceDebateId: string;
  sourceTopic: string | null;
  tags: string[];
  mentionCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Extract entity mentions from debate decision text using AI.
 * Returns null on failure (caller can skip entity extraction).
 */
export async function extractEntities(
  adapter: ProviderAdapter,
  decisionText: string,
  topic: string
): Promise<Array<{ entityType: EntityType; entityName: string; knowledge: string }> | null> {
  try {
    const response = await adapter.complete(
      `Topic: ${topic.slice(0, 200)}\n\nDecision:\n${decisionText.slice(0, 2000)}`,
      {
        systemPrompt: `Extract entities (components, APIs, modules, services) mentioned in this debate decision.
For each entity, provide:
- entityType: "component" | "api" | "module" | "service"
- entityName: The name (e.g., "UserAuth", "PaymentAPI", "DatabaseModule")
- knowledge: A 1-2 sentence summary of what was decided about this entity

Respond ONLY with JSON array:
[{ "entityType": "...", "entityName": "...", "knowledge": "..." }]
If no entities found, return: []`,
        maxTokens: 500,
        temperature: 0.1,
      }
    );

    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validTypes: EntityType[] = ['component', 'api', 'module', 'service'];
    return parsed
      .filter(
        (e: any) =>
          validTypes.includes(e.entityType) &&
          typeof e.entityName === 'string' &&
          typeof e.knowledge === 'string'
      )
      .map((e: any) => ({
        entityType: e.entityType as EntityType,
        entityName: String(e.entityName),
        knowledge: String(e.knowledge),
      }));
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Entity extraction failed'
    );
    return null;
  }
}

/**
 * Save or merge entity knowledge into the database.
 * If an entity already exists, appends knowledge and increments mention count.
 */
export async function saveEntityKnowledge(
  db: Database,
  debateId: string,
  topic: string,
  entities: Array<{ entityType: EntityType; entityName: string; knowledge: string }>,
  tags?: string[]
): Promise<void> {
  for (const entity of entities) {
    try {
      // Upsert: update if same entity type+name exists, insert otherwise
      await db.query(
        `INSERT INTO entity_knowledge (entity_type, entity_name, knowledge, source_debate_id, source_topic, tags, mention_count)
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         ON CONFLICT (entity_type, entity_name)
         DO UPDATE SET
           knowledge = entity_knowledge.knowledge || E'\\n---\\n' || $3,
           source_debate_id = $4,
           source_topic = $5,
           mention_count = entity_knowledge.mention_count + 1,
           updated_at = NOW()`,
        [
          entity.entityType,
          entity.entityName,
          entity.knowledge,
          debateId,
          topic.slice(0, 500),
          tags ? JSON.stringify(tags) : '[]',
        ]
      );
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), entity: entity.entityName },
        'Failed to save entity knowledge'
      );
      // Continue with other entities
    }
  }

  logger.info(
    { debateId, entityCount: entities.length },
    'Entity knowledge saved'
  );
}

/**
 * Find knowledge about entities mentioned in a topic.
 * Used to inject relevant entity context into new debates.
 */
export async function findRelevantEntities(
  db: Database,
  topic: string,
  options?: { limit?: number }
): Promise<EntityKnowledgeRecord[]> {
  const limit = options?.limit ?? 5;

  // Extract potential entity names from topic (capitalized words, CamelCase)
  const potentialNames = topic.match(/[A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*/g) ?? [];
  // Also try Korean words (3+ chars)
  const koreanWords = topic.match(/[가-힣]{3,}/g) ?? [];

  const searchTerms = [...new Set([...potentialNames, ...koreanWords])];

  if (searchTerms.length === 0) return [];

  const conditions = searchTerms.map((_, i) => `entity_name ILIKE $${i + 1}`);
  const params = searchTerms.map((term) => `%${term}%`);

  try {
    const rows = await db.query(
      `SELECT * FROM entity_knowledge
       WHERE ${conditions.join(' OR ')}
       ORDER BY mention_count DESC, updated_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );

    if (!rows) return [];

    return rows.map((r: any) => ({
      id: r.id,
      entityType: r.entity_type as EntityType,
      entityName: r.entity_name,
      knowledge: r.knowledge,
      sourceDebateId: r.source_debate_id,
      sourceTopic: r.source_topic,
      tags: Array.isArray(r.tags) ? r.tags : [],
      mentionCount: r.mention_count ?? 1,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at,
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to find relevant entities');
    return [];
  }
}
