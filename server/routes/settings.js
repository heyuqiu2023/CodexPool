import express from 'express';
import db from '../db.js';
import { asyncHandler, createLog } from '../utils/helpers.js';
import { broadcast } from '../ws.js';
import { stopTimers, startTimers } from '../services/timers.js';

const router = express.Router();

// GET /api/settings
router.get('/settings', asyncHandler(async (_req, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!row) {
    return res.status(404).json({ message: 'Settings not found' });
  }
  const { id, updated_at, ...settings } = row;
  res.json(settings);
}));

// PUT /api/settings
router.put('/settings', asyncHandler(async (req, res) => {
  const body = req.body;
  db.prepare(`
    UPDATE settings SET
      strategy = ?, auto_rotation = ?, rest_after_tasks = ?, cooldown_minutes = ?,
      rate_limit_buffer = ?, max_concurrent_tasks = ?, global_rate_limit = ?,
      auto_retry = ?, max_retries = ?, task_timeout_minutes = ?, auto_dispatch = ?,
      openclaw_endpoint = ?, openclaw_api_key = ?, codex_path = ?, trae_path = ?,
      mode = ?, auto_launch = ?, auto_token_refresh = ?, token_refresh_interval_hours = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    body.strategy,
    body.auto_rotation ? 1 : 0,
    body.rest_after_tasks,
    body.cooldown_minutes,
    body.rate_limit_buffer,
    body.max_concurrent_tasks,
    body.global_rate_limit,
    body.auto_retry ? 1 : 0,
    body.max_retries,
    body.task_timeout_minutes,
    body.auto_dispatch ? 1 : 0,
    body.openclaw_endpoint,
    body.openclaw_api_key,
    body.codex_path,
    body.trae_path,
    body.mode,
    body.auto_launch ? 1 : 0,
    body.auto_token_refresh ?? 1,
    body.token_refresh_interval_hours ?? 72,
  );

  await createLog({ level: 'info', message: 'Settings updated' });

  // 重启定时器，让新设置立即生效
  stopTimers();
  startTimers();

  res.json(body);
  broadcast('settings_updated', { ...body, updated_at: new Date().toISOString() });
}));

export default router;
