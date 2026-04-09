import { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { AccountGrid } from '@/components/AccountGrid';
import { DouyinPromo } from '@/components/DouyinPromo';
import { Account, LogEntry, PoolSettings, LiveUsageData } from '@/types';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const Index = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [batchUsageMap, setBatchUsageMap] = useState<Record<string, LiveUsageData>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<PoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenRefreshKey, setTokenRefreshKey] = useState(0);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const { t } = useI18n();

  // Settings debounce：300ms 内多次变更只保存最后一次
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDashboard = async () => {
    const [nextAccounts, nextLogs, nextSettings] = await Promise.all([
      api.listAccounts(),
      api.listLogs({ limit: 20 }), // 只拉最近 20 条给侧边栏用
      api.getSettings(),
    ]);
    setAccounts(nextAccounts);
    setLogs(nextLogs);
    setSettings(nextSettings);
  };

  useEffect(() => {
    loadDashboard()
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  // ── 自动轮询：每 30 秒静默刷新账号状态 + 日志 + 图表 ──
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadDashboard().catch(() => {/* 静默失败，不打扰用户 */});
      setChartRefreshKey(k => k + 1);
    }, 30_000);
    return () => clearInterval(pollInterval);
  }, []);

  const currentAccount = accounts.find((account) => account.is_current);

  // ── 账号操作：直接传 action，不再让父组件猜 ──

  const handleAccountAction = useCallback(async (action: 'setActive' | 'pause' | 'reset', id: string) => {
    try {
      await api.updateAccountAction(id, action);
      await loadDashboard();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, []);

  const handleAccountRemove = useCallback(async (id: string) => {
    try {
      await api.deleteAccount(id);
      await loadDashboard();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, []);

  const handleAccountAdded = useCallback(async () => {
    await loadDashboard();
  }, []);

  const handleClearAll = useCallback(async () => {
    try {
      await api.clearAllAccounts();
      await loadDashboard();
      toast.success(t('toast.allCleared'));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [t]);

  // ── Settings：debounce 保存 ──

  const handleSettingsChange = useCallback((nextSettings: PoolSettings) => {
    setSettings(nextSettings);
    // 清除之前的定时器
    if (settingsTimerRef.current) {
      clearTimeout(settingsTimerRef.current);
    }
    // 300ms 后才真正发送请求
    settingsTimerRef.current = setTimeout(async () => {
      try {
        await api.updateSettings(nextSettings);
      } catch (error) {
        toast.error((error as Error).message);
      }
    }, 300);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    };
  }, []);

  const handleRotateNow = async () => {
    try {
      const account = await api.rotateNow();
      await loadDashboard();
      toast.success(`Rotated to ${account.account_id}`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handlePauseAll = async () => {
    try {
      await api.pauseAll();
      await loadDashboard();
      toast.warning('All accounts paused');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleHealthCheck = async () => {
    try {
      const result = await api.healthCheck();
      await loadDashboard();
      toast.success(`Health check completed for ${result.totalAccounts} accounts`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleCheckAllUsage = async () => {
    try {
      toast.info('正在检测所有账号用量…');
      const results = await Promise.allSettled(
        accounts.map(a => api.checkAccountUsage(a.id))
      );
      const next: Record<string, LiveUsageData> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const v = r.value;
          next[accounts[i].id] = {
            ok: v.ok, fetched_at: v.fetched_at, plan_type: v.plan_type,
            primary: v.primary, secondary: v.secondary, error: v.error,
          };
        }
      });
      setBatchUsageMap({ ...next }); // new object reference triggers AccountGrid effect
      setChartRefreshKey(k => k + 1); // 刷新趋势图
      const ok = Object.values(next).filter(u => u.ok).length;
      toast.success(`${ok}/${accounts.length} 个账号检测成功`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleRefreshAllTokens = async () => {
    try {
      toast.info('正在批量刷新 Token...');
      const result = await api.refreshAllTokens();
      await loadDashboard();
      setTokenRefreshKey(k => k + 1);
      if (result.success === result.total) {
        toast.success(`全部 ${result.total} 个账号 Token 刷新成功`);
      } else {
        toast.warning(`${result.success}/${result.total} 个账号刷新成功，${result.total - result.success} 个失败`);
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleRestartOpenClaw = async () => {
    try {
      const result = await api.restartOpenClaw();
      await loadDashboard();
      if (result.ok) {
        toast.success(`OpenClaw 已重载 (${result.method})`);
      } else {
        toast.error(`OpenClaw 重载失败: ${result.reason}`);
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (loading || !settings) {
    return <div className="h-screen grid place-items-center text-sm text-muted-foreground">{t('loading.dashboard')}</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      <DouyinPromo />
      <Header
        activeAccount={currentAccount?.account_id || 'None'}
        mode={settings.mode}
        onModeChange={(mode) => handleSettingsChange({ ...settings, mode })}
      />
      <div className="flex-1 flex min-h-0">
        <LeftSidebar currentAccount={currentAccount} accounts={accounts} recentLogs={logs} chartRefreshKey={chartRefreshKey} />
        <AccountGrid
          accounts={accounts}
          onAction={handleAccountAction}
          onRemove={handleAccountRemove}
          onAccountAdded={handleAccountAdded}
          onClearAll={handleClearAll}
          refreshKey={tokenRefreshKey}
          pushedUsageMap={batchUsageMap}
        />
        <RightSidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onRotateNow={handleRotateNow}
          onPauseAll={handlePauseAll}
          onHealthCheck={handleHealthCheck}
          onRestartOpenClaw={handleRestartOpenClaw}
          onRefreshAllTokens={handleRefreshAllTokens}
          onCheckAllUsage={handleCheckAllUsage}
          onClearAll={handleClearAll}
          accountCount={accounts.length}
        />
      </div>
    </div>
  );
};

export default Index;
