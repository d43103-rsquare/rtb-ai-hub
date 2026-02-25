import { createApp } from './app';
import { MockJiraStore } from './store';

const PORT = parseInt(process.env.MOCK_JIRA_PORT || '3001', 10);

const store = new MockJiraStore();
const app = createApp(store);

app.listen(PORT, () => {
  const issues = store.listAll();
  console.log(`Mock Jira server running on http://localhost:${PORT}`);
  console.log(`  Issues in store: ${issues.length}`);
  console.log(`  UI: http://localhost:${PORT}/`);
  console.log(`  API: http://localhost:${PORT}/rest/api/3/`);
  if (issues.length === 0) {
    console.log(`  Run "pnpm --filter @rtb-ai-hub/mock-jira run seed" to create demo data`);
  }
});
