import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import db from '../db.js';
import { asyncHandler } from '../utils/helpers.js';
import { broadcast } from '../ws.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_ACCOUNTS_DIR = path.join(PROJECT_ROOT, '..', 'accounts');

const router = express.Router();

let loginSession = {
  status: 'idle',
  message: '',
  output: '',
  newFile: null,
  error: null,
};
let loginProc = null;

async function resolveCodexBin() {
  const settingsRows = db.prepare('SELECT codex_path FROM settings WHERE id = 1').all();
  const fromSettings = (settingsRows[0]?.codex_path || '').trim();

  if (fromSettings) {
    try {
      await fs.access(fromSettings);
      return fromSettings;
    } catch { }
  }

  try {
    const { stdout } = await execAsync('which codex || command -v codex');
    const found = stdout.trim();
    if (found) return found;
  } catch { }

  return 'codex';
}

// POST /api/auth/codex-login
router.post('/auth/codex-login', asyncHandler(async (_req, res) => {
  if (loginProc) {
    return res.status(409).json({ message: 'Login process already running, please wait or cancel' });
  }

  const codexBin = await resolveCodexBin();

  const codexDir = path.join(os.homedir(), '.codex');
  let beforeFiles = new Set();
  try {
    const files = await fs.readdir(codexDir);
    for (const f of files) {
      const stat = await fs.stat(path.join(codexDir, f));
      beforeFiles.add(`${f}::${stat.mtimeMs}`);
    }
  } catch { }

  loginSession = { status: 'running', message: 'Starting codex login…', output: '', newFile: null, error: null };

  loginProc = spawn(codexBin, ['login'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, TERM: 'xterm' },
  });

  const appendOutput = (chunk) => {
    const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
    loginSession.output += text;
    const lines = loginSession.output.trim().split('\n').filter(Boolean);
    loginSession.message = lines[lines.length - 1] || '…';
  };

  loginProc.stdout.on('data', appendOutput);
  loginProc.stderr.on('data', appendOutput);

  loginProc.on('error', (err) => {
    loginProc = null;
    loginSession = { status: 'error', message: `Cannot start codex: ${err.message}`, output: loginSession.output, newFile: null, error: err.message };
  });

  loginProc.on('exit', async (code) => {
    loginProc = null;
    if (code !== 0) {
      loginSession = { status: 'error', message: `Login failed (exit ${code})`, output: loginSession.output, newFile: null, error: `exit ${code}` };
      return;
    }

    try {
      await fs.mkdir(codexDir, { recursive: true });
      const afterFiles = await fs.readdir(codexDir);
      let newFile = null;

      for (const f of afterFiles) {
        if (!f.endsWith('.json')) continue;
        const stat = await fs.stat(path.join(codexDir, f));
        if (!beforeFiles.has(`${f}::${stat.mtimeMs}`)) {
          newFile = f;
          break;
        }
      }

      if (newFile) {
        await fs.mkdir(PROJECT_ACCOUNTS_DIR, { recursive: true });
        const src = path.join(codexDir, newFile);

        // Generate a unique destination name so repeated logins don't overwrite existing accounts
        const baseName = newFile.replace(/\.json$/, '');
        let destName = newFile;
        let dest = path.join(PROJECT_ACCOUNTS_DIR, destName);
        let counter = 2;
        while (fsSync.existsSync(dest)) {
          destName = `${baseName}_${counter}.json`;
          dest = path.join(PROJECT_ACCOUNTS_DIR, destName);
          counter++;
        }

        await fs.copyFile(src, dest);
        loginSession = { status: 'success', message: `Login successful! Saved ${destName}`, output: loginSession.output, newFile: destName, error: null };
      } else {
        loginSession = { status: 'success', message: 'Login successful! Please manually copy ~/.codex/auth.json to accounts/', output: loginSession.output, newFile: null, error: null };
      }
    } catch (e) {
      loginSession = { status: 'success', message: 'Login successful (file copy failed, please handle manually)', output: loginSession.output, newFile: null, error: e.message };
    }

    broadcast('login_completed', { status: loginSession.status, newFile: loginSession.newFile });
  });

  res.json({ ok: true });
}));

// GET /api/auth/codex-login/status
router.get('/auth/codex-login/status', asyncHandler(async (_req, res) => {
  res.json(loginSession);
}));

// DELETE /api/auth/codex-login
router.delete('/auth/codex-login', asyncHandler(async (_req, res) => {
  if (loginProc) {
    loginProc.kill('SIGTERM');
    loginProc = null;
  }
  loginSession = { status: 'idle', message: '', output: '', newFile: null, error: null };
  res.json({ ok: true });
}));

export default router;
