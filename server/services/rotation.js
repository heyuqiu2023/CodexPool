import db from '../db.js';
import { switchAuthFile, syncOpenClawAuth, setExpectedAccountId } from './auth-file.js';
import { reloadOpenClaw } from './openclaw.js';
import { expandPath, decodeJwtPayload, createLog } from '../utils/helpers.js';
import fs from 'fs/promises';
import { broadcast } from '../ws.js';

export function pickNextAccount(allAccounts, currentId, strategy = 'round_robin') {
  const candidates = allAccounts.filter(a => a.id !== currentId && a.status !== 'error');
  if (candidates.length === 0) return null;

  switch (strategy) {
    case 'least_used': {
      candidates.sort((a, b) => a.tokens_used_percent - b.tokens_used_percent);
      return candidates[0];
    }
    case 'random': {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    case 'priority_based': {
      const typeOrder = { team: 0, plus: 1, free: 2 };
      candidates.sort((a, b) => {
        const typeDiff = (typeOrder[a.auth_type] ?? 9) - (typeOrder[b.auth_type] ?? 9);
        return typeDiff !== 0 ? typeDiff : a.tokens_used_percent - b.tokens_used_percent;
      });
      return candidates[0];
    }
    case 'round_robin':
    default: {
      const idx = allAccounts.findIndex(a => a.id === currentId);
      for (let i = 1; i <= allAccounts.length; i++) {
        const next = allAccounts[(idx + i) % allAccounts.length];
        if (next.id !== currentId && next.status !== 'error') return next;
      }
      return candidates[0];
    }
  }
}

export async function performAccountSwitch(nextAccount, reason) {
  await switchAuthFile(nextAccount.auth_file_path);

  // Use transaction to ensure both updates are atomic
  const switchTransaction = db.transaction((accountId) => {
    db.prepare("UPDATE accounts SET is_current = 0, status = CASE WHEN status = 'active' THEN 'idle' ELSE status END, updated_at = datetime('now')").run();
    db.prepare("UPDATE accounts SET is_current = 1, status = 'active', updated_at = datetime('now') WHERE id = ?").run(accountId);
  });
  switchTransaction(nextAccount.id);
  await createLog({ accountId: nextAccount.id, message: reason });

  try {
    const authFilePath = expandPath(nextAccount.auth_file_path);
    const authData = JSON.parse(await fs.readFile(authFilePath, 'utf8'));
    const payload = decodeJwtPayload(authData.tokens?.access_token);
    const accId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;
    if (accId) setExpectedAccountId(accId);
  } catch { }

  const reloadResult = await reloadOpenClaw();
  if (reloadResult.ok) {
    await createLog({ accountId: nextAccount.id, message: `[OpenClaw] Reloaded (${reloadResult.method})` });
  } else {
    await createLog({ accountId: nextAccount.id, level: 'warn', message: `[OpenClaw] Reload failed: ${reloadResult.reason}` });
  }
}
