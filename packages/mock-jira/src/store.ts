import fs from 'fs';
import path from 'path';

// --- Types ---

export interface JiraComment {
  id: string;
  body: string;
  author: { displayName: string; accountId: string };
  created: string;
  updated: string;
}

export interface JiraIssue {
  key: string;
  id: string;
  fields: {
    issuetype: { name: string };
    status: { name: string };
    summary: string;
    description: string;
    project: { key: string };
    labels: string[];
    priority: { name: string };
    components: { id: string; name: string }[];
    comment: { comments: JiraComment[] };
    created: string;
    updated: string;
    parent?: { key: string };
    [key: string]: unknown;
  };
}

export interface CreateIssueInput {
  project: string;
  summary: string;
  description?: string;
  issuetype: string;
  labels?: string[];
  priority?: string;
  parent?: string;
  components?: { id: string; name: string }[];
}

export interface UpdateIssueInput {
  summary?: string;
  description?: string;
  labels?: string[];
  priority?: string;
}

export interface SearchQuery {
  project?: string;
  status?: string;
  issuetype?: string;
}

export interface Transition {
  id: string;
  name: string;
}

interface StoreData {
  issues: JiraIssue[];
  counters: Record<string, number>; // per-project key sequence
  idCounter: number;                // global numeric id
}

// --- State Machine ---

const TRANSITIONS: Record<string, Transition[]> = {
  'Open': [
    { id: '11', name: 'In Progress' },
    { id: '51', name: 'Closed' },
  ],
  'In Progress': [
    { id: '21', name: 'In Review' },
    { id: '51', name: 'Closed' },
  ],
  'In Review': [
    { id: '31', name: 'Done' },
    { id: '12', name: 'In Progress' },
  ],
  'Done': [],
  'Closed': [],
};

// Map transition id to target status name
const TRANSITION_TARGET: Record<string, string> = {
  '11': 'In Progress',
  '12': 'In Progress',
  '21': 'In Review',
  '31': 'Done',
  '51': 'Closed',
};

// --- Store ---

const DEFAULT_DATA_DIR = path.join(__dirname, '../data');
const STORE_FILE = 'store.json';
const INITIAL_ID = 10000;

export class MockJiraStore {
  private dataDir: string;
  private filePath: string;
  private data: StoreData;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.filePath = path.join(this.dataDir, STORE_FILE);
    this.data = this.load();
  }

  // --- Public API ---

  reset(): void {
    this.data = { issues: [], counters: {}, idCounter: INITIAL_ID };
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // ignore
    }
  }

  createIssue(input: CreateIssueInput): JiraIssue {
    const { project, summary, description, issuetype, labels, priority, parent, components } = input;

    // Auto-increment per-project key
    const seq = (this.data.counters[project] ?? 0) + 1;
    this.data.counters[project] = seq;

    // Auto-increment global id
    this.data.idCounter += 1;

    const now = new Date().toISOString();
    const issue: JiraIssue = {
      key: `${project}-${seq}`,
      id: String(this.data.idCounter),
      fields: {
        issuetype: { name: issuetype },
        status: { name: 'Open' },
        summary,
        description: description ?? '',
        project: { key: project },
        labels: labels ?? [],
        priority: { name: priority ?? 'Medium' },
        components: components ?? [],
        comment: { comments: [] },
        created: now,
        updated: now,
        ...(parent ? { parent: { key: parent } } : {}),
      },
    };

    this.data.issues.push(issue);
    this.save();
    return issue;
  }

  getIssue(key: string): JiraIssue | null {
    return this.data.issues.find((i) => i.key === key) ?? null;
  }

  updateIssue(key: string, updates: UpdateIssueInput): JiraIssue | null {
    const issue = this.getIssue(key);
    if (!issue) return null;

    if (updates.summary !== undefined) issue.fields.summary = updates.summary;
    if (updates.description !== undefined) issue.fields.description = updates.description;
    if (updates.labels !== undefined) issue.fields.labels = updates.labels;
    if (updates.priority !== undefined) issue.fields.priority = { name: updates.priority };
    issue.fields.updated = new Date().toISOString();

    this.save();
    return issue;
  }

  getTransitions(key: string): Transition[] {
    const issue = this.getIssue(key);
    if (!issue) return [];
    return TRANSITIONS[issue.fields.status.name] ?? [];
  }

  transitionIssue(key: string, transitionId: string): JiraIssue | null {
    const issue = this.getIssue(key);
    if (!issue) return null;

    const available = this.getTransitions(key);
    const match = available.find((t) => t.id === transitionId);
    if (!match) return null;

    const targetStatus = TRANSITION_TARGET[transitionId];
    if (!targetStatus) return null;

    issue.fields.status = { name: targetStatus };
    issue.fields.updated = new Date().toISOString();

    this.save();
    return issue;
  }

  addComment(key: string, body: string): JiraComment | null {
    const issue = this.getIssue(key);
    if (!issue) return null;

    const comment: JiraComment = {
      id: String(Date.now()),
      body,
      author: { displayName: 'Mock User', accountId: 'mock-user-001' },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    issue.fields.comment.comments.push(comment);
    issue.fields.updated = new Date().toISOString();

    this.save();
    return comment;
  }

  search(query: SearchQuery): JiraIssue[] {
    return this.data.issues.filter((issue) => {
      if (query.project && issue.fields.project.key !== query.project) return false;
      if (query.status && issue.fields.status.name !== query.status) return false;
      if (query.issuetype && issue.fields.issuetype.name !== query.issuetype) return false;
      return true;
    });
  }

  listAll(): JiraIssue[] {
    return [...this.data.issues];
  }

  // --- Persistence ---

  private load(): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw) as StoreData;
      }
    } catch {
      // ignore corrupt file
    }
    return { issues: [], counters: {}, idCounter: INITIAL_ID };
  }

  private save(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
