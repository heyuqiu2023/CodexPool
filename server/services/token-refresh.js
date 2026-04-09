import fs from 'fs/promises';
import { expandPath, decodeJwtPayload, createLog } from '../utils/helpers.js';

export async function refreshTokenForAuthFile(authFilePath) {
  const fullPath = expandPath(authFilePath);

  let authData;
  try {
    authData = JSON.parse(await fs.readFile(fullPath, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `Cannot read auth file: ${err.message}` };
  }

  const refreshToken = authData.tokens?.refresh_token;
  if (!refreshToken) {
    return { ok: false, reason: 'No refresh_token, need manual re-login' };
  }

  let clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const existingPayload = decodeJwtPayload(authData.tokens?.access_token);
  if (existingPayload?.client_id) {
    clientId = existingPayload.client_id;
  }

  try {
    const resp = await fetch('https://auth.openai.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      return { ok: false, reason: `Auth endpoint returned ${resp.status}: ${errBody}` };
    }

    const data = await resp.json();

    if (!data.access_token) {
      return { ok: false, reason: 'No access_token in response' };
    }

    authData.tokens.access_token = data.access_token;
    if (data.refresh_token) {
      authData.tokens.refresh_token = data.refresh_token;
    }
    if (data.id_token) {
      authData.tokens.id_token = data.id_token;
    }
    authData.last_refresh = new Date().toISOString();

    await fs.writeFile(fullPath, JSON.stringify(authData, null, 2));

    const newPayload = decodeJwtPayload(data.access_token);
    const newExpiresAt = newPayload?.exp
      ? new Date(newPayload.exp * 1000).toISOString()
      : null;

    return { ok: true, newExpiresAt };
  } catch (err) {
    return { ok: false, reason: `Network request failed: ${err.message}` };
  }
}

export { createLog };
