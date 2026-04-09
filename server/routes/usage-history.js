import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();

// Get usage history for charts
router.get('/usage-history', asyncHandler(async (req, res) => {
  const { account_id, hours = 24 } = req.query;
  const since = new Date(Date.now() - Number(hours) * 3600000).toISOString();

  let rows;
  if (account_id) {
    rows = db.prepare(
      'SELECT * FROM usage_history WHERE account_id = ? AND recorded_at > ? ORDER BY recorded_at ASC'
    ).all(account_id, since);
  } else {
    rows = db.prepare(
      'SELECT * FROM usage_history WHERE recorded_at > ? ORDER BY recorded_at ASC'
    ).all(since);
  }

  res.json(rows);
}));

export default router;
