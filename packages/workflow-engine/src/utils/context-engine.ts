import { eq } from 'drizzle-orm';
import { createLogger, generateId, dbSchema } from '@rtb-ai-hub/shared';
import { database } from '../clients/database';

const { contextLinks } = dbSchema;

const logger = createLogger('context-engine');

export type ContextLink = typeof contextLinks.$inferSelect;

export type ContextUpdate = {
  jiraKey: string;
  env?: string;
  jiraUrl?: string;
  summary?: string;
  status?: string;
  figmaFileKey?: string;
  figmaNodeIds?: string[];
  figmaUrl?: string;
  githubRepo?: string;
  githubBranch?: string;
  githubPrNumber?: number;
  githubPrUrl?: string;
  previewId?: string;
  previewWebUrl?: string;
  previewApiUrl?: string;
  deployment?: { env: string; timestamp: string; success: boolean };
  slackThreadTs?: string;
  slackChannelId?: string;
  datadogIncidentId?: string;
  teamMembers?: Record<string, string>;
};

const JIRA_KEY_REGEX = /[A-Z][A-Z0-9]+-\d+/;

export function extractJiraKey(text: string): string | null {
  const match = text.match(JIRA_KEY_REGEX);
  return match ? match[0] : null;
}

export async function getContext(jiraKey: string): Promise<ContextLink | null> {
  try {
    const rows = await database.drizzle
      .select()
      .from(contextLinks)
      .where(eq(contextLinks.jiraKey, jiraKey))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), jiraKey },
      'Failed to get context'
    );
    return null;
  }
}

export async function getContextByBranch(branch: string): Promise<ContextLink | null> {
  try {
    const jiraKey = extractJiraKey(branch);
    if (!jiraKey) return null;
    return getContext(jiraKey);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), branch },
      'Failed to get context by branch'
    );
    return null;
  }
}

export async function getContextByPr(prNumber: number): Promise<ContextLink | null> {
  try {
    const rows = await database.drizzle.select().from(contextLinks).limit(100);

    for (const row of rows) {
      const prNumbers = (row.githubPrNumbers as number[]) || [];
      if (prNumbers.includes(prNumber)) {
        return row;
      }
    }
    return null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), prNumber },
      'Failed to get context by PR'
    );
    return null;
  }
}

export async function updateContext(update: ContextUpdate): Promise<ContextLink | null> {
  try {
    const existing = await getContext(update.jiraKey);

    if (!existing) {
      return await createContext(update);
    }

    return await mergeContext(existing, update);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), jiraKey: update.jiraKey },
      'Failed to update context — fire-and-forget'
    );
    return null;
  }
}

async function createContext(update: ContextUpdate): Promise<ContextLink | null> {
  const id = generateId('ctx');
  const now = new Date();

  const values: typeof contextLinks.$inferInsert = {
    id,
    jiraKey: update.jiraKey,
    env: update.env || 'int',
    jiraUrl: update.jiraUrl ?? null,
    summary: update.summary ?? null,
    status: update.status ?? null,
    figmaFileKey: update.figmaFileKey ?? null,
    figmaNodeIds: update.figmaNodeIds ?? null,
    figmaUrl: update.figmaUrl ?? null,
    githubRepo: update.githubRepo ?? null,
    githubBranch: update.githubBranch ?? null,
    githubPrNumbers: update.githubPrNumber ? [update.githubPrNumber] : [],
    githubPrUrls: update.githubPrUrl ? [update.githubPrUrl] : [],
    previewId: update.previewId ?? null,
    previewWebUrl: update.previewWebUrl ?? null,
    previewApiUrl: update.previewApiUrl ?? null,
    deployments: update.deployment ? [update.deployment] : [],
    slackThreadTs: update.slackThreadTs ?? null,
    slackChannelId: update.slackChannelId ?? null,
    datadogIncidentIds: update.datadogIncidentId ? [update.datadogIncidentId] : [],
    teamMembers: update.teamMembers ?? {},
    createdAt: now,
    updatedAt: now,
  };

  await database.drizzle.insert(contextLinks).values(values);

  return { ...values, createdAt: now, updatedAt: now } as ContextLink;
}

async function mergeContext(
  existing: ContextLink,
  update: ContextUpdate
): Promise<ContextLink | null> {
  const existingPrNumbers = (existing.githubPrNumbers as number[]) || [];
  const existingPrUrls = (existing.githubPrUrls as string[]) || [];
  const existingDeployments = (existing.deployments as Record<string, unknown>[]) || [];
  const existingIncidentIds = (existing.datadogIncidentIds as string[]) || [];
  const existingTeamMembers = (existing.teamMembers as Record<string, string>) || {};

  const mergedPrNumbers = update.githubPrNumber
    ? [...new Set([...existingPrNumbers, update.githubPrNumber])]
    : existingPrNumbers;

  const mergedPrUrls = update.githubPrUrl
    ? [...new Set([...existingPrUrls, update.githubPrUrl])]
    : existingPrUrls;

  const mergedDeployments = update.deployment
    ? [...existingDeployments, update.deployment]
    : existingDeployments;

  const mergedIncidentIds = update.datadogIncidentId
    ? [...new Set([...existingIncidentIds, update.datadogIncidentId])]
    : existingIncidentIds;

  const mergedTeamMembers = update.teamMembers
    ? { ...existingTeamMembers, ...update.teamMembers }
    : existingTeamMembers;

  const set: Record<string, unknown> = {
    updatedAt: new Date(),
    githubPrNumbers: mergedPrNumbers,
    githubPrUrls: mergedPrUrls,
    deployments: mergedDeployments,
    datadogIncidentIds: mergedIncidentIds,
    teamMembers: mergedTeamMembers,
  };

  if (update.env !== undefined) set.env = update.env;
  if (update.jiraUrl !== undefined) set.jiraUrl = update.jiraUrl;
  if (update.summary !== undefined) set.summary = update.summary;
  if (update.status !== undefined) set.status = update.status;
  if (update.figmaFileKey !== undefined) set.figmaFileKey = update.figmaFileKey;
  if (update.figmaNodeIds !== undefined) set.figmaNodeIds = update.figmaNodeIds;
  if (update.figmaUrl !== undefined) set.figmaUrl = update.figmaUrl;
  if (update.githubRepo !== undefined) set.githubRepo = update.githubRepo;
  if (update.githubBranch !== undefined) set.githubBranch = update.githubBranch;
  if (update.previewId !== undefined) set.previewId = update.previewId;
  if (update.previewWebUrl !== undefined) set.previewWebUrl = update.previewWebUrl;
  if (update.previewApiUrl !== undefined) set.previewApiUrl = update.previewApiUrl;
  if (update.slackThreadTs !== undefined) set.slackThreadTs = update.slackThreadTs;
  if (update.slackChannelId !== undefined) set.slackChannelId = update.slackChannelId;

  await database.drizzle.update(contextLinks).set(set).where(eq(contextLinks.id, existing.id));

  return { ...existing, ...set } as ContextLink;
}
