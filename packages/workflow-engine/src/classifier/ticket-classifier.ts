import type { JiraWebhookEvent } from '@rtb-ai-hub/shared';

export enum TicketCategory {
  BUG = 'bug',
  FEATURE = 'feature',
  POLICY = 'policy',
}

const BUG_ISSUE_TYPES = ['bug', '버그', 'defect', 'incident'];
const BUG_LABELS = ['bug', 'bugfix', 'hotfix', 'incident', 'defect'];
const BUG_SUMMARY_PATTERNS = [/\[bug\]/i, /\[hotfix\]/i, /\[incident\]/i, /\[defect\]/i];

const FEATURE_ISSUE_TYPES = ['story', 'task', '스토리', 'epic', 'sub-task', 'improvement'];
const FEATURE_LABELS = ['feature', 'enhancement', 'improvement'];

export function classifyTicket(event: JiraWebhookEvent): TicketCategory {
  // Priority 1: issueType
  const issueType = (event.issueType || '').toLowerCase();
  if (BUG_ISSUE_TYPES.includes(issueType)) return TicketCategory.BUG;
  if (FEATURE_ISSUE_TYPES.includes(issueType)) {
    // Generic types like Task can be overridden by bug labels or summary patterns
    const labels = (event.labels || []).map((l) => l.toLowerCase());
    if (labels.some((l) => BUG_LABELS.includes(l))) return TicketCategory.BUG;
    const summary = event.summary || '';
    if (BUG_SUMMARY_PATTERNS.some((p) => p.test(summary))) return TicketCategory.BUG;
    return TicketCategory.FEATURE;
  }

  // Priority 2: labels
  const labels = (event.labels || []).map((l) => l.toLowerCase());
  if (labels.some((l) => BUG_LABELS.includes(l))) return TicketCategory.BUG;
  if (labels.some((l) => FEATURE_LABELS.includes(l))) return TicketCategory.FEATURE;

  // Priority 3: summary keywords
  const summary = event.summary || '';
  if (BUG_SUMMARY_PATTERNS.some((p) => p.test(summary))) return TicketCategory.BUG;

  // Default: Feature
  return TicketCategory.FEATURE;
}
