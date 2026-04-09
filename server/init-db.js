import db from './db.js';
import { createSeedAccounts, createSeedTasks, createSeedLogs, defaultSettings } from './seed-data.js';

function createTables() {
  // Accounts table (TEXT + CHECK constraints instead of ENUM, which SQLite doesn't support)
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      auth_type TEXT NOT NULL CHECK (auth_type IN ('team', 'plus', 'free')),
      auth_file_path TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'error', 'rate_limited', 'cooldown')),
      is_current INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT NOT NULL,
      total_tasks_completed INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      session_start_at TEXT NOT NULL,
      total_session_seconds INTEGER NOT NULL DEFAULT 0,
      requests_this_minute INTEGER NOT NULL DEFAULT 0,
      tokens_used_percent INTEGER NOT NULL DEFAULT 0,
      last_request_at TEXT NOT NULL,
      uptime_percent REAL NOT NULL DEFAULT 0,
      platform TEXT NOT NULL DEFAULT 'gpt',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      assigned_account_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'retrying')),
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      result TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (assigned_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      strategy TEXT NOT NULL CHECK (strategy IN ('round_robin', 'least_used', 'random', 'priority_based')),
      auto_rotation INTEGER NOT NULL DEFAULT 1,
      rest_after_tasks INTEGER NOT NULL,
      cooldown_minutes INTEGER NOT NULL,
      rate_limit_buffer INTEGER NOT NULL,
      max_concurrent_tasks INTEGER NOT NULL,
      global_rate_limit INTEGER NOT NULL,
      auto_retry INTEGER NOT NULL DEFAULT 1,
      max_retries INTEGER NOT NULL,
      task_timeout_minutes INTEGER NOT NULL,
      auto_dispatch INTEGER NOT NULL DEFAULT 1,
      openclaw_endpoint TEXT NOT NULL,
      openclaw_api_key TEXT NOT NULL,
      codex_path TEXT NOT NULL,
      trae_path TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('codex', 'trae')),
      auto_launch INTEGER NOT NULL DEFAULT 0,
      auto_token_refresh INTEGER NOT NULL DEFAULT 1,
      token_refresh_interval_hours INTEGER NOT NULL DEFAULT 72,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      primary_used REAL NOT NULL DEFAULT 0,
      secondary_used REAL NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);
}

function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_accounts_is_current ON accounts (is_current)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts (status)',
    'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level)',
    'CREATE INDEX IF NOT EXISTS idx_logs_account_id ON logs (account_id)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_assigned_account_id ON tasks (assigned_account_id)',
    'CREATE INDEX IF NOT EXISTS idx_usage_history_account ON usage_history (account_id)',
    'CREATE INDEX IF NOT EXISTS idx_usage_history_recorded ON usage_history (recorded_at)',
  ];
  for (const sql of indexes) {
    db.exec(sql);
  }
}

function seedAccounts() {
  const countStmt = db.prepare('SELECT COUNT(*) AS count FROM accounts');
  const { count } = countStmt.get();
  if (count > 0) {
    return;
  }

  const accounts = createSeedAccounts();
  const insertStmt = db.prepare(`
    INSERT INTO accounts (
      id, account_id, email, auth_type, auth_file_path, status, is_current,
      last_login_at, total_tasks_completed, success_rate, session_start_at,
      total_session_seconds, requests_this_minute, tokens_used_percent,
      last_request_at, uptime_percent, platform, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const account of accounts) {
    insertStmt.run(
      account.id,
      account.account_id,
      account.email,
      account.auth_type,
      account.auth_file_path,
      account.status,
      account.is_current ? 1 : 0,
      account.last_login_at,
      account.total_tasks_completed,
      account.success_rate,
      account.session_start_at,
      account.total_session_seconds,
      account.requests_this_minute,
      account.tokens_used_percent,
      account.last_request_at,
      account.uptime_percent,
      'gpt',
      account.created_at,
      account.updated_at
    );
  }

  const tasks = createSeedTasks(accounts);
  const insertTaskStmt = db.prepare(`
    INSERT INTO tasks (
      id, description, assigned_account_id, status, priority, result,
      error_message, retry_count, created_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const task of tasks) {
    insertTaskStmt.run(
      task.id,
      task.description,
      task.assigned_account_id,
      task.status,
      task.priority,
      task.result,
      task.error_message,
      task.retry_count,
      task.created_at,
      task.started_at,
      task.completed_at
    );
  }

  const logs = createSeedLogs(accounts);
  const insertLogStmt = db.prepare('INSERT INTO logs (id, account_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)');

  for (const log of logs) {
    insertLogStmt.run(log.id, log.account_id, log.level, log.message, log.created_at);
  }
}

function seedSettings() {
  const countStmt = db.prepare('SELECT COUNT(*) AS count FROM settings');
  const { count } = countStmt.get();
  if (count > 0) {
    return;
  }

  const insertStmt = db.prepare(`
    INSERT INTO settings (
      id, strategy, auto_rotation, rest_after_tasks, cooldown_minutes, rate_limit_buffer,
      max_concurrent_tasks, global_rate_limit, auto_retry, max_retries, task_timeout_minutes,
      auto_dispatch, openclaw_endpoint, openclaw_api_key, codex_path, trae_path,
      mode, auto_launch, auto_token_refresh, token_refresh_interval_hours, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  insertStmt.run(
    defaultSettings.strategy,
    defaultSettings.auto_rotation ? 1 : 0,
    defaultSettings.rest_after_tasks,
    defaultSettings.cooldown_minutes,
    defaultSettings.rate_limit_buffer,
    defaultSettings.max_concurrent_tasks,
    defaultSettings.global_rate_limit,
    defaultSettings.auto_retry ? 1 : 0,
    defaultSettings.max_retries,
    defaultSettings.task_timeout_minutes,
    defaultSettings.auto_dispatch ? 1 : 0,
    defaultSettings.openclaw_endpoint,
    defaultSettings.openclaw_api_key,
    defaultSettings.codex_path,
    defaultSettings.trae_path,
    defaultSettings.mode,
    defaultSettings.auto_launch ? 1 : 0,
    defaultSettings.auto_token_refresh ? 1 : 0,
    defaultSettings.token_refresh_interval_hours
  );
}

export function initDatabase() {
  createTables();
  createIndexes();

  // Only seed in non-production
  if (process.env.NODE_ENV !== 'production') {
    seedAccounts();
  }
  seedSettings();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase();
  console.log('Database initialized');
  process.exit(0);
}
