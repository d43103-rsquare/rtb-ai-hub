export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export const API_URL = import.meta.env.VITE_API_URL || '';
export const WS_URL = API_URL.replace(/^http/, 'ws') || `ws://${window.location.host}`;
export const JIRA_HOST = import.meta.env.VITE_JIRA_HOST || 'rsquare.atlassian.net';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  WORKFLOWS: '/workflows',
  MONITORING: '/monitoring',
  CHAT: '/chat',
  AGENT_CHAT: '/agent-chat',
  PROFILE: '/profile',
} as const;
