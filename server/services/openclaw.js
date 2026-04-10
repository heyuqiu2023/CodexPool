import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const isWindows = os.platform() === 'win32';

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

// 跨平台：查找 OpenClaw 进程 PID
async function findOpenClawPids() {
  try {
    if (isWindows) {
      // Windows 用 wmic/tasklist 查找进程
      const { stdout } = await execAsync(
        'wmic process where "name like \'%openclaw%\'" get ProcessId /format:list 2>nul || tasklist /FI "IMAGENAME eq openclaw-gateway.exe" /FO CSV /NH 2>nul'
      );
      const pids = [];
      // wmic 格式: ProcessId=1234
      for (const match of stdout.matchAll(/ProcessId=(\d+)/g)) {
        pids.push(match[1]);
      }
      if (pids.length === 0) {
        // tasklist CSV 格式: "openclaw-gateway.exe","1234",...
        for (const match of stdout.matchAll(/"[^"]*openclaw[^"]*","(\d+)"/gi)) {
          pids.push(match[1]);
        }
      }
      return pids.filter(Boolean);
    } else {
      const { stdout } = await execAsync(
        "pgrep -f 'openclaw-gateway' || pgrep -f 'openclaw.*main' || pgrep -f 'openclaw serve' || pgrep -f 'openclaw$'"
      );
      return stdout.trim().split('\n').filter(Boolean);
    }
  } catch {
    return [];
  }
}

// 跨平台：终止进程
async function killPid(pid, signal = 'TERM') {
  try {
    if (isWindows) {
      await execAsync(`taskkill /PID ${pid} /F`);
    } else {
      await execAsync(`kill -${signal} ${pid.trim()}`);
    }
  } catch { }
}

export async function reloadOpenClaw() {
  const gw = await getOpenClawGatewayConfig();

  // 1. Try Gateway API first (soft reload) — 跨平台通用
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

  // 2. Try SIGHUP signal (Linux/Mac only, Windows skip)
  if (!isWindows) {
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
  }

  // 3. Fallback: restart process
  return restartOpenClawProcess();
}

export async function restartOpenClawProcess() {
  try {
    const pids = await findOpenClawPids();

    if (pids.length === 0) {
      return { ok: false, reason: 'openclaw_not_running' };
    }

    for (const pid of pids) {
      await killPid(pid, 'TERM');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      if (isWindows) {
        exec('start /B openclaw-gateway.exe', { windowsHide: true });
      } else {
        exec('nohup openclaw-gateway &>/dev/null &');
      }
      return { ok: true, method: 'process_restart', pids };
    } catch {
      return { ok: true, method: 'process_killed', pids, note: 'OpenClaw process terminated, please restart manually' };
    }
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
