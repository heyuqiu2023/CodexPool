import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

export async function getOpenClawGatewayConfig() {
  try {
    const data = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(data);
    return {
      port: cfg.gateway?.port || 18789,
      token: cfg.gateway?.auth?.token || '',
    };
  } catch {
    return { port: 18789, token: '' };
  }
}

export async function reloadOpenClaw() {
  const gw = await getOpenClawGatewayConfig();

  // 1. Try Gateway API first (soft reload)
  try {
    const resp = await fetch(`http://127.0.0.1:${gw.port}/api/auth/reload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gw.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      return { ok: true, method: 'gateway_api' };
    }
  } catch { }

  // 2. Try SIGHUP signal
  try {
    const { stdout } = await execAsync("pgrep -f 'openclaw-gateway'");
    const pids = stdout.trim().split('\n').filter(Boolean);
    if (pids.length > 0) {
      for (const pid of pids) {
        await execAsync(`kill -HUP ${pid.trim()}`);
      }
      return { ok: true, method: 'sighup', pids };
    }
  } catch { }

  // 3. Fallback: restart process
  return restartOpenClawProcess();
}

export async function restartOpenClawProcess() {
  try {
    const { stdout } = await execAsync("pgrep -f 'openclaw-gateway' || pgrep -f 'openclaw.*main' || pgrep -f 'openclaw serve' || pgrep -f 'openclaw$'");
    const pids = stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      return { ok: false, reason: 'openclaw_not_running' };
    }

    for (const pid of pids) {
      try {
        await execAsync(`kill -TERM ${pid.trim()}`);
      } catch { }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      exec('nohup openclaw-gateway &>/dev/null &');
      return { ok: true, method: 'process_restart', pids };
    } catch {
      return { ok: true, method: 'process_killed', pids, note: 'OpenClaw process terminated, please restart manually' };
    }
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
