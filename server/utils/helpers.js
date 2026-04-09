import path from 'path';
import os from 'os';
import crypto from 'crypto';
import db from '../db.js';
import { broadcast } from '../ws.js';

/**
 * Wrap async route handlers to catch exceptions
 */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Shared log creation function (single source of truth)
 */
export function createLog({ accountId = null, level = 'info', message }) {
  db.prepare(
    `INSERT INTO logs (id, account_id, level, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(crypto.randomUUID(), accountId, level, message);

  broadcast('log_created', { accountId, level, message, created_at: new Date().toISOString() });
}

/**
 * Expand ~ in file paths to home directory
 */
export function expandPath(filePath) {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Decode JWT payload (without signature verification, just read the data)
 */
export function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Map account row from database to JSON response
 */
export function mapAccount(row) {
  return {
    ...row,
    is_current: Boolean(row.is_current),
    success_rate: Number(row.success_rate),
    uptime_percent: Number(row.uptime_percent),
  };
}

/**
 * Map task row from database to JSON response
 */
export function mapTask(row) {
  return {
    ...row,
    assigned_account_name: row.assigned_account_name || undefined,
  };
}
