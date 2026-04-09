import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import db from '../db.js';
import { expandPath, decodeJwtPayload, createLog } from '../utils/helpers.js';

const OPENCLAW_AUTH_PATH = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');

let expectedAccountId = null;
let authFileWatcher = null;

export function setExpectedAccountId(accountId) {
  expectedAccountId = accountId;
}

export async function switchAuthFile(authFilePath) {
  if (!authFilePath) return { ok: false, reason: 'auth_file_path is empty' };

  const src = expandPath(authFilePath);
  const defaultAuthDir = path.join(os.homedir(), '.codex');
  const dest = path.join(defaultAuthDir, 'auth.json');

  try {
    await fs.access(src);
    await fs.mkdir(defaultAuthDir, { recursive: true });
    await fs.copyFile(src, dest);

    const openclawResult = await syncOpenClawAuth(src);
    return { ok: true, dest, openclaw: openclawResult };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function syncOpenClawAuth(authFileSrc) {
  try {
    await fs.access(OPENCLAW_AUTH_PATH);
  } catch {
    return { ok: false, reason: 'openclaw auth-profiles.json does not exist' };
  }

  try {
    const authData = JSON.parse(await fs.readFile(authFileSrc, 'utf8'));
    const accessToken = authData.tokens?.access_token;
    const refreshToken = authData.tokens?.refresh_token;
    if (!accessToken) return { ok: false, reason: 'no access_token in auth file' };

    const payload = decodeJwtPayload(accessToken);
    const accountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id ?? null;
    const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + 864000000;

    const profiles = JSON.parse(await fs.readFile(OPENCLAW_AUTH_PATH, 'utf8'));
    if (!profiles.profiles) profiles.profiles = {};

    const email = payload?.['https://api.openai.com/profile']?.email;
    const tokenData = {
      type: 'oauth',
      provider: 'openai-codex',
      access: accessToken,
      refresh: refreshToken || '',
      expires: expiresAt,
      accountId: accountId || '',
    };
    if (email) tokenData.email = email;

    // 1. 更新 openai-codex:default
    profiles.profiles['openai-codex:default'] = { ...tokenData };

    // 2. 同时更新 lastGood 指向的 profile（OpenClaw 优先使用 lastGood）
    const lastGoodKey = profiles.lastGood?.['openai-codex'];
    if (lastGoodKey && lastGoodKey !== 'openai-codex:default' && profiles.profiles[lastGoodKey]) {
      profiles.profiles[lastGoodKey] = { ...tokenData };
    }

    // 3. 把 lastGood 指向 default，确保 OpenClaw 下次也用这个
    if (!profiles.lastGood) profiles.lastGood = {};
    profiles.lastGood['openai-codex'] = 'openai-codex:default';

    // 4. 清除所有 openai-codex 相关 profile 的错误状态和冷却
    const codexProfileKeys = Object.keys(profiles.profiles).filter(k => k.startsWith('openai-codex:'));
    for (const key of codexProfileKeys) {
      if (profiles.usageStats?.[key]) {
        delete profiles.usageStats[key].cooldownUntil;
        delete profiles.usageStats[key].lastFailureAt;
        profiles.usageStats[key].errorCount = 0;
        profiles.usageStats[key].failureCounts = {};
      }
    }
    if (profiles.usageStats?.['openai:default']) {
      delete profiles.usageStats['openai:default'].cooldownUntil;
      delete profiles.usageStats['openai:default'].lastFailureAt;
      profiles.usageStats['openai:default'].errorCount = 0;
      profiles.usageStats['openai:default'].failureCounts = {};
    }

    await fs.writeFile(OPENCLAW_AUTH_PATH, JSON.stringify(profiles, null, 2));
    return { ok: true, email };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export function startAuthFileWatcher() {
  if (authFileWatcher) return;

  try {
    authFileWatcher = fsSync.watch(OPENCLAW_AUTH_PATH, { persistent: false }, async (eventType) => {
      if (eventType !== 'change' || !expectedAccountId) return;

      setTimeout(async () => {
        try {
          const data = await fs.readFile(OPENCLAW_AUTH_PATH, 'utf8');
          const profiles = JSON.parse(data);
          const currentToken = profiles.profiles?.['openai-codex:default']?.access;
          if (!currentToken) return;

          const payload = decodeJwtPayload(currentToken);
          const fileAccountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;

          if (fileAccountId && fileAccountId !== expectedAccountId) {
            console.warn(`[File Monitor] auth-profiles.json was overwritten! Expected=${expectedAccountId}, actual=${fileAccountId}, restoring...`);
            await createLog({
              level: 'warn',
              message: `[File Monitor] OpenClaw overwrote auth-profiles.json (${fileAccountId}), restoring`,
            });

            const activeRows = db.prepare("SELECT * FROM accounts WHERE is_current = 1 LIMIT 1").all();
            if (activeRows.length) {
              const authFilePath = expandPath(activeRows[0].auth_file_path);
              await syncOpenClawAuth(authFilePath);
              const { reloadOpenClaw } = await import('./openclaw.js');
              await reloadOpenClaw();
            }
          }
        } catch { }
      }, 500);
    });
    console.log('[File Monitor] Started monitoring auth-profiles.json');
  } catch (err) {
    console.warn('[File Monitor] Cannot monitor auth-profiles.json:', err.message);
  }
}

export function stopAuthFileWatcher() {
  if (authFileWatcher) {
    authFileWatcher.close();
    authFileWatcher = null;
  }
}
