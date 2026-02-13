import { eq, desc, sql } from 'drizzle-orm';
import { createLogger, dbSchema } from '@rtb-ai-hub/shared';
import { database } from '../clients/database';
import type { DecisionCandidate, DecisionSource } from './decision-detector';

const { decisionJournal } = dbSchema;

const logger = createLogger('decision-store');

export type DecisionRecord = typeof decisionJournal.$inferSelect;

export async function saveDecision(
  candidate: DecisionCandidate,
  source: DecisionSource,
  env: string
): Promise<string> {
  try {
    const [row] = await database.drizzle
      .insert(decisionJournal)
      .values({
        title: candidate.title,
        decision: candidate.decision,
        rationale: candidate.rationale || null,
        sourceType: source.type,
        sourceId: source.id,
        sourceUrl: source.url,
        participants: candidate.participants,
        relatedJiraKeys: candidate.relatedJiraKeys,
        tags: candidate.tags,
        env,
      })
      .returning({ id: decisionJournal.id });

    logger.info({ decisionId: row.id, sourceId: source.id }, 'Decision saved');
    return row.id;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), sourceId: source.id },
      'Failed to save decision'
    );
    throw error;
  }
}

export async function findRelatedDecisions(tags: string[], limit = 5): Promise<DecisionRecord[]> {
  try {
    if (tags.length === 0) return [];

    return await database.drizzle
      .select()
      .from(decisionJournal)
      .where(sql`${decisionJournal.tags} && ${tags}`)
      .orderBy(desc(decisionJournal.createdAt))
      .limit(limit);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), tags },
      'Failed to find related decisions'
    );
    return [];
  }
}

export async function findDecisionsByJiraKey(jiraKey: string): Promise<DecisionRecord[]> {
  try {
    return await database.drizzle
      .select()
      .from(decisionJournal)
      .where(sql`${decisionJournal.relatedJiraKeys} @> ARRAY[${jiraKey}]::text[]`)
      .orderBy(desc(decisionJournal.createdAt));
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), jiraKey },
      'Failed to find decisions by Jira key'
    );
    return [];
  }
}

export async function getRecentDecisions(days = 7, limit = 20): Promise<DecisionRecord[]> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await database.drizzle
      .select()
      .from(decisionJournal)
      .where(sql`${decisionJournal.createdAt} >= ${since}`)
      .orderBy(desc(decisionJournal.createdAt))
      .limit(limit);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), days },
      'Failed to get recent decisions'
    );
    return [];
  }
}

export async function supersedeDecision(oldId: string, newId: string): Promise<void> {
  try {
    await database.drizzle
      .update(decisionJournal)
      .set({ status: 'superseded', supersededBy: newId, updatedAt: new Date() })
      .where(eq(decisionJournal.id, oldId));

    logger.info({ oldId, newId }, 'Decision superseded');
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), oldId, newId },
      'Failed to supersede decision'
    );
    throw error;
  }
}
