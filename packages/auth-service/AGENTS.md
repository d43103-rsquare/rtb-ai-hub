# AUTH SERVICE

Google OAuth 2.0 + JWT session management. DEV_MODE for local development. Port 4001.

## STRUCTURE

```
src/
├── index.ts              # Express app, routes, DEV_MODE login endpoint
├── google/
│   └── google-auth.ts    # OAuth2Client, generateAuthUrl, handleCallback, findOrCreateUser
├── middleware/
│   └── auth.ts           # JWT verification (Bearer header or session_token cookie)
├── routes/
│   └── google.ts         # /auth/google/login, /callback, /logout, /auth/refresh
└── utils/
    ├── session.ts        # SessionManager: createSession, verifySession, refreshSession
    └── database.ts       # Raw SQL queries for users table (NOT Drizzle ORM)
```

## AUTH FLOWS

**DEV_MODE** (local): `GET /auth/dev/login` → JWT in cookies → redirect to dashboard
**Google OAuth** (prod): `/auth/google/login` → Google consent → `/auth/google/callback` → JWT in cookies → redirect

## ENDPOINTS

| Endpoint                    | Auth | Purpose                                       |
| --------------------------- | ---- | --------------------------------------------- |
| `GET /health`               | No   | Health check + devMode status                 |
| `GET /auth/dev/login`       | No   | DEV_MODE auto-login (returns 403 if disabled) |
| `GET /auth/google/login`    | No   | Returns `{ authUrl }` for OAuth redirect      |
| `GET /auth/google/callback` | No   | Exchanges code → creates session → redirects  |
| `POST /auth/google/logout`  | Yes  | Clears cookies (JWT still valid until expiry) |
| `POST /auth/refresh`        | No   | Refresh token → new session pair              |
| `GET /api/me`               | Yes  | Returns current user info                     |

## CONVENTIONS

- **Cookies**: `session_token` (7d) + `refresh_token` (30d), HttpOnly, SameSite=lax
- **Token extraction**: Authorization Bearer header takes priority over cookie
- **Workspace filtering**: `ALLOWED_WORKSPACE_DOMAINS` (comma-separated) restricts Google login
- **User persistence**: Raw SQL via `utils/database.ts` (NOT Drizzle — inconsistent with workflow-engine)

## ANTI-PATTERNS

- `as any` on JWT payload (index.ts:72) for optional `name` field
- No token blacklist — logout clears cookies but JWT remains valid until expiry
- Uses raw SQL instead of Drizzle ORM (unlike workflow-engine)
- **Zero tests** — only package with no test coverage
- GoogleAuthManager instantiated even when DEV_MODE=true (unnecessary)

## ENV VARS

| Var                         | Required     | Default      | Notes                          |
| --------------------------- | ------------ | ------------ | ------------------------------ |
| `DEV_MODE`                  | No           | `false`      | `true` enables /auth/dev/login |
| `DEV_USER_EMAIL`            | If DEV_MODE  | —            | Email for dev session          |
| `DEV_USER_NAME`             | No           | email prefix | Display name                   |
| `JWT_SECRET`                | Yes          | —            | Must be >=32 chars             |
| `GOOGLE_CLIENT_ID`          | If !DEV_MODE | —            | OAuth client ID                |
| `GOOGLE_CLIENT_SECRET`      | If !DEV_MODE | —            | OAuth client secret            |
| `ALLOWED_WORKSPACE_DOMAINS` | No           | —            | Comma-separated domains        |
