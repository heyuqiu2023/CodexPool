import express from 'express';
import db from '../db.js';
import { asyncHandler, mapTask, createLog } from '../utils/helpers.js';

const router = express.Router();

// GET /api/tasks
router.get('/tasks', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT tasks.*, accounts.account_id AS assigned_account_name
    FROM tasks
    LEFT JOIN accounts ON accounts.id = tasks.assigned_account_id
    ORDER BY tasks.created_at DESC
  `).all();
  res.json(rows.map(mapTask));
}));

// POST /api/tasks
router.post('/tasks', asyncHandler(async (req, res) => {
  const { description, priority, account } = req.body;
  let assignedAccountId = null;

  if (account && account !== 'auto') {
    assignedAccountId = account;
  } else {
    const accounts = db.prepare("SELECT id FROM accounts WHERE status IN ('active', 'idle') ORDER BY is_current DESC, updated_at ASC LIMIT 1").all();
    assignedAccountId = accounts[0]?.id || null;
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO tasks (
      id, description, assigned_account_id, status, priority, result,
      error_message, retry_count, created_at, started_at, completed_at
    ) VALUES (?, ?, ?, 'queued', ?, NULL, NULL, 0, datetime('now'), NULL, NULL)
  `).run(id, description, assignedAccountId, priority);

  await createLog({ accountId: assignedAccountId, message: `Task created: ${description}` });

  const rows = db.prepare(`
    SELECT tasks.*, accounts.account_id AS assigned_account_name
    FROM tasks
    LEFT JOIN accounts ON accounts.id = tasks.assigned_account_id
    WHERE tasks.id = ?
  `).all(id);
  res.status(201).json(mapTask(rows[0]));
  broadcast('task_created', { id, description, assigned_account_id: assignedAccountId });
}));

// POST /api/tasks/batch-retry
router.post('/tasks/batch-retry', asyncHandler(async (req, res) => {
  const ids = req.body.ids || [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ updated: 0 });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE tasks SET status = 'queued', retry_count = retry_count + 1, error_message = NULL, result = NULL WHERE id IN (${placeholders})`).run(...ids);
  await createLog({ level: 'info', message: `${ids.length} tasks queued for retry` });
  res.json({ updated: ids.length });
  broadcast('tasks_retried', { count: ids.length, ids });
}));

// POST /api/tasks/batch-cancel
router.post('/tasks/batch-cancel', asyncHandler(async (req, res) => {
  const ids = req.body.ids || [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ deleted: 0 });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);
  await createLog({ level: 'warn', message: `${ids.length} tasks cancelled` });
  res.json({ deleted: ids.length });
  broadcast('tasks_cancelled', { count: ids.length, ids });
}));

export default router;
