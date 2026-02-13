import { format } from 'date-fns';
import type { TimelineEntry, AgentName } from '../../types/workflow';

interface AgentChatTimelineProps {
  timeline: TimelineEntry[];
}

const agentColors: Record<AgentName, { bg: string; text: string; icon: string; name: string }> = {
  'pm-agent': {
    bg: 'bg-blue-100',
    text: 'text-blue-900',
    icon: '👔',
    name: 'PM Agent',
  },
  'developer-agent': {
    bg: 'bg-purple-100',
    text: 'text-purple-900',
    icon: '💻',
    name: 'Developer',
  },
  'teamlead-agent': {
    bg: 'bg-orange-100',
    text: 'text-orange-900',
    icon: '👨‍💼',
    name: 'Team Lead',
  },
  'ops-agent': {
    bg: 'bg-green-100',
    text: 'text-green-900',
    icon: '⚙️',
    name: 'Ops',
  },
  'test-agent': {
    bg: 'bg-pink-100',
    text: 'text-pink-900',
    icon: '🧪',
    name: 'Test',
  },
};

export function AgentChatTimeline({ timeline }: AgentChatTimelineProps) {
  return (
    <div className="space-y-6">
      {timeline.map((entry) => {
        const agent = agentColors[entry.agent as AgentName] || {
          bg: 'bg-gray-100',
          text: 'text-gray-900',
          icon: '🤖',
          name: entry.agent,
        };

        const isGateReview = entry.action.includes('gate');
        const isRejected = entry.detail.includes('REJECTED');

        return (
          <div key={entry.step} className="flex gap-4">
            <div className="flex-shrink-0">
              <div
                className={`w-12 h-12 rounded-full ${agent.bg} flex items-center justify-center text-2xl`}
              >
                {agent.icon}
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`font-bold ${agent.text}`}>{agent.name}</span>
                <span className="text-xs text-gray-500">
                  {format(new Date(entry.timestamp), 'HH:mm:ss')}
                </span>
                <span className="text-xs text-gray-400">Step {entry.step}</span>
              </div>

              <div
                className={`p-4 rounded-lg ${agent.bg} ${agent.text} space-y-2 ${
                  isGateReview && isRejected ? 'border-2 border-red-400' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">
                      {entry.action.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {entry.detail}
                    </div>
                  </div>
                  {isGateReview && (
                    <span
                      className={`ml-2 px-3 py-1 rounded-full text-xs font-bold ${
                        isRejected ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                      }`}
                    >
                      {isRejected ? '❌ REJECTED' : '✅ APPROVED'}
                    </span>
                  )}
                </div>

                {entry.result && (
                  <div className="pt-2 border-t border-current border-opacity-20">
                    <div className="text-xs font-semibold mb-1">결과:</div>
                    <div className="text-sm whitespace-pre-wrap">{entry.result}</div>
                  </div>
                )}

                {entry.statusChange && (
                  <div className="pt-2">
                    <span className="inline-block px-3 py-1 bg-white bg-opacity-50 rounded text-xs font-medium">
                      📊 {entry.statusChange}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
