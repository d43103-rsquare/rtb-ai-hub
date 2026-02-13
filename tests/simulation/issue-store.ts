import * as fs from 'fs';
import * as path from 'path';

export interface TimelineEntry {
  step: number;
  agent: string;
  action: string;
  detail: string;
  result: string;
  statusChange: string;
  timestamp: string;
}

export interface GateDecision {
  gatekeeper: string;
  decision: 'approved' | 'rejected';
  reason: string;
  checklist: Record<string, boolean>;
  timestamp: string;
}

export interface Artifacts {
  refined_requirement: string | null;
  dev_plan: string | null;
  branch_name: string | null;
  ci_result: string | null;
  pr_url: string | null;
  preview_url: string | null;
  test_plan: string | null;
  test_result: string | null;
}

export interface SimulatedIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  labels: string[];
  created: string;
  updated: string;
  timeline: TimelineEntry[];
  artifacts: Artifacts;
  gates: {
    G1: GateDecision | null;
    G2: GateDecision | null;
    G3: GateDecision | null;
    G4: GateDecision | null;
  };
}

const WORKSPACE_DIR = path.join(__dirname, 'workspace');

function ensureWorkspaceDir(): void {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
}

function issueFilePath(key: string): string {
  return path.join(WORKSPACE_DIR, `${key}.json`);
}

export function createIssue(data: {
  key: string;
  summary: string;
  description: string;
  priority?: string;
  labels?: string[];
}): SimulatedIssue {
  ensureWorkspaceDir();

  const now = new Date().toISOString();
  const issue: SimulatedIssue = {
    key: data.key,
    summary: data.summary,
    description: data.description,
    status: 'Open',
    priority: data.priority ?? 'High',
    labels: data.labels ?? ['RTB-AI-HUB'],
    created: now,
    updated: now,
    timeline: [],
    artifacts: {
      refined_requirement: null,
      dev_plan: null,
      branch_name: null,
      ci_result: null,
      pr_url: null,
      preview_url: null,
      test_plan: null,
      test_result: null,
    },
    gates: { G1: null, G2: null, G3: null, G4: null },
  };

  fs.writeFileSync(issueFilePath(data.key), JSON.stringify(issue, null, 2), 'utf-8');
  return issue;
}

export function readIssue(key: string): SimulatedIssue {
  const filePath = issueFilePath(key);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Issue not found: ${key}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SimulatedIssue;
}

export function updateIssue(key: string, updates: Partial<SimulatedIssue>): SimulatedIssue {
  const issue = readIssue(key);
  const merged = { ...issue, ...updates, updated: new Date().toISOString() };
  fs.writeFileSync(issueFilePath(key), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function addTimeline(
  key: string,
  entry: Omit<TimelineEntry, 'step' | 'timestamp'>
): SimulatedIssue {
  const issue = readIssue(key);
  const step = issue.timeline.length + 1;
  issue.timeline.push({ ...entry, step, timestamp: new Date().toISOString() });
  issue.updated = new Date().toISOString();
  fs.writeFileSync(issueFilePath(key), JSON.stringify(issue, null, 2), 'utf-8');
  return issue;
}

export function setGate(
  key: string,
  gate: 'G1' | 'G2' | 'G3' | 'G4',
  decision: GateDecision
): SimulatedIssue {
  const issue = readIssue(key);
  issue.gates[gate] = decision;
  issue.updated = new Date().toISOString();
  fs.writeFileSync(issueFilePath(key), JSON.stringify(issue, null, 2), 'utf-8');
  return issue;
}

export function setArtifact(
  key: string,
  artifactKey: keyof Artifacts,
  value: string
): SimulatedIssue {
  const issue = readIssue(key);
  issue.artifacts[artifactKey] = value;
  issue.updated = new Date().toISOString();
  fs.writeFileSync(issueFilePath(key), JSON.stringify(issue, null, 2), 'utf-8');
  return issue;
}

export function cleanWorkspace(): void {
  if (fs.existsSync(WORKSPACE_DIR)) {
    const files = fs.readdirSync(WORKSPACE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(WORKSPACE_DIR, file));
      }
    }
  }
}
