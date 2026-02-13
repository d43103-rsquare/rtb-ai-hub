export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4001';

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
