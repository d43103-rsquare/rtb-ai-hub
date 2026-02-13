# DASHBOARD

React 18 SPA with Vite, Tailwind CSS, React Router v6. Port 3000.

## STRUCTURE

```
src/
├── main.tsx              # ReactDOM.createRoot entry
├── App.tsx               # Router: /, /login, /dashboard, /workflows, /profile, /chat
├── api/
│   └── client.ts         # Axios instance (baseURL from VITE_API_URL or :4000)
├── components/
│   ├── common/           # Button, Card, Input, Modal, LoadingSpinner, ErrorBoundary
│   └── layout/           # Header, Sidebar, Layout (wrapper with nav)
├── contexts/
│   └── AuthContext.tsx    # Auth state provider (login/logout/refresh)
├── hooks/
│   └── useAuth.ts        # Hook consuming AuthContext
├── pages/
│   ├── DashboardPage.tsx  # Workflow metrics and stats
│   ├── LoginPage.tsx      # Google OAuth login button
│   ├── WorkflowsPage.tsx  # Workflow execution list
│   ├── ProfilePage.tsx    # User profile and settings
│   └── ChatPage.tsx       # AI Chat — Anthropic tool-calling via /api/chat
├── types/
│   └── index.ts          # Frontend-specific types
├── utils/
│   └── constants.ts      # Frontend constants
└── __tests__/            # 1 test (ErrorBoundary only)
```

## CONVENTIONS

- **Module system**: ESNext (`"type": "module"` in package.json)
- **Styling**: Tailwind CSS utility classes, no CSS modules
- **Auth**: AuthContext wraps app, `useAuth()` hook for login state
- **API calls**: `api/client.ts` Axios instance, auth token via cookies
- **Routing**: React Router v6, protected routes check auth state

## ADDING A PAGE

1. Create `src/pages/{Name}Page.tsx`
2. Add route in `App.tsx`
3. Add nav link in `components/layout/Sidebar.tsx`

## ENVIRONMENT VARIABLES

- `VITE_API_URL`: Webhook API base URL (default: `http://localhost:4000`)
- `VITE_WEBHOOK_URL`: Alias for webhook base URL, used by ChatPage for `/api/chat` endpoint

## ANTI-PATTERNS

- Only 1 test file (ErrorBoundary) — pages and components untested
- Dashboard page shows placeholder metrics — real API integration not complete
- No error boundary per route — single top-level ErrorBoundary only
