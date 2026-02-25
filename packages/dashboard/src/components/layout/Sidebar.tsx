import { NavLink } from 'react-router-dom';
import { ROUTES, MOCK_JIRA_ENABLED } from '../../utils/constants';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navItems = [
    { to: ROUTES.DASHBOARD, icon: '📊', label: 'Dashboard' },
    { to: ROUTES.WORKFLOWS, icon: '⚡', label: 'Workflows' },
    { to: ROUTES.MONITORING, icon: '🔴', label: 'Monitoring' },
    { to: ROUTES.AGENT_CHAT, icon: '🤖', label: 'Agent Chat' },
    { to: ROUTES.CHAT, icon: '💬', label: 'AI Chat' },
    { to: ROUTES.PROFILE, icon: '👤', label: 'Profile' },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-64 bg-gray-900 text-white
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-800">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              RTB AI Hub
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {MOCK_JIRA_ENABLED && (
            <div className="px-4 pb-4">
              <div className="border-t border-gray-800 pt-4">
                <a
                  href="/mock-jira/"
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-gray-300 hover:bg-gray-800 hover:text-white"
                >
                  <svg
                    className="w-5 h-5 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                      clipRule="evenodd"
                    />
                    <path
                      fillRule="evenodd"
                      d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">Mock Jira</span>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider bg-yellow-600/20 text-yellow-400 px-1.5 py-0.5 rounded">
                    DEV
                  </span>
                </a>
              </div>
            </div>
          )}

          <div className="p-4 border-t border-gray-800">
            <div className="text-xs text-gray-500">v1.0.0</div>
          </div>
        </div>
      </aside>
    </>
  );
}
