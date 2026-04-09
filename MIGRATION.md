# Backend Migration: MySQL to SQLite + Modular Architecture

## What Changed

### 1. Database: MySQL → SQLite (better-sqlite3)

**Before:**
- Used `mysql2` package with connection pool
- Async API with promises
- File-based configuration (host, port, user, password)

**After:**
- Uses `better-sqlite3` for synchronous, simpler API
- No more connection pool management
- SQLite file at `./data/codexpool.db` (configurable via `DB_PATH` env var)
- All queries are synchronous - no await needed for DB operations

**Migration Notes:**
- MySQL `ENUM` types → SQLite `TEXT` with `CHECK` constraints
- MySQL `BOOLEAN` → SQLite `INTEGER` (0/1)
- MySQL `NOW()` → SQLite `datetime('now')`
- All queries changed from `pool.query()`/`pool.execute()` → `db.prepare().all()/.get()/.run()`

### 2. Monolithic Structure → Modular Architecture

**Before:**
- All 1829 lines in `server/index.js`
- Hard to maintain, test, or extend

**After:**
```
server/
├── index.js              # Entry point (slim, just wiring)
├── config.js             # Configuration (SQLite path, auth secret)
├── db.js                 # Database connection (better-sqlite3)
├── init-db.js            # Schema creation & seeding
├── ws.js                 # WebSocket setup
├── seed-data.js          # Seed data generators (unchanged)
├── platforms.json        # Platform list (unchanged)
│
├── middleware/
│   └── auth.js           # Simple token-based auth
│
├── routes/               # API endpoints (split by domain)
│   ├── accounts.js       # Account CRUD + scan + auth-info + usage
│   ├── actions.js        # rotate, pause-all, health-check, refresh-tokens, restart-openclaw
│   ├── tasks.js          # Task CRUD + batch operations
│   ├── logs.js           # Log CRUD
│   ├── settings.js       # Settings CRUD
│   ├── platforms.js      # Platform CRUD
│   ├── auth.js           # codex-login flow
│   ├── chat.js           # AI chat proxy
│   └── status.js         # Health checks + auto-rotation/refresh status
│
├── services/             # Business logic & utilities
│   ├── auth-file.js      # switchAuthFile, syncOpenClawAuth, file watcher
│   ├── openclaw.js       # OpenClaw process management
│   ├── rotation.js       # Account rotation logic
│   ├── usage.js          # Usage tracking & checking
│   ├── token-refresh.js  # Token refresh logic
│   └── timers.js         # Auto-rotation & auto-token-refresh timers
│
└── utils/
    └── helpers.js        # asyncHandler, expandPath, decodeJwt, mappers
```

### 3. New Features

**WebSocket Support (`ws.js`)**
- Real-time event broadcasting to connected clients
- Call `broadcast(event, data)` after any mutation
- Clients connect to `ws://localhost:3001/ws?token=AUTH_SECRET`
- Automatic heartbeat every 30s with ping/pong

**API Authentication (`middleware/auth.js`)**
- Optional password-based token authentication
- Set `AUTH_SECRET` env var to enable
- Supports both `Authorization: Bearer <token>` header and `?token=<token>` query param
- Backward compatible - if `AUTH_SECRET` is empty, auth is disabled

### 4. Database Schema Changes

**New Table: `usage_history`**
```sql
CREATE TABLE IF NOT EXISTS usage_history (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  primary_used REAL NOT NULL DEFAULT 0,
  secondary_used REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
```

**All Tables Updated for SQLite:**
- `ENUM` → `TEXT` with `CHECK` constraints
- `BOOLEAN` → `INTEGER` (0/1)
- `DATETIME` → `TEXT` (ISO 8601)
- No `AUTO_INCREMENT` needed (using UUIDs for primary keys)

### 5. API Endpoints (All Unchanged)

All endpoints work exactly as before, but now with WebSocket broadcasting:

#### Accounts
- `GET /api/accounts` - List all accounts
- `GET /api/accounts/scan-dir` - Discover auth files
- `POST /api/accounts` - Create account
- `PATCH /api/accounts/:id` - Update account (setActive, pause, reset)
- `DELETE /api/accounts/:id` - Delete account
- `DELETE /api/accounts` - Clear all accounts
- `GET /api/accounts/:id/auth-info` - Get account details
- `POST /api/accounts/:id/check-usage` - Check usage (broadcasts event)
- `POST /api/accounts/:id/refresh-codex-usage` - Refresh usage (broadcasts event)

#### Actions
- `POST /api/actions/rotate` - Manual rotation (broadcasts event)
- `POST /api/actions/pause-all` - Pause all accounts (broadcasts event)
- `POST /api/actions/health-check` - Check all accounts (broadcasts event)
- `POST /api/accounts/:id/refresh-token` - Refresh single token (broadcasts event)
- `POST /api/actions/refresh-all-tokens` - Refresh all tokens (broadcasts event)
- `POST /api/actions/restart-openclaw` - Restart OpenClaw (broadcasts event)

#### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task (broadcasts event)
- `POST /api/tasks/batch-retry` - Retry tasks (broadcasts event)
- `POST /api/tasks/batch-cancel` - Cancel tasks (broadcasts event)

#### Logs
- `GET /api/logs` - List logs
- `DELETE /api/logs` - Clear logs (broadcasts event)

#### Settings
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings (broadcasts event)

#### Platforms
- `GET /api/platforms` - List platforms
- `POST /api/platforms` - Add platform (broadcasts event)
- `DELETE /api/platforms/:name` - Remove platform (broadcasts event)

#### Auth
- `POST /api/auth/codex-login` - Start codex login
- `GET /api/auth/codex-login/status` - Get login status
- `DELETE /api/auth/codex-login` - Cancel login (broadcasts event)

#### Chat
- `POST /api/chat` - AI chat proxy (broadcasts event on completion)

#### Status
- `GET /api/health` - Health check (no auth)
- `GET /api/auto-check/status` - Auto-rotation status
- `GET /api/auto-refresh/status` - Auto-token-refresh status
- `GET /api/codex-usage` - Latest Codex usage data

## Setup & Usage

### Installation

```bash
npm install
```

### Configuration

Create `.env` file (see `.env.example`):

```env
PORT=3001
AUTH_SECRET=mysecrettoken
```

### Initialize Database

```bash
npm run db:init
```

Or it will auto-initialize on first server start.

### Start Server

```bash
npm run server
```

Server will:
1. Create SQLite database at `./data/codexpool.db`
2. Create all tables with proper constraints
3. Seed example data (non-production only)
4. Start WebSocket server on same port
5. Start auto-rotation timer (10s delay)
6. Start auto-token-refresh timer (30s delay)

### WebSocket Client

```javascript
// Connect with auth token
const ws = new WebSocket('ws://localhost:3001/ws?token=mysecrettoken');

// Listen for events
ws.onmessage = (event) => {
  const { event: eventType, data, timestamp } = JSON.parse(event.data);
  console.log('Event:', eventType, data);
};

// Events broadcast:
// - account_rotated
// - account_usage_checked
// - account_usage_refreshed
// - all_accounts_paused
// - health_check_completed
// - token_refreshed
// - tokens_refreshed_all
// - openclaw_restarted
// - task_created
// - tasks_retried
// - tasks_cancelled
// - settings_updated
// - platform_added
// - platform_removed
// - logs_cleared
// - log_created
// - error_logged
// - login_completed
// - chat_completed
```

## Migration Checklist

- [x] Replace MySQL pool with better-sqlite3
- [x] Convert all table schemas (ENUM → TEXT, BOOLEAN → INTEGER, etc)
- [x] Split monolithic index.js into services, routes, middleware
- [x] Convert all `pool.query()` → `db.prepare().all()`
- [x] Convert all `pool.execute()` → `db.prepare().run()`
- [x] Add WebSocket support with broadcasting
- [x] Add API authentication middleware
- [x] Create service files for business logic
- [x] Create route files for endpoints
- [x] Update package.json (mysql2 → better-sqlite3, ws)
- [x] Update config.js (SQLite path, auth secret)
- [x] All 1829 lines of business logic preserved
- [x] All endpoints work exactly as before
- [x] Database queries are correct SQLite syntax

## Benefits

1. **Simpler Deployment**: SQLite is a single file, no MySQL server needed
2. **Better Code Organization**: Services, routes, middleware are clearly separated
3. **Type Safety**: better-sqlite3 has better TypeScript support
4. **Real-time Updates**: WebSocket broadcasting for live UI updates
5. **Authentication**: Optional token-based API security
6. **Maintainability**: Each route/service has a single responsibility
7. **Performance**: Synchronous SQLite queries are actually very fast for this workload
8. **No Lock-in**: Easier to migrate back to MySQL if needed

## Backward Compatibility

- All API endpoints maintain 100% compatibility
- Seed data, logging, auto-rotation all work the same
- Error handling is identical
- Configuration file format is compatible (with new SQLite-specific keys)
