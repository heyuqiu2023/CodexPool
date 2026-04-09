import db from '../db.js';
import crypto from 'crypto';
import { fetchUsageForAccount } from './usage.js';
import { refreshTokenForAuthFile } from './token-refresh.js';
import { performAccountSwitch, pickNextAccount } from './rotation.js';
import { syncOpenClawAuth } from './auth-file.js';
import { reloadOpenClaw } from './openclaw.js';
import { expandPath, createLog } from '../utils/helpers.js';

let autoCheckTimer = null;
let lastAutoCheck = null;

let tokenRefreshTimer = null;
let lastTokenRefresh = null;

function getCheckInterval(primaryUsed) {
  if (primaryUsed >= 80) return 5 * 60 * 1000;
  if (primaryUsed >= 50) return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

// Record usage data point to history
function recordUsageHistory(accountId, primaryUsed, secondaryUsed) {
  try {
    db.prepare(
      'INSERT INTO usage_history (id, account_id, primary_used, secondary_used, recorded_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), accountId, primaryUsed, secondaryUsed, new Date().toISOString());

    // Clean up old history (keep last 7 days)
    db.prepare("DELETE FROM usage_history WHERE recorded_at < datetime('now', '-7 days')").run();
  } catch (err) {
    console.error('[Usage History] Error recording usage:', err.message);
  }
}

// Calculate predicted time to reach threshold based on growth rate
function predictTimeToThreshold(accountId, currentUsage, threshold = 90) {
  try {
    const history = db.prepare(
      'SELECT primary_used, recorded_at FROM usage_history WHERE account_id = ? ORDER BY recorded_at DESC LIMIT 5'
    ).all(accountId);

    if (history.length < 2) return Infinity; // Not enough data

    // Calculate average growth rate (percent per minute)
    const newest = history[0];
    const oldest = history[history.length - 1];
    const timeDiffMinutes = (new Date(newest.recorded_at) - new Date(oldest.recorded_at)) / 60000;
    const usageDiff = newest.primary_used - oldest.primary_used;

    if (timeDiffMinutes <= 0 || usageDiff <= 0) return Infinity;

    const ratePerMinute = usageDiff / timeDiffMinutes;
    const remaining = threshold - currentUsage;

    if (ratePerMinute <= 0) return Infinity;
    return remaining / ratePerMinute; // minutes until threshold
  } catch (err) {
    console.error('[Predictive Rotation] Error predicting threshold:', err.message);
    return Infinity;
  }
}

async function runAutoCheck() {
  autoCheckTimer = null;
  let nextInterval = 30 * 60 * 1000;

  try {
    const settings = db.prepare('SELECT auto_rotation, strategy FROM settings WHERE id = 1').get();
    if (!settings?.auto_rotation) {
      autoCheckTimer = setTimeout(runAutoCheck, 60 * 1000);
      return;
    }
    const strategy = settings.strategy || 'round_robin';

    const account = db.prepare("SELECT * FROM accounts WHERE is_current = 1 LIMIT 1").get();
    if (!account) {
      autoCheckTimer = setTimeout(runAutoCheck, nextInterval);
      return;
    }

    const usage = await fetchUsageForAccount(account);
    if (!usage.ok && usage.error !== 'rate_limited') {
      autoCheckTimer = setTimeout(runAutoCheck, 10 * 60 * 1000);
      return;
    }

    const primary_used = usage.primary_used ?? 100;
    const secondary_used = usage.secondary_used ?? 0;
    lastAutoCheck = { checked_at: new Date().toISOString(), account_id: account.account_id, primary_used, secondary_used };

    // Record usage to history table
    recordUsageHistory(account.id, primary_used, secondary_used);

    await createLog({ accountId: account.id, message: `[Auto] Usage check: 5h=${primary_used}% week=${secondary_used}%` });

    // Check if we should switch now or predict we'll hit 90% soon
    let shouldSwitch = false;
    let switchReason = '';

    if (primary_used >= 90) {
      shouldSwitch = true;
      switchReason = `[Auto Rotation] ${account.account_id} 5h=${primary_used}%, reached threshold`;
    } else {
      // Predictive rotation: check if usage will hit 90% before next check
      const checkInterval = getCheckInterval(primary_used);
      const timeToThreshold = predictTimeToThreshold(account.id, primary_used, 90);
      const minutesUntilNextCheck = checkInterval / 60000;

      if (timeToThreshold < minutesUntilNextCheck && timeToThreshold !== Infinity) {
        shouldSwitch = true;
        switchReason = `[Auto Rotation] ${account.account_id} 5h=${primary_used}%, predicted to hit 90% in ${Math.round(timeToThreshold)}min (before next check in ${Math.round(minutesUntilNextCheck)}min)`;
      }
    }

    if (shouldSwitch) {
      const allAccounts = db.prepare("SELECT * FROM accounts WHERE status != 'error' ORDER BY account_id ASC").all();
      const next = pickNextAccount(allAccounts, account.id, strategy);

      if (next) {
        await performAccountSwitch(next, `${switchReason}, switched to ${next.account_id} (strategy: ${strategy})`);
        nextInterval = 30 * 60 * 1000;
      }
    } else {
      nextInterval = getCheckInterval(primary_used);
    }
  } catch (err) {
    console.error('[Auto Rotation] Error:', err.message);
    nextInterval = 10 * 60 * 1000;
  }

  autoCheckTimer = setTimeout(runAutoCheck, nextInterval);
}

async function runAutoTokenRefresh() {
  tokenRefreshTimer = null;

  try {
    const refreshSettings = db.prepare('SELECT auto_token_refresh, token_refresh_interval_hours FROM settings WHERE id = 1').get();
    const { auto_token_refresh, token_refresh_interval_hours } = refreshSettings || {};

    if (!auto_token_refresh) {
      tokenRefreshTimer = setTimeout(runAutoTokenRefresh, 60 * 60 * 1000);
      return;
    }

    const intervalMs = (token_refresh_interval_hours || 72) * 60 * 60 * 1000;

    if (lastTokenRefresh && (Date.now() - lastTokenRefresh.getTime()) < intervalMs) {
      const remaining = intervalMs - (Date.now() - lastTokenRefresh.getTime());
      tokenRefreshTimer = setTimeout(runAutoTokenRefresh, Math.min(remaining + 1000, 60 * 60 * 1000));
      return;
    }

    const accounts = db.prepare('SELECT * FROM accounts ORDER BY account_id ASC').all();
    let success = 0;

    let currentAccountRefreshed = false;
    const currentRow = db.prepare("SELECT id FROM accounts WHERE is_current = 1 LIMIT 1").get();
    const currentAccountId = currentRow?.id;

    for (const account of accounts) {
      const result = await refreshTokenForAuthFile(account.auth_file_path);
      if (result.ok) {
        success++;
        if (account.status === 'error') {
          db.prepare("UPDATE accounts SET status = 'idle', updated_at = datetime('now') WHERE id = ?").run(account.id);
        }
        if (account.id === currentAccountId) {
          currentAccountRefreshed = true;
        }
      } else {
        await createLog({ accountId: account.id, level: 'warn', message: `[Auto Refresh] Failed: ${result.reason}` });
      }
    }

    if (currentAccountRefreshed && currentAccountId) {
      const activeAccount = db.prepare("SELECT * FROM accounts WHERE id = ? LIMIT 1").get(currentAccountId);
      if (activeAccount) {
        const authFilePath = expandPath(activeAccount.auth_file_path);
        const syncResult = await syncOpenClawAuth(authFilePath);
        if (syncResult.ok) {
          const reloadResult = await reloadOpenClaw();
          await createLog({ accountId: currentAccountId, message: `[Auto Refresh] OpenClaw synced and reloaded (${reloadResult.method || reloadResult.reason})` });
        }
      }
    }

    lastTokenRefresh = new Date();
    await createLog({
      level: success === accounts.length ? 'info' : 'warn',
      message: `[Auto Refresh] ${success}/${accounts.length} accounts refreshed successfully`,
    });

    tokenRefreshTimer = setTimeout(runAutoTokenRefresh, intervalMs);
  } catch (err) {
    await createLog({ level: 'error', message: `[Auto Refresh] Error: ${err.message}` });
    tokenRefreshTimer = setTimeout(runAutoTokenRefresh, 30 * 60 * 1000);
  }
}

export function startTimers() {
  setTimeout(runAutoCheck, 10 * 1000);
  setTimeout(runAutoTokenRefresh, 30 * 1000);
}

export function stopTimers() {
  if (autoCheckTimer) {
    clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
  }
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

export function getAutoCheckStatus() {
  return { running: autoCheckTimer !== null, last_check: lastAutoCheck };
}

export function getAutoRefreshStatus() {
  return { running: tokenRefreshTimer !== null, last_refresh: lastTokenRefresh };
}
