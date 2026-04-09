import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import db from '../db.js';
import { asyncHandler, expandPath } from '../utils/helpers.js';
import { createLog } from '../utils/helpers.js';
import { broadcast } from '../ws.js';

const router = express.Router();

// POST /api/chat
router.post('/chat', asyncHandler(async (req, res) => {
  const { messages = [], system = '' } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages cannot be empty' });
  }

  const account = db.prepare("SELECT * FROM accounts WHERE is_current = 1 LIMIT 1").get();
  if (!account) {
    return res.status(404).json({ error: 'No active account, please set current account in CodexPool' });
  }
  let accessToken;
  try {
    const authData = JSON.parse(await fs.readFile(expandPath(account.auth_file_path), 'utf8'));
    accessToken = authData.tokens?.access_token || authData.access_token;
  } catch (e) {
    return res.status(500).json({ error: `Cannot read auth file: ${e.message}` });
  }

  if (!accessToken) {
    return res.status(400).json({ error: 'auth file missing access_token, please re-login' });
  }

  const inputMessages = [];
  if (system) {
    inputMessages.push({ role: 'system', content: system });
  }
  for (const m of messages) {
    inputMessages.push({ role: m.role, content: m.content });
  }

  let gatewayToken = '';
  let gatewayPort = 18789;
  try {
    const openclawConfig = JSON.parse(await fs.readFile(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8'));
    gatewayPort = openclawConfig.gateway?.port || 18789;
    gatewayToken = openclawConfig.gateway?.auth?.token || '';
  } catch { }

  let content = '';
  let lastError = '';

  // Try OpenClaw gateway first
  if (gatewayToken) {
    const gatewayUrls = [
      `http://127.0.0.1:${gatewayPort}/v1/responses`,
      `http://127.0.0.1:${gatewayPort}/__openclaw__/v1/responses`,
      `http://127.0.0.1:${gatewayPort}/api/v1/responses`,
    ];

    for (const url of gatewayUrls) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gatewayToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: 'gpt-4o', input: inputMessages, stream: false }),
          signal: AbortSignal.timeout(60000),
        });

        if (r.ok) {
          const data = await r.json();
          for (const item of (data.output || [])) {
            if (item.type === 'message' && item.role === 'assistant') {
              for (const part of (item.content || [])) {
                if (part.type === 'output_text' && part.text) content += part.text;
              }
            }
          }
          if (content) break;
        }

        if (r.status !== 404) {
          lastError = `gateway ${url} → ${r.status}`;
        }
      } catch (e) {
        // Gateway not running
      }
    }
  }

  // Fallback to direct API call
  if (!content) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: inputMessages }),
        signal: AbortSignal.timeout(60000),
      });

      if (r.ok) {
        const data = await r.json();
        content = data.choices?.[0]?.message?.content || '';
      } else {
        const errData = await r.json().catch(() => ({}));
        lastError = errData.error?.message || `HTTP ${r.status}`;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!content) {
    const hint = lastError.includes('quota')
      ? '. OpenAI API quota exhausted, please recharge or ensure OpenClaw is running'
      : lastError.includes('scope')
      ? '. Token lacks permissions, please ensure OpenClaw is running'
      : '';
    return res.status(502).json({ error: `Request failed: ${lastError}${hint}` });
  }

  await createLog({ accountId: account.id, message: `[Xiao Longxia Chat] Called successfully, replied ${content.length} chars` });
  res.json({ ok: true, content, account_id: account.account_id });
  broadcast('chat_completed', { accountId: account.id, contentLength: content.length });
}));

export default router;
