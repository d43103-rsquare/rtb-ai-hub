import { WorkflowCard } from '../components/workflow/WorkflowCard';
import { getWorkflows } from '../utils/simulationData';
import { useWorkflowSSE } from '../hooks/useWorkflowSSE';

export function MonitoringPage() {
  const initialWorkflows = getWorkflows();
  const { workflows, isConnected } = useWorkflowSSE(initialWorkflows);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">실시간 워크플로우 모니터링</h1>
          <p className="mt-2 text-gray-600">AI 에이전트 협업 워크플로우를 실시간으로 확인하세요</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-lg font-medium ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
              }`}
            />
            {isConnected ? 'Live' : 'Connecting...'}
          </div>
          <div className="text-sm text-gray-600">{workflows.length}개 워크플로우</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <span className="text-xl">💡</span>
        <span>
          카드를 클릭하면 에이전트 간 대화 내역과 상세 정보를 확인할 수 있습니다. 프로그레스바는
          3초마다 자동 업데이트됩니다.
        </span>
      </div>

      {workflows.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📋</div>
          <div className="text-xl font-bold text-gray-900 mb-2">아직 워크플로우가 없습니다</div>
          <div className="text-gray-600">Slack에서 요구사항을 전달하면 자동으로 표시됩니다</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.key} workflow={workflow} />
          ))}
        </div>
      )}
    </div>
  );
}
