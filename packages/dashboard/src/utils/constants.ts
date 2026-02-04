export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4001';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  CREDENTIALS: '/credentials',
  WORKFLOWS: '/workflows',
  PROFILE: '/profile',
} as const;

export const OAUTH_SERVICES = [
  { name: 'jira', displayName: 'Jira', icon: '🎯' },
  { name: 'github', displayName: 'GitHub', icon: '🐙' },
  { name: 'figma', displayName: 'Figma', icon: '🎨' },
  { name: 'datadog', displayName: 'Datadog', icon: '🐶' },
] as const;

export const API_KEY_SERVICES = [
  { name: 'anthropic', displayName: 'Anthropic (Claude)', placeholder: 'sk-ant-api03-...' },
  { name: 'openai', displayName: 'OpenAI (GPT)', placeholder: 'sk-...' },
] as const;
