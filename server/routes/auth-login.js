import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

// Check if auth is required
router.get('/auth/check', (_req, res) => {
  res.json({ ok: true, authRequired: !!config.authSecret });
});

// Login with password
router.post('/auth/login', (req, res) => {
  const { password } = req.body;
  if (!config.authSecret) {
    return res.json({ ok: true, token: 'no-auth' });
  }
  if (password === config.authSecret) {
    return res.json({ ok: true, token: config.authSecret });
  }
  res.status(401).json({ ok: false, message: '密码错误' });
});

export default router;
