# Backend Architecture Overview

## File Structure

### Core Files
- **index.js**: Entry point - sets up Express, mounts routes, initializes services
- **config.js**: Configuration loader (port, origins, DB path, auth secret)
- **db.js**: SQLite connection setup (better-sqlite3)
- **init-db.js**: Database schema creation and seeding
- **ws.js**: WebSocket server setup and broadcast helper
- **seed-data.js**: Example data generators (unchanged from original)

### Middleware
- **middleware/auth.js**: Token-based authentication (optional, configurable)

### Routes (by domain)
- **routes/accounts.js**: Account CRUD, scanning, auth info, usage checks
- **routes/actions.js**: Account rotation, pause, health checks, token refresh, OpenClaw management
- **routes/tasks.js**: Task CRUD and batch operations
- **routes/logs.js**: Log CRUD
- **routes/settings.js**: Settings management
- **routes/platforms.js**: Platform list management
- **routes/auth.js**: Codex login flow
- **routes/chat.js**: AI chat proxy
- **routes/status.js**: Health checks and timer status

### Services (business logic)
- **services/auth-file.js**: Auth file switching, OpenClaw profile sync, file monitoring
- **services/openclaw.js**: OpenClaw process management and reload logic
- **services/rotation.js**: Account rotation strategies and switching
- **services/usage.js**: Usage fetching and checking (ChatGPT API integration)
- **services/token-refresh.js**: Token refresh via OAuth (OpenAI)
- **services/timers.js**: Auto-rotation and auto-token-refresh timers

### Utilities
- **utils/helpers.js**: Common functions (asyncHandler, expandPath, decodeJwt, mappers)

## Data Flow

### API Request
```
Request → auth middleware → route handler → service functions → database → response
         ↓ (if authenticated)
      (if auth enabled)
```

### Database Mutations
```
Service function → db.prepare().run() → broadcast(event, data) → WebSocket clients
```

## Database Schema

### accounts
- Core account info (email, auth type, file path)
- Status tracking (active, idle, error, rate_limited, cooldown)
- Usage metrics (tokens_used_percent, success_rate, uptime_percent, etc)
- Timestamps (created_at, updated_at, last_login_at, session_start_at, last_request_at)

### tasks
- Task description and status (queued, running, completed, failed, retrying)
- Assignment to accounts
- Result tracking and error messages
- Retry count and completion tracking

### logs
- Event logging (info, warn, error)
- Associated account (nullable)
- Timestamp and message

### settings
- Single row (id=1) with all app configuration
- Strategy (round_robin, least_used, random, priority_based)
- Auto-rotation/retry/dispatch flags
- OpenClaw endpoint and API key
- Codex/Trae binary paths
- Token refresh configuration

### usage_history
- Historical usage tracking (for future charts)
- Account + timestamp indexed for efficient queries

## Key Concepts

### Account Switching
1. Service calls `switchAuthFile()` to copy auth file to ~/.codex/auth.json
2. Syncs token to OpenClaw's auth-profiles.json via `syncOpenClawAuth()`
3. Triggers `reloadOpenClaw()` to reload OpenClaw process
4. File watcher detects any OpenClaw overwrites and restores

### Token Refresh
- Uses OpenAI Auth0 OAuth endpoint
- Extracts refresh_token from existing auth file
- Exchanges for new access_token
- Updates auth file in-place
- Auto-refresh timer runs on configurable interval (default 72h)

### Usage Checking
- Calls ChatGPT wham/usage API (doesn't consume tokens)
- Tracks primary window (5h) and secondary window (7d) usage
- Auto-rotation triggers when primary window >= 90%
- Dynamic check intervals (5min/10min/30min based on usage)

### WebSocket Broadcasting
Every mutation broadcasts an event with data:
- Event name (e.g., "account_rotated", "task_created")
- Relevant data
- Timestamp

Frontend can connect to `ws://host:port/ws?token=AUTH_SECRET` to receive real-time updates.

## Error Handling

### Database Errors
- Caught by asyncHandler wrapper
- Logged to database and broadcast
- HTTP 500 response with error message

### Service Errors
- Auth file errors: logged, returned in response
- Network errors: logged, returned with reason
- Process errors: caught, escalated gracefully

### Shutdown Handling
- SIGTERM/SIGINT handlers
- Stop all timers
- Close auth file watcher
- Close database connection
- Graceful server shutdown

## Configuration

### Environment Variables
- `PORT`: Express server port (default 3001)
- `AUTH_SECRET`: API authentication token (default empty = disabled)
- `FRONTEND_ORIGIN`: CORS origin (default *, advanced use only)
- `DB_PATH`: SQLite database file path (default ./data/codexpool.db, advanced use only)

### Runtime Settings
All in database `settings` table (id=1), configurable via API:
- Rotation strategy
- Auto-rotation enabled/disabled
- OpenClaw endpoint & API key
- Codex/Trae binary paths
- Retry configuration
- Auto-token-refresh enabled/interval

## Performance Considerations

### SQLite (better-sqlite3)
- Synchronous API: no event loop overhead for DB operations
- WAL mode: enables concurrent reads during writes
- Foreign key constraints: enforced at database level
- Indexes on frequently queried columns (is_current, status, created_at, account_id)

### Memory
- No connection pool overhead (SQLite is file-based)
- Timers use single setTimeout instead of intervals
- WebSocket: only holds connections for clients (auto-closes dead connections)

### Concurrency
- Each route handler runs in separate context
- No shared state except database and timers
- File operations use async/promises to avoid blocking

## Testing Notes

### Database
- SQLite file-based, no setup needed
- Seed data creates 10 accounts, 6 tasks, 18 logs on init
- Non-production environments only (NODE_ENV !== 'production')

### API
- All endpoints support the same parameters as before
- Broadcasting adds minimal overhead
- Auth middleware can be disabled for testing

### WebSocket
- Test connection: `ws://localhost:3001/ws?token=test`
- Heartbeat keeps connection alive (ping every 30s)
- Auto-reconnect on client side recommended

## Future Enhancements

Potential improvements given the modular structure:
1. Add database migrations layer
2. Implement request/response logging middleware
3. Add rate limiting middleware
4. Create service layer tests
5. Add TypeScript types
6. Implement GraphQL layer on top of REST
7. Add database connection caching per request
8. Add background job queue (Bullmq, etc)
