import crypto from 'crypto';
import db from '../db.js';
import { expandPath, createLog } from '../utils/helpers.js';
import fs from 'fs/promises';

// Also used by timers.js — duplicated here to avoid circular imports
function recordUsageHistory(accountId, primaryUsed, secondaryUsed) {
  try {
    db.prepare(
      'INSERT INTO usage_history (id, account_id, primary_used, secondary_used, recorded_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), accountId, primaryUsed, secondaryUsed, new Date().toISOString());
    db.prepare("DELETE FROM usage_history WHERE recorded_at < datetime('now', '-7 days')").run();
  } catch (err) {
    console.error('[Usage History] Error recording usage:', err.message);
  }
}

export async function fetchUsageForAccount(account) {
  const authFilePath = expandPath(account.auth_file_path);
  try {
    await fs.access(authFilePath);
  } catch {
    return { ok: false, error: 'auth_file_not_found' };
  }

  let authData;
  try {
    authData = JSON.parse(await fs.readFile(authFilePath, 'utf8'));
  } catch {
    return { ok: false, error: 'invalid_auth_file' };
  }

  const accessToken = authData.tokens?.access_token;
  if (!accessToken) return { ok: false, error: 'no_access_token' };

  try {
    const resp = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status === 401) return { ok: false, error: 'token_invalid', status: 401 };
    if (!resp.ok) return { ok: false, error: `http_${resp.status}`, status: resp.status };

    const data = await resp.json();
    const rl = data.rate_limit;
    if (!rl) return { ok: false, error: 'no_rate_limit_data' };

    const pw = rl.primary_window;
    const sw = rl.secondary_window;

    const primary = pw ? {
      used_percent: pw.used_percent ?? 0,
      window_minutes: Math.round((pw.limit_window_seconds ?? 18000) / 60),
      resets_at: pw.reset_at ? new Date(pw.reset_at * 1000).toISOString() : null,
    } : null;

    const secondary = sw ? {
      used_percent: sw.used_percent ?? 0,
      window_minutes: Math.round((sw.limit_window_seconds ?? 604800) / 60),
      resets_at: sw.reset_at ? new Date(sw.reset_at * 1000).toISOString() : null,
    } : null;

    if (rl.limit_reached) {
      return {
        ok: false, error: 'rate_limited', status: 429,
        primary_used: pw?.used_percent ?? 0,
        secondary_used: sw?.used_percent ?? 0,
        plan_type: data.plan_type ?? null,
        primary, secondary,
      };
    }

    return {
      ok: true,
      primary_used: pw?.used_percent ?? 0,
      secondary_used: sw?.used_percent ?? 0,
      plan_type: data.plan_type ?? null,
      primary, secondary,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function handleUsageCheck(id) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return { _status: 404, message: 'Account does not exist' };
  const usage = await fetchUsageForAccount(account);

  if (usage.error === 'rate_limited') {
    db.prepare("UPDATE accounts SET status = 'rate_limited', updated_at = datetime('now') WHERE id = ?").run(id);
    await createLog({ accountId: id, level: 'warn', message: `Codex rate limited (5h=${usage.primary_used ?? '?'}% week=${usage.secondary_used ?? '?'}%)` });
    recordUsageHistory(id, usage.primary_used ?? 0, usage.secondary_used ?? 0);
    return {
      ok: false, rate_limited: true, status: 429,
      primary: usage.primary ?? null,
      secondary: usage.secondary ?? null,
      fetched_at: new Date().toISOString(),
    };
  }

  if (usage.error === 'token_invalid') {
    db.prepare("UPDATE accounts SET status = 'error', updated_at = datetime('now') WHERE id = ?").run(id);
    await createLog({ accountId: id, level: 'error', message: 'Token expired (401)' });
    return { ok: false, status: 401, error: 'token_invalid' };
  }

  if (!usage.ok) {
    await createLog({ accountId: id, level: 'error', message: `Check failed: ${usage.error}` });
    return { ok: false, error: usage.error };
  }

  // Update plan type if it changed
  const planType = usage.plan_type;
  const validTypes = ['team', 'plus', 'free'];
  if (planType && validTypes.includes(planType) && account.auth_type !== planType) {
    db.prepare(`UPDATE accounts SET auth_type = ?, updated_at = datetime('now') WHERE id = ?`).run(planType, id);
  }
  // Recover error/rate_limited status independently (not in else-if, so both can happen)
  if (account.status === 'error' || account.status === 'rate_limited') {
    db.prepare("UPDATE accounts SET status = 'idle', updated_at = datetime('now') WHERE id = ?").run(id);
  }
  await createLog({ accountId: id, message: `Codex available (5h=${usage.primary_used}% week=${usage.secondary_used}%)` });
  recordUsageHistory(id, usage.primary_used, usage.secondary_used);
  return {
    ok: true, status: 200,
    primary: usage.primary,
    secondary: usage.secondary,
    plan_type: usage.plan_type,
    fetched_at: new Date().toISOString(),
  };
}
