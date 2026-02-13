interface WorkflowProgressBarProps {
  progress: number;
  status: string;
}

export function WorkflowProgressBar({ progress, status }: WorkflowProgressBarProps) {
  const statusColors: Record<string, string> = {
    Done: 'bg-green-500',
    Testing: 'bg-blue-500',
    'In Development': 'bg-purple-500',
    Planning: 'bg-yellow-500',
    'In Analysis': 'bg-orange-500',
    Open: 'bg-gray-400',
  };

  const bgColor = statusColors[status] || 'bg-gray-400';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">Progress</span>
        <span className="text-gray-600">{progress}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${bgColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
