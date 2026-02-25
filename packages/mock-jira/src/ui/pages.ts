import { Router, Request, Response } from 'express';
import { MockJiraStore, JiraIssue } from '../store';

// --- Helpers ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(pageTitle: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock Jira — ${escapeHtml(pageTitle)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <nav class="bg-blue-700 text-white px-6 py-3 flex items-center justify-between">
    <a href="/" class="text-xl font-bold">Mock Jira</a>
    <div class="flex gap-4">
      <a href="/" class="hover:underline">Issues</a>
      <a href="/create" class="hover:underline">Create</a>
    </div>
  </nav>
  <main class="max-w-6xl mx-auto p-6">
    ${content}
  </main>
</body>
</html>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    'Open': 'bg-blue-100 text-blue-800',
    'In Progress': 'bg-yellow-100 text-yellow-800',
    'In Review': 'bg-purple-100 text-purple-800',
    'Done': 'bg-green-100 text-green-800',
    'Closed': 'bg-gray-100 text-gray-800',
  };
  const cls = colors[status] ?? 'bg-gray-100 text-gray-800';
  return `<span class="px-2 py-1 rounded-full text-xs font-medium ${cls}">${escapeHtml(status)}</span>`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// --- Page Renderers ---

function issueListPage(issues: JiraIssue[]): string {
  const rows = issues
    .map(
      (issue) => `
      <tr class="border-b hover:bg-gray-50">
        <td class="px-4 py-3"><a href="/issue/${escapeHtml(issue.key)}" class="text-blue-600 hover:underline font-medium">${escapeHtml(issue.key)}</a></td>
        <td class="px-4 py-3">${escapeHtml(issue.fields.issuetype.name)}</td>
        <td class="px-4 py-3">${statusBadge(issue.fields.status.name)}</td>
        <td class="px-4 py-3">${escapeHtml(issue.fields.summary)}</td>
        <td class="px-4 py-3">${escapeHtml(issue.fields.priority.name)}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${formatDate(issue.fields.updated)}</td>
        <td class="px-4 py-3">
          <button
            onclick="sendWebhook('${escapeHtml(issue.key)}')"
            class="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
          >Send Webhook</button>
        </td>
      </tr>`,
    )
    .join('\n');

  const content = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-800">Issues</h1>
      <a href="/create" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create Issue</a>
    </div>
    ${
      issues.length === 0
        ? '<p class="text-gray-500">No issues yet. <a href="/create" class="text-blue-600 hover:underline">Create one</a>.</p>'
        : `
    <div class="bg-white rounded-lg shadow overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Key</th>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Type</th>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Status</th>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Summary</th>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Priority</th>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Updated</th>
            <th class="px-4 py-3 text-sm font-semibold text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    }
    <script>
      async function sendWebhook(issueKey) {
        try {
          const res = await fetch('/mock/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ issueKey, event: 'issue_updated' }),
          });
          const data = await res.json();
          alert(JSON.stringify(data, null, 2));
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    </script>`;

  return layout('Issues', content);
}

function issueDetailPage(issue: JiraIssue, transitions: { id: string; name: string }[]): string {
  const f = issue.fields;

  const commentsHtml =
    f.comment.comments.length === 0
      ? '<p class="text-gray-400 text-sm">No comments yet.</p>'
      : f.comment.comments
          .map(
            (c) => `
        <div class="border rounded p-4 bg-gray-50">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium text-gray-700">${escapeHtml(c.author.displayName)}</span>
            <span class="text-xs text-gray-400">${formatDate(c.created)}</span>
          </div>
          <p class="text-gray-600 whitespace-pre-wrap">${escapeHtml(c.body)}</p>
        </div>`,
          )
          .join('\n');

  const transitionButtons = transitions
    .map(
      (t) => `
      <button
        onclick="doTransition('${escapeHtml(issue.key)}', '${t.id}')"
        class="px-3 py-1 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600"
      >${escapeHtml(t.name)}</button>`,
    )
    .join('\n');

  const labelsHtml =
    f.labels.length > 0
      ? f.labels.map((l) => `<span class="px-2 py-0.5 bg-gray-200 rounded text-xs">${escapeHtml(l)}</span>`).join(' ')
      : '<span class="text-gray-400 text-sm">None</span>';

  const content = `
    <div class="mb-4">
      <a href="/" class="text-blue-600 hover:underline text-sm">&larr; Back to Issues</a>
    </div>

    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">${escapeHtml(issue.key)}: ${escapeHtml(f.summary)}</h1>
          <div class="flex items-center gap-3 mt-2">
            ${statusBadge(f.status.name)}
            <span class="text-sm text-gray-500">${escapeHtml(f.issuetype.name)}</span>
            <span class="text-sm text-gray-500">Priority: ${escapeHtml(f.priority.name)}</span>
          </div>
        </div>
        <button
          onclick="sendWebhook('${escapeHtml(issue.key)}')"
          class="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 shrink-0"
        >Send Webhook</button>
      </div>

      <div class="grid grid-cols-2 gap-4 text-sm mb-6">
        <div><span class="font-medium text-gray-600">Key:</span> ${escapeHtml(issue.key)}</div>
        <div><span class="font-medium text-gray-600">Type:</span> ${escapeHtml(f.issuetype.name)}</div>
        <div><span class="font-medium text-gray-600">Status:</span> ${escapeHtml(f.status.name)}</div>
        <div><span class="font-medium text-gray-600">Priority:</span> ${escapeHtml(f.priority.name)}</div>
        <div><span class="font-medium text-gray-600">Labels:</span> ${labelsHtml}</div>
        <div><span class="font-medium text-gray-600">Created:</span> ${formatDate(f.created)}</div>
        <div><span class="font-medium text-gray-600">Updated:</span> ${formatDate(f.updated)}</div>
      </div>

      <div class="mb-6">
        <h2 class="font-semibold text-gray-700 mb-2">Description</h2>
        <div class="bg-gray-50 rounded p-4 whitespace-pre-wrap text-gray-600">${f.description ? escapeHtml(f.description) : '<span class="text-gray-400">No description.</span>'}</div>
      </div>

      ${
        transitions.length > 0
          ? `
      <div class="mb-6">
        <h2 class="font-semibold text-gray-700 mb-2">Transitions</h2>
        <div class="flex gap-2">${transitionButtons}</div>
      </div>`
          : ''
      }
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="font-semibold text-gray-700 mb-4">Comments</h2>
      <div class="space-y-4">
        ${commentsHtml}
      </div>
    </div>

    <script>
      async function sendWebhook(issueKey) {
        try {
          const res = await fetch('/mock/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ issueKey, event: 'issue_updated' }),
          });
          const data = await res.json();
          alert(JSON.stringify(data, null, 2));
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }

      async function doTransition(issueKey, transitionId) {
        try {
          const res = await fetch('/rest/api/3/issue/' + issueKey + '/transitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transition: { id: transitionId } }),
          });
          if (res.ok) {
            location.reload();
          } else {
            const data = await res.json();
            alert('Transition failed: ' + JSON.stringify(data));
          }
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    </script>`;

  return layout(issue.key, content);
}

function createIssuePage(): string {
  const content = `
    <div class="mb-4">
      <a href="/" class="text-blue-600 hover:underline text-sm">&larr; Back to Issues</a>
    </div>

    <div class="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h1 class="text-2xl font-bold text-gray-800 mb-6">Create Issue</h1>

      <form id="createForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Project Key</label>
          <input type="text" name="project" value="PROJ" required
            class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
          <select name="issuetype" required
            class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="Bug">Bug</option>
            <option value="Story" selected>Story</option>
            <option value="Task">Task</option>
            <option value="Sub-task">Sub-task</option>
            <option value="Epic">Epic</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Summary</label>
          <input type="text" name="summary" required
            class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea name="description" rows="4"
            class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Labels <span class="text-gray-400">(comma-separated)</span></label>
          <input type="text" name="labels"
            class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select name="priority"
            class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium" selected>Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div class="flex gap-3 pt-2">
          <button type="submit"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
          <a href="/" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</a>
        </div>
      </form>
    </div>

    <script>
      document.getElementById('createForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const labelsRaw = form.labels.value.trim();
        const labels = labelsRaw ? labelsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        const body = {
          fields: {
            project: { key: form.project.value.trim() },
            issuetype: { name: form.issuetype.value },
            summary: form.summary.value.trim(),
            description: form.description.value,
            labels,
            priority: { name: form.priority.value },
          },
        };

        try {
          const res = await fetch('/rest/api/3/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (res.ok && data.key) {
            window.location.href = '/issue/' + data.key;
          } else {
            alert('Error: ' + JSON.stringify(data));
          }
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    </script>`;

  return layout('Create Issue', content);
}

// --- Router ---

export function uiRouter(store: MockJiraStore): Router {
  const router = Router();

  // Issue list
  router.get('/', (_req: Request, res: Response) => {
    const issues = store.listAll();
    res.type('html').send(issueListPage(issues));
  });

  // Create issue form
  router.get('/create', (_req: Request, res: Response) => {
    res.type('html').send(createIssuePage());
  });

  // Issue detail
  router.get('/issue/:issueKey', (req: Request, res: Response) => {
    const key = String(req.params.issueKey);
    const issue = store.getIssue(key);
    if (!issue) {
      res.status(404).type('html').send(layout('Not Found', '<p class="text-red-600">Issue not found.</p>'));
      return;
    }
    const transitions = store.getTransitions(key);
    res.type('html').send(issueDetailPage(issue, transitions));
  });

  return router;
}
