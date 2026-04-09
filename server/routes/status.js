import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import db from '../db.js';
import { asyncHandler, expandPath } from '../utils/helpers.js';
import { getAutoCheckStatus, getAutoRefreshStatus } from '../services/timers.js';

const router = express.Router();

// GET /api/auto-check/status
router.get('/auto-check/status', (_req, res) => {
  res.json(getAutoCheckStatus());
});

// GET /api/auto-refresh/status
router.get('/auto-refresh/status', (_req, res) => {
  res.json(getAutoRefreshStatus());
});

// GET /api/codex-usage
router.get('/codex-usage', asyncHandler(async (_req, res) => {
  const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');

  try {
    await fs.access(sessionsDir);
  } catch {
    return res.json({ found: false, reason: 'sessions_dir_not_found' });
  }

  const now = new Date();
  let latestEvent = null;
  let latestTimestamp = null;

  outer:
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(now.getTime() - dayOffset * 86400000);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dirPath = path.join(sessionsDir, year, month, day);

    try {
      await fs.access(dirPath);
    } catch {
      continue;
    }

    const entries = await fs.readdir(dirPath);
    const files = entries.filter(f => f.endsWith('.jsonl')).sort().reverse();

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      let content;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }
      const lines = content.split('\n').filter(Boolean).reverse();

      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          if (
            record.type === 'event_msg' &&
            record.payload?.type === 'token_count' &&
            record.payload?.rate_limits != null
          ) {
            const ts = new Date(record.timestamp);
            if (!latestTimestamp || ts > latestTimestamp) {
              latestTimestamp = ts;
              latestEvent = record;
            }
            break;
          }
        } catch { }
      }

      if (latestEvent) break outer;
    }
  }

  if (!latestEvent) {
    return res.json({ found: false, reason: 'no_rate_limit_data' });
  }

  const { primary, secondary } = latestEvent.payload.rate_limits;
  const recordedAt = latestEvent.timestamp;
  const recordedAtMs = new Date(recordedAt).getTime();

  const primaryResetsAt = primary?.resets_in_seconds != null
    ? new Date(recordedAtMs + primary.resets_in_seconds * 1000).toISOString()
    : null;
  const secondaryResetsAt = secondary?.resets_in_seconds != null
    ? new Date(recordedAtMs + secondary.resets_in_seconds * 1000).toISOString()
    : null;

  const tokenUsage = latestEvent.payload?.info?.total_token_usage ?? null;

  res.json({
    found: true,
    recorded_at: recordedAt,
    primary: primary ? {
      used_percent: primary.used_percent,
      window_minutes: primary.window_minutes,
      resets_at: primaryResetsAt,
    } : null,
    secondary: secondary ? {
      used_percent: secondary.used_percent,
      window_minutes: secondary.window_minutes,
      resets_at: secondaryResetsAt,
    } : null,
    token_usage: tokenUsage,
  });
}));

export default router;
