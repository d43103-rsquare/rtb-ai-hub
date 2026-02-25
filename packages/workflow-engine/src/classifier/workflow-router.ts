import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';
import { createLogger } from '@rtb-ai-hub/shared';
import { classifyTicket, TicketCategory } from './ticket-classifier';
import { processJiraAutoDev } from '../workflows/jira-auto-dev';
import { processBugFix } from '../workflows/bug-fix';

const logger = createLogger('workflow-router');

export async function routeJiraEvent(
  event: JiraWebhookEvent,
  userId: string | null,
  env: Environment
) {
  const category = classifyTicket(event);
  logger.info(
    { issueKey: event.issueKey, issueType: event.issueType, category },
    'Ticket classified'
  );

  switch (category) {
    case TicketCategory.BUG:
      return processBugFix(event, userId, env);
    case TicketCategory.FEATURE:
    case TicketCategory.POLICY:
    default:
      return processJiraAutoDev(event, userId, env);
  }
}
