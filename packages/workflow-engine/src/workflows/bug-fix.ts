/**
 * Bug Fix Workflow — stub
 *
 * Full implementation will be added in Task 4.
 * This stub ensures the workflow router can import the module.
 */

import { createLogger } from '@rtb-ai-hub/shared';
import type { JiraWebhookEvent, Environment } from '@rtb-ai-hub/shared';

const logger = createLogger('bug-fix-workflow');

export async function processBugFix(
  event: JiraWebhookEvent,
  userId: string | null,
  env: Environment
) {
  logger.warn(
    { issueKey: event.issueKey, env },
    'Bug fix workflow not yet implemented — falling back to stub'
  );
  return { dispatched: false, reason: 'not-implemented' };
}
