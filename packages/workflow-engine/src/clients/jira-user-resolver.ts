import { createLogger, getEnv } from '@rtb-ai-hub/shared';

const logger = createLogger('jira-user-resolver');

interface JiraUser {
  accountId: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
}

export async function resolveJiraUserByEmail(email: string): Promise<JiraUser | null> {
  const jiraHost = getEnv('JIRA_HOST', '');
  const jiraEmail = getEnv('JIRA_EMAIL', '');
  const jiraApiToken = getEnv('JIRA_API_TOKEN', '');

  if (!jiraHost || !jiraEmail || !jiraApiToken) {
    logger.warn('Jira credentials not configured, skipping user resolution');
    return null;
  }

  try {
    const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
    const response = await fetch(
      `https://${jiraHost}/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      logger.error({ status: response.status, email }, 'Jira user search failed');
      return null;
    }

    const users = (await response.json()) as JiraUser[];
    const match = users.find(
      (u) => u.emailAddress?.toLowerCase() === email.toLowerCase() && u.active
    );

    if (match) {
      logger.info({ email, accountId: match.accountId }, 'Jira user resolved');
    } else {
      logger.warn({ email, resultCount: users.length }, 'No matching Jira user found');
    }

    return match || null;
  } catch (error) {
    logger.error({ error, email }, 'Failed to resolve Jira user');
    return null;
  }
}
