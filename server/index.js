import express from 'express';
import cors from 'cors';
import db from './db.js';
import { config } from './config.js';
import { initDatabase } from './init-db.js';
import { authMiddleware } from './middleware/auth.js';
import { setupWebSocket } from './ws.js';
import { startTimers, stopTimers } from './services/timers.js';
import { startAuthFileWatcher, stopAuthFileWatcher } from './services/auth-file.js';
import { asyncHandler } from './utils/helpers.js';
import { broadcast } from './ws.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Route imports
import accountRoutes from './routes/accounts.js';
import actionRoutes from './routes/actions.js';
import taskRoutes from './routes/tasks.js';
import logRoutes from './routes/logs.js';
import settingRoutes from './routes/settings.js';
import platformRoutes from './routes/platforms.js';
import authRoutes from './routes/auth.js';
import authLoginRoutes from './routes/auth-login.js';
import chatRoutes from './routes/chat.js';
import statusRoutes from './routes/status.js';
import usageHistoryRoutes from './routes/usage-history.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json());

// Serve frontend static files in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Health check (no auth)
app.get('/api/health', asyncHandler(async (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}));

// Auth routes (no auth required - used to establish auth)
app.use('/api', authLoginRoutes);

// Auth middleware for all /api routes
app.use('/api', authMiddleware);

// Mount routes
app.use('/api', accountRoutes);
app.use('/api', actionRoutes);
app.use('/api', taskRoutes);
app.use('/api', logRoutes);
app.use('/api', settingRoutes);
app.use('/api', platformRoutes);
app.use('/api', authRoutes);
app.use('/api', chatRoutes);
app.use('/api', statusRoutes);
app.use('/api', usageHistoryRoutes);

// SPA fallback: serve index.html for non-API routes
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Error handler
app.use((error, req, res, _next) => {
  const status = error.status || error.statusCode || 500;
  console.error(`[ERROR] ${req.method} ${req.path}:`, error.message);
  if (status === 500) console.error(error.stack);

  // Log to database asynchronously
  try {
    db.prepare(
      `INSERT INTO logs (id, account_id, level, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(crypto.randomUUID(), null, 'error', `[${req.method} ${req.path}] ${error.message}`);
    broadcast('error_logged', { method: req.method, path: req.path, message: error.message });
  } catch { }

  if (!res.headersSent) {
    res.status(status).json({ message: error.message || 'Unexpected server error' });
  }
});

let server;

async function start() {
  initDatabase();
  server = app.listen(config.port, () => {
    console.log(`API server listening on http://localhost:${config.port}`);
  });
  setupWebSocket(server);
  startTimers();
  startAuthFileWatcher();
}

async function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down server...`);
  stopTimers();
  stopAuthFileWatcher();
  if (server) {
    server.close(() => console.log('HTTP server closed'));
  }
  try {
    db.close();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing database:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
