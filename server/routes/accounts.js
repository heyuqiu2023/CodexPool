import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { asyncHandler, expandPath, mapAccount, decodeJwtPayload, createLog } from '../utils/helpers.js';
import { handleUsageCheck } from '../services/usage.js';
import { performAccountSwitch } from '../services/rotation.js';
import { broadcast } from '../ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_ACCOUNTS_DIR = path.join(PROJECT_ROOT, '..', 'accounts');

const router = express.Router();

// GET /api/accounts
router.get('/accounts', asyncHandler(async (_req, res) => {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY is_current DESC, account_id ASC').all();
  res.json(rows.map(mapAccount));
}));

// GET /api/accounts/scan-dir
router.get('/accounts/scan-dir', asyncHandler(async (req, res) => {
  const dir = req.query.dir ? expandPath(req.query.dir) : PROJECT_ACCOUNTS_DIR;
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return res.json({ files: [], error: `Directory does not exist or no permission: ${dir}` });
  }

  const jsonFiles = entries.filter(f => f.endsWith('.json'));

  const existingRows = db.prepare('SELECT auth_file_path, email FROM accounts').all();
  const existingPaths = new Set(existingRows.map(r => r.auth_file_path));
  const existingEmails = new Set(existingRows.map(r => (r.email || '').toLowerCase()).filter(Boolean));

  const results = [];
  for (const file of jsonFiles) {
    const fullPath = path.join(dir, file);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      const parsed = JSON.parse(content);

      const token = parsed.access_token || parsed.accessToken || '';
      const payload = decodeJwtPayload(token);
      const email = payload?.email || payload?.['https://api.openai.com/profile']?.email || '';

      let auth_type = 'plus';
      const accessToken = parsed.tokens?.access_token || parsed.access_token || '';
      if (accessToken) {
        try {
          const whamResp = await fetch('https://chatgpt.com/backend-api/wham/usage', {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
          });
          if (whamResp.ok) {
            const whamData = await whamResp.json();
            const pt = whamData.plan_type || '';
            auth_type = pt.includes('team') ? 'team' : pt.includes('free') ? 'free' : 'plus';
          }
        } catch { }
      }

      const suggestedName = file.replace(/\.json$/, '');
      results.push({
        file,
        full_path: fullPath,
        til_path: fullPath,
        email,
        auth_type,
        suggested_name: suggestedName,
        already_added: existingPaths.has(fullPath) || (!!email && existingEmails.has(email.toLowerCase())),
        duplicate_reason: existingPaths.has(fullPath) ? 'Already added' : (email && existingEmails.has(email.toLowerCase())) ? 'Email duplicate' : null,
      });
    } catch {
      results.push({ file, full_path: fullPath, error: 'Cannot read or parse' });
    }
  }

  res.json({ files: results, dir });
}));

// POST /api/accounts
router.post('/accounts', asyncHandler(async (req, res) => {
  const body = req.body;
  const id = crypto.randomUUID();
  const platform = body.platform || 'gpt';
  db.prepare(`
    INSERT INTO accounts (
      id, account_id, email, auth_type, auth_file_path, platform, status, is_current,
      last_login_at, total_tasks_completed, success_rate, session_start_at,
      total_session_seconds, requests_this_minute, tokens_used_percent,
      last_request_at, uptime_percent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'idle', FALSE, datetime('now'), 0, 100, datetime('now'), 0, 0, 0, datetime('now'), 100, datetime('now'), datetime('now'))
  `).run(id, body.account_id, body.email, body.auth_type, body.auth_file_path, platform);

  await createLog({ accountId: id, message: `Account ${body.account_id} added` });
  const rows = db.prepare('SELECT * FROM accounts WHERE id = ?').all(id);
  res.status(201).json(mapAccount(rows[0]));
}));

// PATCH /api/accounts/:id
router.patch('/accounts/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  if (action === 'setActive') {
    const targetRows = db.prepare('SELECT * FROM accounts WHERE id = ?').all(id);
    if (targetRows.length === 0) {
      return res.status(404).json({ message: 'Account does not exist' });
    }
    const targetAccount = targetRows[0];

    await performAccountSwitch(targetAccount, `Manual switch to ${targetAccount.account_id}`);
  } else if (action === 'pause') {
    db.prepare("UPDATE accounts SET status = 'idle', is_current = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    await createLog({ accountId: id, level: 'warn', message: 'Account paused' });
  } else if (action === 'reset') {
    db.prepare(
      "UPDATE accounts SET status = 'idle', requests_this_minute = 0, tokens_used_percent = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(id);
    await createLog({ accountId: id, message: 'Account reset' });
  } else if (action === 'update') {
    const setClauses = ["updated_at = datetime('now')"];
    const params = [];
    if (typeof req.body.account_id === 'string' && req.body.account_id.trim()) {
      setClauses.push('account_id = ?');
      params.push(req.body.account_id.trim());
    }
    if (typeof req.body.auth_file_path === 'string' && req.body.auth_file_path.trim()) {
      setClauses.push('auth_file_path = ?');
      params.push(req.body.auth_file_path.trim());
    }
    if (params.length > 0) {
      params.push(id);
      db.prepare(`UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
      await createLog({ accountId: id, message: `Account info updated` });
    }
  } else {
    return res.status(400).json({ message: 'Unsupported action' });
  }

  const rows = db.prepare('SELECT * FROM accounts WHERE id = ?').all(id);
  res.json(mapAccount(rows[0]));
}));

// DELETE /api/accounts/:id
router.delete('/accounts/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  await createLog({ level: 'warn', message: `Account ${id} removed` });
  res.status(204).end();
}));

// DELETE /api/accounts
router.delete('/accounts', asyncHandler(async (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM accounts').get();
  const count = row.count;
  db.prepare('DELETE FROM accounts').run();
  await createLog({ level: 'warn', message: `Cleared all ${count} accounts` });
  res.status(204).end();
}));

// GET /api/accounts/:id/auth-info
router.get('/accounts/:id/auth-info', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ message: 'Account does not exist' });

  const authFilePath = expandPath(account.auth_file_path);

  try {
    await fs.access(authFilePath);
  } catch {
    return res.json({ error: 'auth_file_not_found', path: account.auth_file_path });
  }

  let authData;
  try {
    authData = JSON.parse(await fs.readFile(authFilePath, 'utf8'));
  } catch {
    return res.json({ error: 'invalid_auth_file' });
  }

  const idToken = authData.tokens?.id_token;
  const accessToken = authData.tokens?.access_token;

  let email = null, plan_type = null, token_expires_at = null;
  if (idToken) {
    const decoded = decodeJwtPayload(idToken);
    if (decoded) {
      email = decoded.email;
      plan_type = decoded['https://api.openai.com/auth']?.chatgpt_plan_type ?? null;
    }
  }

  if (accessToken) {
    const decoded = decodeJwtPayload(accessToken);
    if (decoded?.exp) {
      token_expires_at = new Date(decoded.exp * 1000).toISOString();
      if (!email && decoded['https://api.openai.com/profile']?.email) {
        email = decoded['https://api.openai.com/profile'].email;
      }
      if (!plan_type && decoded['https://api.openai.com/auth']?.chatgpt_plan_type) {
        plan_type = decoded['https://api.openai.com/auth'].chatgpt_plan_type;
      }
    }
  }

  let usage = null;
  if (accessToken) {
    try {
      const resp = await fetch('https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const limits = data?.account_plan?.is_paid_subscription_active !== undefined ? data : null;
        if (limits) {
          usage = {
            plan: limits.account_plan?.plan_type,
            is_paid: limits.account_plan?.is_paid_subscription_active,
            message_cap: limits.message_cap ?? null,
            message_cap_rollover: limits.message_cap_rollover ?? null,
          };
        }
      }
    } catch { }
  }

  res.json({
    email,
    plan_type,
    token_expires_at,
    last_refresh: authData.last_refresh ?? null,
    usage,
  });
}));

// POST /api/accounts/:id/check-usage
router.post('/accounts/:id/check-usage', asyncHandler(async (req, res) => {
  const result = await handleUsageCheck(req.params.id);
  const httpStatus = result._status || 200;
  delete result._status;
  res.status(httpStatus).json(result);
  broadcast('account_usage_checked', { accountId: req.params.id, ...result });
}));

// POST /api/accounts/:id/refresh-codex-usage
router.post('/accounts/:id/refresh-codex-usage', asyncHandler(async (req, res) => {
  const result = await handleUsageCheck(req.params.id);
  const httpStatus = result._status || 200;
  delete result._status;
  res.status(httpStatus).json(result);
  broadcast('account_usage_refreshed', { accountId: req.params.id, ...result });
}));

export default router;
