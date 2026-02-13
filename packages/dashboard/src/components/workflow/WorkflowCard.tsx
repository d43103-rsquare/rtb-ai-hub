import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Card } from '../common/Card';
import { WorkflowProgressBar } from './WorkflowProgressBar';
import type { SimulatedWorkflow } from '../../types/workflow';

interface WorkflowCardProps {
  workflow: SimulatedWorkflow;
}

export function WorkflowCard({ workflow }: WorkflowCardProps) {
  const priorityColors: Record<string, string> = {
    High: 'bg-red-100 text-red-800',
    Medium: 'bg-yellow-100 text-yellow-800',
    Low: 'bg-green-100 text-green-800',
  };

  const statusIcons: Record<string, string> = {
    Done: '✅',
    Testing: '🧪',
    'In Development': '⚙️',
    Planning: '📋',
    'In Analysis': '🔍',
    Open: '📝',
  };

  return (
    <Link to={`/monitoring/${workflow.key}`}>
      <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{statusIcons[workflow.status] || '📄'}</span>
                <span className="text-sm font-mono text-gray-500">{workflow.key}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[workflow.priority]}`}
                >
                  {workflow.priority}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 line-clamp-2 mb-1">
                {workflow.summary}
              </h3>
              <p className="text-sm text-gray-600 line-clamp-2">{workflow.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>👤</span>
            <span className="capitalize">
              {workflow.assignee?.replace('-agent', '') || 'Unassigned'}
            </span>
            <span className="mx-2">•</span>
            <span>🕐</span>
            <span>
              {formatDistanceToNow(new Date(workflow.created), { addSuffix: true, locale: ko })}
            </span>
          </div>

          <WorkflowProgressBar progress={workflow.progress || 0} status={workflow.status} />

          <div className="flex items-center gap-2 flex-wrap">
            {workflow.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="pt-3 border-t border-gray-200 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="text-gray-600">{workflow.timeline.length} steps</span>
              {workflow.gates.G1 && (
                <span className="text-green-600 font-medium">
                  {Object.values(workflow.gates).filter((g) => g?.decision === 'approved').length}/4
                  Gates ✓
                </span>
              )}
            </div>
            <span className="text-blue-600 font-medium hover:text-blue-700">상세 보기 →</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
