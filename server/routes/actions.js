import express from 'express';
import fs from 'fs/promises';
import db from '../db.js';
import { asyncHandler, expandPath, mapAccount, decodeJwtPayload, createLog } from '../utils/helpers.js';
import { performAccountSwitch, pickNextAccount } from '../services/rotation.js';
import { refreshTokenForAuthFile } from '../services/token-refresh.js';
import { syncOpenClawAuth } from '../services/auth-file.js';
import { reloadOpenClaw } from '../services/openclaw.js';
import { broadcast } from '../ws.js';

const router = express.Router();

// POST /api/actions/rotate
router.post('/actions/rotate', asyncHandler(async (_req, res) => {
  const accounts = db.prepare("SELECT * FROM accounts WHERE status != 'error' ORDER BY account_id ASC").all();
  if (accounts.length === 0) {
    return res.status(400).json({ message: 'No accounts available' });
  }

  const currentAccount = accounts.find(a => a.is_current);

  const settingsRow = db.prepare('SELECT strategy FROM settings WHERE id = 1').get();
  const strategy = settingsRow?.strategy || 'round_robin';

  const nextAccount = pickNextAccount(accounts, currentAccount?.id, strategy);
  if (!nextAccount) {
    return res.status(400).json({ message: 'No alternative account available' });
  }

  await performAccountSwitch(nextAccount, `Rotated to ${nextAccount.account_id} (strategy: ${strategy})`);

  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(nextAccount.id);
  res.json(mapAccount(row));
  broadcast('account_rotated', { from: currentAccount?.id, to: nextAccount.id });
}));

// POST /api/actions/pause-all
router.post('/actions/pause-all', asyncHandler(async (_req, res) => {
  db.prepare("UPDATE accounts SET status = 'idle', is_current = 0, updated_at = datetime('now')").run();
  await createLog({ level: 'warn', message: 'All accounts paused' });
  res.status(204).end();
  broadcast('all_accounts_paused', { paused_at: new Date().toISOString() });
}));

// POST /api/actions/health-check
router.post('/actions/health-check', asyncHandler(async (_req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY account_id ASC').all();
  const results = [];

  for (const account of accounts) {
    const authFilePath = expandPath(account.auth_file_path);
    let fileOk = false;
    let tokenValid = false;
    let tokenExpiresAt = null;

    try {
      await fs.access(authFilePath);
      fileOk = true;
    } catch { }

    if (fileOk) {
      try {
        const authData = JSON.parse(await fs.readFile(authFilePath, 'utf8'));
        const accessToken = authData.tokens?.access_token;
        if (accessToken) {
          const payload = decodeJwtPayload(accessToken);
          if (payload?.exp) {
            tokenExpiresAt = new Date(payload.exp * 1000).toISOString();
            tokenValid = payload.exp * 1000 > Date.now();
          }
        }
      } catch { }
    }

    if (!fileOk || !tokenValid) {
      db.prepare("UPDATE accounts SET status = 'error', updated_at = datetime('now') WHERE id = ?").run(account.id);
      await createLog({
        accountId: account.id,
        level: 'warn',
        message: `[Health Check] ${!fileOk ? 'Auth file missing' : 'Token expired'}`,
      });
    } else if (account.status === 'error') {
      db.prepare("UPDATE accounts SET status = 'idle', updated_at = datetime('now') WHERE id = ?").run(account.id);
      await createLog({ accountId: account.id, message: '[Health Check] Status recovered' });
    }

    results.push({
      id: account.id,
      account_id: account.account_id,
      file_ok: fileOk,
      token_valid: tokenValid,
      token_expires_at: tokenExpiresAt,
    });
  }

  const healthy = results.filter(r => r.file_ok && r.token_valid).length;
  await createLog({ level: 'info', message: `[Health Check] ${healthy}/${results.length} accounts healthy` });
  res.json({ ok: true, total: results.length, healthy, accounts: results });
  broadcast('health_check_completed', { total: results.length, healthy, results });
}));

// POST /api/accounts/:id/refresh-token
router.post('/accounts/:id/refresh-token', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ message: 'Account does not exist' });

  const result = await refreshTokenForAuthFile(account.auth_file_path);

  if (result.ok) {
    if (account.status === 'error') {
      db.prepare("UPDATE accounts SET status = 'idle', updated_at = datetime('now') WHERE id = ?").run(id);
    }
    await createLog({ accountId: id, message: `[Token Refresh] Success, new expiry: ${result.newExpiresAt}` });

    // If this is the current active account, sync the new token to OpenClaw
    if (account.is_current) {
      const authFilePath = expandPath(account.auth_file_path);
      const syncResult = await syncOpenClawAuth(authFilePath);
      if (syncResult.ok) {
        const reloadResult = await reloadOpenClaw();
        await createLog({ accountId: id, message: `[Token Refresh] OpenClaw synced and reloaded (${reloadResult.method || reloadResult.reason})` });
      }
    }

    res.json({ ok: true, newExpiresAt: result.newExpiresAt });
    broadcast('token_refreshed', { accountId: id, newExpiresAt: result.newExpiresAt });
  } else {
    await createLog({ accountId: id, level: 'warn', message: `[Token Refresh] Failed: ${result.reason}` });
    res.json({ ok: false, reason: result.reason });
  }
}));

// POST /api/actions/refresh-all-tokens
router.post('/actions/refresh-all-tokens', asyncHandler(async (_req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY account_id ASC').all();
  const results = [];

  for (const account of accounts) {
    const result = await refreshTokenForAuthFile(account.auth_file_path);
    if (result.ok) {
      if (account.status === 'error') {
        db.prepare("UPDATE accounts SET status = 'idle', updated_at = datetime('now') WHERE id = ?").run(account.id);
      }
      await createLog({ accountId: account.id, message: `[Batch Refresh] Token refreshed successfully` });
    } else {
      await createLog({ accountId: account.id, level: 'warn', message: `[Batch Refresh] Failed: ${result.reason}` });
    }
    results.push({
      id: account.id,
      account_id: account.account_id,
      ok: result.ok,
      reason: result.reason || null,
      newExpiresAt: result.newExpiresAt || null,
    });
  }

  const success = results.filter(r => r.ok).length;
  await createLog({ level: 'info', message: `[Batch Refresh] ${success}/${results.length} accounts refreshed successfully` });

  const currentRow = db.prepare("SELECT * FROM accounts WHERE is_current = 1 LIMIT 1").get();
  if (currentRow && results.some(r => r.id === currentRow.id && r.ok)) {
    const authFilePath = expandPath(currentRow.auth_file_path);
    await syncOpenClawAuth(authFilePath);
    const reloadResult = await reloadOpenClaw();
    await createLog({ accountId: currentRow.id, message: `[Batch Refresh] OpenClaw synced and reloaded (${reloadResult.method || reloadResult.reason})` });
  }

  res.json({ ok: true, total: results.length, success, results });
  broadcast('tokens_refreshed_all', { success, total: results.length, results });
}));

// POST /api/actions/restart-openclaw
router.post('/actions/restart-openclaw', asyncHandler(async (_req, res) => {
  const activeRow = db.prepare("SELECT * FROM accounts WHERE is_current = 1 LIMIT 1").get();
  if (activeRow) {
    const authFilePath = expandPath(activeRow.auth_file_path);
    await syncOpenClawAuth(authFilePath);
  }

  const result = await reloadOpenClaw();
  await createLog({
    level: result.ok ? 'info' : 'warn',
    message: `[OpenClaw] Manual reload: ${result.ok ? result.method : result.reason}`,
  });
  res.json(result);
  broadcast('openclaw_restarted', result);
}));

export default router;
