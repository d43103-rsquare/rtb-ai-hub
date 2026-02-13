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

export interface SimulatedWorkflow {
  id?: string;
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
  assignee?: string;
  progress?: number;
}

export type AgentName =
  | 'pm-agent'
  | 'developer-agent'
  | 'teamlead-agent'
  | 'ops-agent'
  | 'test-agent';

export interface AgentChatMessage {
  agent: AgentName;
  action: string;
  detail: string;
  result: string;
  timestamp: string;
  step: number;
}
