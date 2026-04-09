function formatTimestamp(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

const names = ['a26', 'a62', 'a03', 'JERRY', 'b14', 'c88', 'd42', 'e99', 'f17', 'g05'];
const statuses = ['active', 'idle', 'idle', 'error', 'active', 'idle', 'rate_limited', 'cooldown', 'idle', 'active'];
const types = ['team', 'team', 'plus', 'free', 'team', 'team', 'plus', 'team', 'free', 'team'];

const hoursAgo = (hours) => formatTimestamp(new Date(Date.now() - hours * 3600000));
const minutesAgo = (minutes) => formatTimestamp(new Date(Date.now() - minutes * 60000));

export function createSeedAccounts() {
  return names.map((name, index) => ({
    id: crypto.randomUUID(),
    account_id: name,
    email: `${name.toLowerCase()}@codex.team`,
    auth_type: types[index],
    auth_file_path: `~/.codex/auth/${name.toLowerCase()}.json`,
    status: statuses[index],
    is_current: index === 0,
    last_login_at: hoursAgo(index + 1),
    total_tasks_completed: 20 + index * 11,
    success_rate: 90 + (index % 5),
    session_start_at: hoursAgo(index % 6),
    total_session_seconds: 3600 + index * 750,
    requests_this_minute: 4 + index,
    tokens_used_percent: 12 + index * 7,
    last_request_at: minutesAgo(index * 2),
    uptime_percent: 70 + index * 2,
    created_at: hoursAgo(48 + index),
    updated_at: minutesAgo(index),
  }));
}

export function createSeedTasks(accounts) {
  const taskDescs = [
    'Refactor auth module',
    'Fix rate limiter',
    'Deploy staging build',
    'Run test suite',
    'Update API docs',
    'Patch security vulnerability',
  ];
  const taskStatuses = ['completed', 'running', 'queued', 'failed', 'completed', 'queued'];

  return taskDescs.map((description, index) => {
    const account = accounts[index % accounts.length];
    const status = taskStatuses[index];
    return {
      id: crypto.randomUUID(),
      description,
      assigned_account_id: account.id,
      assigned_account_name: account.account_id,
      status,
      priority: ['low', 'medium', 'high'][index % 3],
      result: status === 'completed' ? 'Success' : null,
      error_message: status === 'failed' ? 'Timeout exceeded' : null,
      retry_count: 0,
      created_at: minutesAgo(60 - index * 5),
      started_at: ['running', 'completed', 'failed', 'retrying'].includes(status) ? minutesAgo(40 - index * 4) : null,
      completed_at: status === 'completed' ? minutesAgo(10 - index) : null,
    };
  });
}

export function createSeedLogs(accounts) {
  const logMessages = [
    ['info', 'Account rotated successfully'],
    ['info', 'Task dispatched to pool'],
    ['warn', 'Rate limit threshold at 80%'],
    ['error', 'Authentication failed - token expired'],
    ['info', 'Health check passed'],
    ['warn', 'Cooldown period initiated'],
  ];

  return Array.from({ length: 18 }, (_, index) => {
    const [level, message] = logMessages[index % logMessages.length];
    const account = accounts[index % accounts.length];
    return {
      id: crypto.randomUUID(),
      account_id: account.id,
      account_name: account.account_id,
      level,
      message,
      created_at: minutesAgo(index * 3),
    };
  });
}

export const defaultSettings = {
  strategy: 'round_robin',
  auto_rotation: true,
  rest_after_tasks: 50,
  cooldown_minutes: 15,
  rate_limit_buffer: 20,
  max_concurrent_tasks: 3,
  global_rate_limit: 60,
  auto_retry: true,
  max_retries: 3,
  task_timeout_minutes: 10,
  auto_dispatch: true,
  openclaw_endpoint: 'https://api.openclaw.io/v1',
  openclaw_api_key: '',
  codex_path: '/usr/local/bin/codex',
  trae_path: '/usr/local/bin/trae',
  mode: 'codex',
  auto_launch: false,
  auto_token_refresh: true,
  token_refresh_interval_hours: 72,
};
