import { Account, LogEntry, PoolSettings, Task } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Auth token management
export function setAuthToken(token: string) {
  localStorage.setItem('codexpool_token', token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem('codexpool_token');
}

export function clearAuthToken() {
  localStorage.removeItem('codexpool_token');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401) {
    // Clear invalid token, dispatch event
    clearAuthToken();
    window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error('认证失败，请重新登录');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  listAccounts: () => request<Account[]>('/api/accounts'),
  createAccount: (payload: Pick<Account, 'account_id' | 'email' | 'auth_type' | 'auth_file_path'> & { platform?: string }) => request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateAccountAction: (id: string, action: 'setActive' | 'pause' | 'reset') => request<Account>(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  updateAccountInfo: (id: string, data: { account_id?: string; auth_file_path?: string }) => request<Account>(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'update', ...data }) }),
  deleteAccount: (id: string) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  clearAllAccounts: () => request<void>('/api/accounts', { method: 'DELETE' }),
  checkAccountUsage: (id: string) => request<{
    ok: boolean;
    status?: number;
    rate_limited?: boolean;
    retry_after?: string | null;
    error?: string;
    fetched_at?: string;
    plan_type?: string | null;
    primary?: { used_percent: number; window_minutes: number; resets_at: string | null } | null;
    secondary?: { used_percent: number; window_minutes: number; resets_at: string | null } | null;
    rate_limit?: {
      limit_requests?: string | null;
      remaining_requests?: string | null;
      reset_requests?: string | null;
      limit_tokens?: string | null;
      remaining_tokens?: string | null;
    } | null;
  }>(`/api/accounts/${id}/check-usage`, { method: 'POST' }),
  getAccountAuthInfo: (id: string) => request<{
    email?: string;
    plan_type?: string;
    token_expires_at?: string;
    last_refresh?: string;
    usage?: {
      plan?: string;
      is_paid?: boolean;
      message_cap?: number | null;
      message_cap_rollover?: string | null;
    } | null;
    error?: string;
    path?: string;
  }>(`/api/accounts/${id}/auth-info`),
  listTasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: { description: string; priority: Task['priority']; account: string }) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  batchRetryTasks: (ids: string[]) => request<{ updated: number }>('/api/tasks/batch-retry', { method: 'POST', body: JSON.stringify({ ids }) }),
  batchCancelTasks: (ids: string[]) => request<{ deleted: number }>('/api/tasks/batch-cancel', { method: 'POST', body: JSON.stringify({ ids }) }),
  listLogs: (params?: { level?: string; account?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.level) search.set('level', params.level);
    if (params?.account) search.set('account', params.account);
    if (params?.limit) search.set('limit', String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request<LogEntry[]>(`/api/logs${suffix}`);
  },
  clearLogs: () => request<void>('/api/logs', { method: 'DELETE' }),
  getSettings: () => request<PoolSettings>('/api/settings'),
  updateSettings: (payload: PoolSettings) => request<PoolSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  rotateNow: () => request<Account>('/api/actions/rotate', { method: 'POST' }),
  pauseAll: () => request<void>('/api/actions/pause-all', { method: 'POST' }),
  healthCheck: () => request<{ ok: boolean; totalAccounts: number }>('/api/actions/health-check', { method: 'POST' }),
  restartOpenClaw: () => request<{ ok: boolean; method?: string; reason?: string; note?: string }>('/api/actions/restart-openclaw', { method: 'POST' }),
  refreshCodexUsage: (id: string) => request<{
    ok: boolean;
    error?: string;
    fetched_at?: string;
    plan_type?: string | null;
    primary?: { used_percent: number; window_minutes: number; resets_at: string | null } | null;
    secondary?: { used_percent: number; window_minutes: number; resets_at: string | null } | null;
  }>(`/api/accounts/${id}/refresh-codex-usage`, { method: 'POST' }),
  refreshToken: (id: string) => request<{ ok: boolean; newExpiresAt?: string; reason?: string }>(`/api/accounts/${id}/refresh-token`, { method: 'POST' }),
  scanDir: (dir?: string) => request<{
    files: Array<{
      file: string;
      full_path: string;
      til_path: string;
      email?: string;
      auth_type?: string;
      suggested_name?: string;
      already_added?: boolean;
      error?: string;
    }>;
    dir: string;
    error?: string;
  }>(`/api/accounts/scan-dir${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
  importAuthFiles: (payload: { platform?: string; files: Array<{ name: string; content: string; account_id?: string }> }) => request<{
    added: Array<{ file: string; saved_as: string; account: Account }>;
    skipped: Array<{ file: string; email?: string; reason: string }>;
  }>('/api/accounts/import-auth', { method: 'POST', body: JSON.stringify(payload) }),
  refreshAllTokens: () => request<{ ok: boolean; total: number; success: number; results: Array<{ id: string; account_id: string; ok: boolean; reason?: string; newExpiresAt?: string }> }>('/api/actions/refresh-all-tokens', { method: 'POST' }),
  startCodexLogin: () => request<{ ok: boolean }>('/api/auth/codex-login', { method: 'POST' }),
  getCodexLoginStatus: () => request<{
    status: 'idle' | 'running' | 'success' | 'error';
    message: string;
    output: string;
    newFile: string | null;
    error: string | null;
  }>('/api/auth/codex-login/status'),
  cancelCodexLogin: () => request<{ ok: boolean }>('/api/auth/codex-login', { method: 'DELETE' }),
  listPlatforms: () => request<string[]>('/api/platforms'),
  addPlatform: (name: string) => request<string[]>('/api/platforms', { method: 'POST', body: JSON.stringify({ name }) }),
  deletePlatform: (name: string) => request<string[]>(`/api/platforms/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getCodexUsage: () => request<{
    found: boolean;
    reason?: string;
    recorded_at?: string;
    primary?: { used_percent: number; window_minutes: number; resets_at: string | null } | null;
    secondary?: { used_percent: number; window_minutes: number; resets_at: string | null } | null;
    token_usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
  }>('/api/codex-usage'),
  login: (password: string) => request<{ ok: boolean; token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  checkAuth: () => request<{ ok: boolean; authRequired: boolean }>('/api/auth/check'),
  getUsageHistory: (accountId?: string, hours?: number) => {
    const search = new URLSearchParams();
    if (accountId) search.set('account_id', accountId);
    if (hours) search.set('hours', String(hours));
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request<Array<{ recorded_at: string; primary_used: number; secondary_used: number; account_id: string }>>(`/api/usage-history${suffix}`);
  },
};
