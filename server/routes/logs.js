import express from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/helpers.js';
import { broadcast } from '../ws.js';

const router = express.Router();

// GET /api/logs
router.get('/logs', asyncHandler(async (req, res) => {
  const { level = 'all', account = 'all', limit } = req.query;
  let sql = `
    SELECT logs.*, accounts.account_id AS account_name
    FROM logs
    LEFT JOIN accounts ON accounts.id = logs.account_id
    WHERE 1 = 1
  `;
  const params = [];

  if (level !== 'all') {
    sql += ' AND logs.level = ?';
    params.push(level);
  }
  if (account !== 'all') {
    sql += ' AND accounts.account_id = ?';
    params.push(account);
  }

  sql += ' ORDER BY logs.created_at ASC';

  if (limit && Number(limit) > 0) {
    sql = `SELECT * FROM (${sql.replace('ASC', 'DESC')} LIMIT ?) AS sub ORDER BY created_at ASC`;
    params.push(Number(limit));
  }

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}));

// DELETE /api/logs
router.delete('/logs', asyncHandler(async (_req, res) => {
  db.prepare('DELETE FROM logs').run();
  broadcast('logs_cleared', { cleared_at: new Date().toISOString() });
  res.status(204).end();
}));

export default router;
