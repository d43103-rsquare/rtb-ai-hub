import { createLogger, requireEnv } from '@rtb-ai-hub/shared';

const logger = createLogger('jira-client');

interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
  };
}

export class JiraClient {
  private host: string;
  private email: string;
  private apiToken: string;
  private baseUrl: string;

  constructor() {
    this.host = requireEnv('JIRA_HOST');
    this.email = requireEnv('JIRA_EMAIL');
    this.apiToken = requireEnv('JIRA_API_TOKEN');
    this.baseUrl = `https://${this.host}/rest/api/3`;
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const url = `${this.baseUrl}/issue/${issueKey}/transitions`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { transitions: JiraTransition[] };
      return data.transitions;
    } catch (error) {
      logger.error({ error, issueKey }, 'Failed to get Jira transitions');
      throw error;
    }
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const url = `${this.baseUrl}/issue/${issueKey}/transitions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transition: {
            id: transitionId,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      logger.info({ issueKey, transitionId }, 'Jira issue transitioned successfully');
    } catch (error) {
      logger.error({ error, issueKey, transitionId }, 'Failed to transition Jira issue');
      throw error;
    }
  }

  async transitionToStatus(issueKey: string, targetStatusName: string): Promise<boolean> {
    try {
      const transitions = await this.getTransitions(issueKey);
      const targetTransition = transitions.find((t) => t.to.name === targetStatusName);

      if (!targetTransition) {
        logger.warn(
          { issueKey, targetStatusName, availableTransitions: transitions.map((t) => t.to.name) },
          'Target status not found in available transitions'
        );
        return false;
      }

      await this.transitionIssue(issueKey, targetTransition.id);
      return true;
    } catch (error) {
      logger.error({ error, issueKey, targetStatusName }, 'Failed to transition to status');
      throw error;
    }
  }
}
