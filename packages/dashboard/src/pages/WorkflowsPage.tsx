import { useState } from 'react';
import { Card } from '../components/common/Card';
import { format } from 'date-fns';

type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

interface DummyWorkflow {
  id: string;
  type: string;
  status: WorkflowStatus;
  cost: number;
  createdAt: string;
}

const dummyData: DummyWorkflow[] = [
  {
    id: 'wf-001',
    type: 'figma-to-jira',
    status: 'completed',
    cost: 0.42,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'wf-002',
    type: 'jira-to-github',
    status: 'completed',
    cost: 0.38,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'wf-003',
    type: 'github-to-datadog',
    status: 'failed',
    cost: 0.15,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
];

export function WorkflowsPage() {
  const [filter, setFilter] = useState<WorkflowStatus | 'all'>('all');

  const filteredWorkflows = filter === 'all'
    ? dummyData
    : dummyData.filter(w => w.status === filter);

  const statusColors: Record<WorkflowStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Workflows</h1>
        <p className="mt-2 text-gray-600">
          View your workflow execution history
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Execution History</h2>
          <div className="flex gap-2">
            {(['all', 'completed', 'failed', 'running', 'pending'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredWorkflows.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <div className="text-lg font-medium">No workflows found</div>
            <div className="text-sm">Workflows will appear here once you run them</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Cost</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Created At</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((workflow) => (
                  <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 text-sm font-mono text-gray-900">{workflow.id}</td>
                    <td className="py-4 px-4 text-sm text-gray-900">{workflow.type}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[workflow.status]}`}>
                        {workflow.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-900">${workflow.cost.toFixed(2)}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">
                      {format(new Date(workflow.createdAt), 'MMM dd, yyyy HH:mm')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
