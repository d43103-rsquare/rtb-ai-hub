import { MockJiraStore } from './store';

const store = new MockJiraStore();

console.log('Seeding mock Jira data...');

// Bug ticket — matches the bug-fix demo scenario
const bug1 = store.createIssue({
  project: 'PROJ',
  issuetype: 'Bug',
  summary: 'API returns 500 on empty payload',
  description: `## Bug Report\n### Steps to reproduce\n1. Send POST /api/data with empty body\n2. Observe 500 Internal Server Error\n\n### Expected\n400 Bad Request with validation error\n\n### Actual\n500 with stack trace:\n\`\`\`\nTypeError: Cannot destructure property 'name' of undefined\n  at processData (src/handlers/data.ts:42)\n\`\`\`\n\n### Environment\n- Server: int\n- Endpoint: POST /api/data`,
  labels: ['bug', 'api'],
  priority: 'Critical',
});
console.log(`  Created: ${bug1.key} — ${bug1.fields.summary}`);

// Feature ticket
const feat1 = store.createIssue({
  project: 'PROJ',
  issuetype: 'Story',
  summary: 'Building info API development',
  description: 'Develop REST API for building master data CRUD operations.',
  labels: ['feature', 'api', 'building'],
  priority: 'High',
});
console.log(`  Created: ${feat1.key} — ${feat1.fields.summary}`);

// Task ticket — transition to In Progress and add a comment
const task1 = store.createIssue({
  project: 'PROJ',
  issuetype: 'Task',
  summary: 'Add pagination to property search',
  description: 'Implement cursor-based pagination for the property search endpoint.',
  labels: ['enhancement'],
  priority: 'Medium',
});
const trans = store.getTransitions(task1.key);
const toInProgress = trans.find(t => t.name === 'In Progress');
if (toInProgress) {
  store.transitionIssue(task1.key, toInProgress.id);
}
store.addComment(task1.key, 'Started implementing cursor-based pagination.');
console.log(`  Created: ${task1.key} — ${task1.fields.summary} (In Progress)`);

console.log(`\nDone! ${store.listAll().length} issues created.`);
