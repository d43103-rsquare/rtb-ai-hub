import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card } from '../components/common/Card';
import { AgentChatTimeline } from '../components/workflow/AgentChatTimeline';
import { WorkflowActionButtons } from '../components/workflow/WorkflowActionButtons';
import { WorkflowProgressBar } from '../components/workflow/WorkflowProgressBar';
import type { SimulatedWorkflow } from '../types/workflow';

import { API_URL } from '../utils/constants';

export function WorkflowDetailPage() {
  const { workflowKey } = useParams<{ workflowKey: string }>();
  const [workflow, setWorkflow] = useState<SimulatedWorkflow | undefined>();
  const [loading, setLoading] = useState(true);

  const mapResponseToWorkflow = (data: Record<string, unknown>): SimulatedWorkflow => ({
    id: data.id as string,
    key: (data.key || data.jiraKey || workflowKey || '') as string,
    summary: (data.summary || '') as string,
    description: (data.description || '') as string,
    status: (data.status || 'IN_PROGRESS') as string,
    priority: 'High',
    labels: [],
    created: data.created as string,
    updated: data.updated as string,
    assignee: data.assignee as string,
    progress: (data.progress || 0) as number,
    timeline: (data.timeline || []) as SimulatedWorkflow['timeline'],
    artifacts: (data.artifacts || {
      refined_requirement: null,
      dev_plan: null,
      branch_name: null,
      ci_result: null,
      pr_url: null,
      preview_url: null,
      test_plan: null,
      test_result: null,
    }) as SimulatedWorkflow['artifacts'],
    gates: (data.gates ||
      data.gateDecisions || {
        G1: null,
        G2: null,
        G3: null,
        G4: null,
      }) as SimulatedWorkflow['gates'],
  });

  useEffect(() => {
    if (!workflowKey) return;

    const isDirectId = workflowKey.startsWith('wf-') || /^[A-Z]+-\d+$/.test(workflowKey);
    const fetchUrl = isDirectId
      ? `${API_URL}/api/workflows/${workflowKey}`
      : `${API_URL}/api/workflows/wf-sim-${workflowKey.toLowerCase()}`;

    fetch(fetchUrl)
      .then((res) => res.json())
      .then((data) => {
        setWorkflow(mapResponseToWorkflow(data));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch workflow:', err);
        setLoading(false);
      });
  }, [workflowKey]);

  useEffect(() => {
    if (!workflowKey) return;

    const isDirectId = workflowKey.startsWith('wf-') || /^[A-Z]+-\d+$/.test(workflowKey);
    const streamUrl = isDirectId
      ? `${API_URL}/api/workflows/${workflowKey}/stream`
      : `${API_URL}/api/workflows/wf-sim-${workflowKey.toLowerCase()}/stream`;

    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'not_found') return;
        setWorkflow(mapResponseToWorkflow(data));
      } catch (_) {
        /* intentionally empty — malformed SSE frames are non-fatal */
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [workflowKey]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="text-xl font-bold text-gray-900">로딩 중...</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">❌</div>
        <div className="text-xl font-bold text-gray-900 mb-2">워크플로우를 찾을 수 없습니다</div>
        <Link to="/monitoring" className="text-blue-600 hover:underline">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const ciResult = workflow.artifacts.ci_result ? JSON.parse(workflow.artifacts.ci_result) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/monitoring"
              className="text-gray-600 hover:text-gray-900 text-sm font-medium"
            >
              ← 목록
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-mono text-gray-500">{workflow.key}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{workflow.summary}</h1>
          <p className="text-gray-600">{workflow.description}</p>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <WorkflowActionButtons workflow={workflow} />
          <WorkflowProgressBar progress={workflow.progress || 0} status={workflow.status} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>💬</span>
              <span>에이전트 대화</span>
              <span className="text-sm font-normal text-gray-500">
                ({workflow.timeline.length}개 단계)
              </span>
            </h2>
            <AgentChatTimeline timeline={workflow.timeline} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-gray-900 mb-4">📊 진행 상황 요약</h3>
            <div className="space-y-3">
              {workflow.timeline.map((entry) => (
                <div key={entry.step} className="flex items-start gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold">
                    {entry.step}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{entry.statusChange}</div>
                    <div className="text-gray-600 text-xs">
                      {format(new Date(entry.timestamp), 'HH:mm:ss')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-gray-900 mb-4">🎯 게이트 포인트</h3>
            <div className="space-y-3">
              {(['G1', 'G2', 'G3', 'G4'] as const).map((gate) => {
                const decision = workflow.gates[gate];
                return (
                  <div
                    key={gate}
                    className={`p-3 rounded-lg border-2 ${
                      decision?.decision === 'approved'
                        ? 'border-green-300 bg-green-50'
                        : decision?.decision === 'rejected'
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{gate}</span>
                      {decision && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            decision.decision === 'approved'
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                          }`}
                        >
                          {decision.decision === 'approved' ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    {decision && <div className="text-xs text-gray-700">{decision.reason}</div>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-gray-900 mb-4">📦 Artifacts</h3>
            <div className="space-y-2 text-sm">
              {Object.entries(workflow.artifacts).map(([key, value]) => (
                <div
                  key={key}
                  className={`flex items-start gap-2 ${value ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  <span>{value ? '✅' : '⏳'}</span>
                  <div className="flex-1">
                    <div className="font-medium">{key.replace(/_/g, ' ')}</div>
                    {value && typeof value === 'string' && value.length < 100 && (
                      <div className="text-xs text-gray-600 mt-1 truncate">{value}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {ciResult && (
            <Card>
              <h3 className="text-lg font-bold text-gray-900 mb-4">🧪 CI 결과</h3>
              <div className="space-y-2 text-sm">
                {ciResult.steps?.map(
                  (step: { name: string; status: string; coverage?: string }) => (
                    <div key={step.name} className="flex items-center justify-between">
                      <span className="font-medium">{step.name}</span>
                      <div className="flex items-center gap-2">
                        {step.coverage && <span className="text-gray-600">{step.coverage}</span>}
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            step.status === 'passed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </Card>
          )}

          {workflow.artifacts.test_result && (
            <Card>
              <h3 className="text-lg font-bold text-gray-900 mb-4">✅ E2E 테스트 결과</h3>
              <div className="space-y-2">
                <div className="text-sm text-gray-900 whitespace-pre-wrap">
                  {workflow.artifacts.test_result}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
